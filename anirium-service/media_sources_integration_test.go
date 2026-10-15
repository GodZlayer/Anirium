package main

import (
	"context"
	"fmt"
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRealTorrentMetadataExpandsMatchingEpisodeVersions(t *testing.T) {
	dataDir := t.TempDir()
	batch := filepath.Join(dataDir, "batch")
	if err := os.Mkdir(batch, 0700); err != nil {
		t.Fatal(err)
	}
	lengths := map[string]int{"Show S01E03 720p.mkv": 71, "Show S01E03 1080p.mp4": 113, "Show S01E04.mkv": 251}
	for name, length := range lengths {
		if err := os.WriteFile(filepath.Join(batch, name), []byte(strings.Repeat("x", length)), 0600); err != nil {
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
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = dataDir
	cfg.NoDHT = true
	cfg.DisableTrackers = true
	cfg.DisablePEX = true
	cfg.DisableTCP = true
	cfg.DisableUTP = true
	cfg.NoDefaultPortForwarding = true
	cfg.ListenPort = 0
	client, err := torrent.NewClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	tor, err := client.AddTorrent(&mi)
	if err != nil {
		t.Fatal(err)
	}
	swarmMu.Lock()
	oldClient, oldGeneration, oldLinks := torrentClient, playbackGeneration, activeLinks
	torrentClient = client
	playbackGeneration = 77
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
	ctx := context.WithValue(context.Background(), episodeContextKey{}, episodeContext{Episode: 3, Season: 1})
	magnet := fmt.Sprintf("magnet:?xt=urn:btih:%s", mi.HashInfoBytes().HexString())
	ids := expandMediaSources(ctx, []string{magnet}, 77)
	if len(ids) != 2 {
		t.Fatalf("real torrent lost versions: %v", ids)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		file, err := selectSourceVideo(ctx, tor.Files(), id)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(file.DisplayPath(), "S01E03") {
			t.Fatal("wrong episode selected")
		}
		seen[file.DisplayPath()] = true
		if resolveMediaSource(id).Magnet != magnet {
			t.Fatal("torrent identity changed")
		}
		if got := resolveMediaSource(id).FileBytes; got != file.Length() || got != int64(lengths[filepath.Base(file.DisplayPath())]) {
			t.Fatalf("source weight is not the selected file's actual length: %d", got)
		}
	}
	if len(seen) != 2 {
		t.Fatal("two internal sources selected the same file")
	}
}
