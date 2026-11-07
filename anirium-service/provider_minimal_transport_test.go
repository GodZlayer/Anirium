package main

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

const minimalFixedMagnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"
const minimalFixedHash = "0123456789abcdef0123456789abcdef01234567"

func minimalSearchServer(t *testing.T, payload string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("X-Anirium-Device") != "" || r.Header.Get("Cookie") != "" || strings.Contains(r.URL.String(), "fixture-account-secret") || strings.Contains(r.URL.String(), "fixture-device-secret") {
			t.Error("Core credentials reached minimal provider")
		}
		if r.URL.Query().Get("q") == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, payload)
	}))
	t.Cleanup(server.Close)
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", server.URL)
	return server
}

func TestSearchMinimalProviderIdentifiesCorrectMatch(t *testing.T) {
	payload := `{"results":[{"title":"Native Title S01E02 1080p","link":"` + minimalFixedMagnet + `","seeders":11,"leechers":3}]}`
	server := minimalSearchServer(t, payload)
	query := PlaybackPrepareRequest{Token: "fixture-account-secret", DeviceID: "fixture-device-secret", Title: "Native Title", Season: 1, Episode: 2}
	results := searchMinimalProvider(context.Background(), server.URL, "minimal", query)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	result := results[0]
	if result.Provider != "minimal" || result.Magnet != minimalFixedMagnet || result.InfoHash != minimalFixedHash || result.Seeders != 11 || result.Leechers != 3 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if result.Resolution != "" || result.Codec != "" {
		t.Fatalf("resolution/codec inferred from title: %+v", result)
	}
}

func TestSearchMinimalProviderAcceptsAliasReleaseVariants(t *testing.T) {
	payload := `{"results":[{"title":"English Alias - 02v2","link":"` + minimalFixedMagnet + `","seeders":7,"leechers":2},{"title":"Romaji Alias S01E02 1080p","link":"magnet:?xt=urn:btih:` + minimalFixedHash + `&dn=x","seeders":7,"leechers":2}]}`
	server := minimalSearchServer(t, payload)
	query := PlaybackPrepareRequest{Title: "Native Title", TitleEnglish: "English Alias", TitleRomaji: "Romaji Alias", Season: 1, Episode: 2}
	results := searchMinimalProvider(context.Background(), server.URL, "minimal", query)
	if len(results) != 1 {
		t.Fatalf("alias/release-variant rejected: %+v", results)
	}
	if results[0].Resolution != "" || results[0].Codec != "" {
		t.Fatalf("resolution/codec inferred from title: %+v", results[0])
	}
}

func TestSearchMinimalProviderRejectsWrongIdentityAndSeason(t *testing.T) {
	payload := `{"results":[{"title":"Other Show S01E02","link":"magnet:?xt=urn:btih:1111111111111111111111111111111111111111","seeders":5,"leechers":1},{"title":"Native Title S01E03","link":"magnet:?xt=urn:btih:2222222222222222222222222222222222222222","seeders":5,"leechers":1},{"title":"Native Title S02E02","link":"magnet:?xt=urn:btih:3333333333333333333333333333333333333333","seeders":5,"leechers":1},{"title":"Native Title Season 2 [01-12]","link":"magnet:?xt=urn:btih:4444444444444444444444444444444444444444","seeders":5,"leechers":1},{"title":"English Alias S02E02","link":"magnet:?xt=urn:btih:5555555555555555555555555555555555555555","seeders":5,"leechers":1},{"title":"Romaji Alias Season 2 [01-12]","link":"magnet:?xt=urn:btih:6666666666666666666666666666666666666666","seeders":5,"leechers":1}]}`
	server := minimalSearchServer(t, payload)
	query := PlaybackPrepareRequest{Title: "Native Title", TitleEnglish: "English Alias", TitleRomaji: "Romaji Alias", Season: 1, Episode: 2}
	if results := searchMinimalProvider(context.Background(), server.URL, "minimal", query); len(results) != 0 {
		t.Fatalf("wrong identity/season accepted: %+v", results)
	}
}

func TestSearchMinimalProviderAcceptsBatchRange(t *testing.T) {
	payload := `{"results":[{"title":"Native Title Season 1 [01-12]","link":"` + minimalFixedMagnet + `","seeders":20,"leechers":4}]}`
	server := minimalSearchServer(t, payload)
	query := PlaybackPrepareRequest{Title: "Native Title", Season: 1, Episode: 7}
	if results := searchMinimalProvider(context.Background(), server.URL, "minimal", query); len(results) != 1 {
		t.Fatalf("batch range rejected: %d", len(results))
	}
}

func TestSearchMinimalProviderDeduplicatesLinksAndHashes(t *testing.T) {
	payload := `{"results":[{"title":"Native Title S01E02","link":"` + minimalFixedMagnet + `","seeders":9,"leechers":1},{"title":"Native Title S01E02","link":"` + minimalFixedMagnet + `","seeders":9,"leechers":1},{"title":"Native Title S01E02","link":"magnet:?xt=urn:btih:` + minimalFixedHash + `&dn=duplicate","seeders":9,"leechers":1}]}`
	server := minimalSearchServer(t, payload)
	query := PlaybackPrepareRequest{Title: "Native Title", Season: 1, Episode: 2}
	if results := searchMinimalProvider(context.Background(), server.URL, "minimal", query); len(results) != 1 {
		t.Fatalf("duplicates not collapsed: %d", len(results))
	}
}

func TestSearchMinimalProviderCancellation(t *testing.T) {
	started := make(chan struct{}, 16)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started <- struct{}{}
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	defer server.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	query := PlaybackPrepareRequest{Title: "Native Title", Season: 1, Episode: 2}
	results := searchMinimalProvider(ctx, server.URL, "minimal", query)
	if len(results) != 0 {
		t.Fatalf("cancelled search returned results: %d", len(results))
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("search never reached provider")
	}
	preCancelled, cancelNow := context.WithCancel(context.Background())
	cancelNow()
	if got := searchMinimalProvider(preCancelled, server.URL, "minimal", query); len(got) != 0 {
		t.Fatal("pre-cancelled context returned results")
	}
}

func TestProviderLinkMagnetMinimalRejectsInvalidLinks(t *testing.T) {
	for _, link := range []string{
		"",
		"not-a-url",
		"ftp://example.com/file.torrent",
		"javascript:alert(1)",
		"http://user:pass@example.com/file.torrent",
		"https://example.com/file.torrent#frag",
		"magnet:?xt=urn:btih:nothex",
		"magnet:?xt=urn:btih:0123",
		"magnet:?dn=only-name",
	} {
		if magnet, hash, err := providerLinkMagnet(context.Background(), link); err == nil || magnet != "" || hash != "" {
			t.Errorf("invalid link accepted: %q -> %q %q", link, magnet, hash)
		}
	}
	if magnet, hash, err := providerLinkMagnet(context.Background(), minimalFixedMagnet); err != nil || magnet != minimalFixedMagnet || hash != minimalFixedHash {
		t.Fatalf("valid magnet rejected: %v %q %q", err, magnet, hash)
	}
}

func TestProviderLinkMagnetMinimalSyntheticTorrent(t *testing.T) {
	infoBytes, err := bencode.Marshal(metainfo.Info{Name: "Episode.mkv", Length: 10, PieceLength: 16, Pieces: make([]byte, 20)})
	if err != nil {
		t.Fatalf("marshal info: %v", err)
	}
	mi := metainfo.MetaInfo{InfoBytes: infoBytes}
	var buffer bytes.Buffer
	if err := mi.Write(&buffer); err != nil {
		t.Fatalf("write metainfo: %v", err)
	}
	raw := buffer.Bytes()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-bittorrent")
		w.Write(raw)
	}))
	defer server.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", server.URL)
	magnet, hash, err := providerLinkMagnet(context.Background(), server.URL+"/episode.torrent")
	if err != nil {
		t.Fatalf("synthetic torrent rejected: %v", err)
	}
	if hash != mi.HashInfoBytes().HexString() {
		t.Fatalf("hash mismatch: %q", hash)
	}
	if magnet == "" || hash == "" {
		t.Fatalf("empty magnet/hash: %q %q", magnet, hash)
	}
	serverInvalid := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not a torrent"))
	}))
	defer serverInvalid.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", serverInvalid.URL)
	if magnet, hash, err := providerLinkMagnet(context.Background(), serverInvalid.URL+"/bad.torrent"); err == nil || magnet != "" || hash != "" {
		t.Fatalf("invalid bytes accepted: %v %q %q", err, magnet, hash)
	}
}
