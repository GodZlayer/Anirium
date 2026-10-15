package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestServiceMaterializesDistinctFilesThroughLocalTorrentPeer(t *testing.T) {
	payloads := map[string][]byte{"Show S01E03 720p.mkv": bytes.Repeat([]byte("version-a"), 8192), "Show S01E03 1080p.mp4": bytes.Repeat([]byte("version-b"), 8192), "Show S01E04.mkv": []byte("wrong episode")}
	testLocalTorrentPeerSources(t, payloads, nil)
}

func testLocalTorrentPeerSources(t *testing.T, payloads map[string][]byte, validate func(context.Context, *mediaInputCache, []string), factories ...func(context.Context) *mediaInputCache) {
	t.Helper()
	dataDir := t.TempDir()
	batch := filepath.Join(dataDir, "batch")
	if err := os.Mkdir(batch, 0700); err != nil {
		t.Fatal(err)
	}
	for name, data := range payloads {
		if err := os.WriteFile(filepath.Join(batch, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	info := metainfo.Info{PieceLength: 16 << 10}
	if err := info.BuildFromFilePath(batch); err != nil {
		t.Fatal(err)
	}
	encoded, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	mi := metainfo.MetaInfo{InfoBytes: encoded}
	newClient := func(dir string, seed bool) *torrent.Client {
		cfg := torrent.NewDefaultClientConfig()
		cfg.DataDir = dir
		cfg.Seed = seed
		cfg.NoDHT = true
		cfg.DisableTrackers = true
		cfg.DisablePEX = true
		cfg.DisableUTP = true
		cfg.DisableIPv6 = true
		cfg.NoDefaultPortForwarding = true
		cfg.ListenPort = 0
		cfg.ListenHost = func(string) string { return "127.0.0.1" }
		cfg.DropMutuallyCompletePeers = false
		factory := newManagedTorrentClient
		if !seed {
			factory = newBoundedRuntimeTorrentClient
		}
		client, closeClient, err := factory(cfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			closeClient()
			for name := range payloads {
				path := filepath.Join(dir, "batch", name)
				if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
					t.Errorf("closed client still holds %s: %v", path, err)
				}
			}
		})
		return client
	}
	seeder := newClient(dataDir, true)
	seeded, err := seeder.AddTorrent(&mi)
	if err != nil {
		t.Fatal(err)
	}
	seeded.VerifyData()
	select {
	case <-seeded.Complete().On():
	case <-time.After(15 * time.Second):
		t.Fatal("local seeder data not verified")
	}
	leecher := newClient(t.TempDir(), false)
	addresses := seeder.ListenAddrs()
	if len(addresses) == 0 {
		t.Fatal("local seeder has no listening address")
	}
	magnet := fmt.Sprintf("magnet:?xt=urn:btih:%s&x.pe=%s", mi.HashInfoBytes().HexString(), url.QueryEscape(addresses[0].String()))
	// Resolve the authorized remote minimal contract before touching torrent data.
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/manifest":
			json.NewEncoder(w).Encode(ProviderManifest{ID: "fixture.provider", Capabilities: []string{"magnet.search"}, Endpoints: map[string]string{"search": "/search"}, Search: MinimalProviderSearch{Parameter: "q", Response: "results", Fields: []string{"title", "link", "seeders", "leechers"}}})
		case "/search":
			if len(r.URL.Query()) != 1 || r.URL.Query().Get("q") == "" {
				t.Error("provider received semantic fields instead of q")
				http.Error(w, "invalid query", 400)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"results": []MinimalProviderResult{{Title: "Show Season 1 [01-12]", Link: magnet}, {Title: "Show Season 1 [01-12]", Link: magnet}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", provider.URL)
	searchCtx, searchCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer searchCancel()
	servers := []ProviderServer{{ID: "fixture.provider", Enabled: true, ManifestURL: provider.URL + "/manifest"}}
	query := PlaybackPrepareRequest{Title: "Show", Season: 1, Episode: 3}
	if results := searchProviderServersSubset(query, searchCtx, servers); len(results) != 0 {
		t.Fatal("unauthorized provider used")
	}
	query.AuthorizedAddonIDs = []string{"fixture.provider"}
	results := searchProviderServersSubset(query, searchCtx, servers)
	if len(results) != 1 || results[0].InfoHash != mi.HashInfoBytes().HexString() {
		t.Fatalf("minimal provider result: %+v", results)
	}
	pooled := pooledMagnets(append(results, results...))
	if len(pooled) != 1 {
		t.Fatal("peer magnet was not deduplicated")
	}
	magnet = pooled[0]
	_, err = leecher.AddMagnet(magnet)
	if err != nil {
		t.Fatal(err)
	}
	swarmMu.Lock()
	oldClient, oldGeneration, oldLinks := torrentClient, playbackGeneration, activeLinks
	torrentClient = leecher
	playbackGeneration = 78
	swarmMu.Unlock()
	mediaSourceMu.Lock()
	oldSources := mediaSources
	mediaSources = map[string]mediaSource{}
	mediaSourceMu.Unlock()
	defer func() {
		swarmMu.Lock()
		torrentClient = oldClient
		playbackGeneration = oldGeneration
		activeLinks = oldLinks
		swarmMu.Unlock()
		mediaSourceMu.Lock()
		mediaSources = oldSources
		mediaSourceMu.Unlock()
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	ctx = context.WithValue(ctx, episodeContextKey{}, episodeContext{Episode: 3, Season: 1})
	ids := expandMediaSources(ctx, []string{magnet}, 78)
	if len(ids) != 2 {
		t.Fatalf("peer metadata expansion: %v", ids)
	}
	cache := newMediaInputCache(ctx, materializeVideo)
	if len(factories) > 0 {
		cache = factories[0](ctx)
	}
	if validate != nil {
		validate(ctx, cache, ids)
	}
	for index, id := range ids {
		path, release, err := cache.acquire(ctx, id, index)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(path, "http://") {
			defer os.Remove(path)
		}
		defer release()
		var content []byte
		if strings.HasPrefix(path, "http://") {
			request, _ := http.NewRequestWithContext(ctx, "GET", path, nil)
			response, requestErr := http.DefaultClient.Do(request)
			if requestErr != nil {
				t.Fatal(requestErr)
			}
			content, err = io.ReadAll(response.Body)
			response.Body.Close()
			if response.StatusCode != 200 {
				t.Fatalf("input status %d", response.StatusCode)
			}
		} else {
			content, err = os.ReadFile(path)
		}
		if err != nil {
			t.Fatal(err)
		}
		source := resolveMediaSource(id)
		if !bytes.Equal(content, payloads[filepath.Base(source.FilePath)]) {
			t.Fatalf("wrong transferred payload: %s got=%d expected=%d prefix=%.32s", source.FilePath, len(content), len(payloads[filepath.Base(source.FilePath)]), content)
		}
	}
	stats := leecher.ConnStats()
	if stats.BytesReadData.Int64() == 0 {
		t.Fatal("no real peer data transferred")
	}
}
