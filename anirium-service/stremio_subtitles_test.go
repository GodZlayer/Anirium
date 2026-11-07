package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestStremioAccountSubtitleLookupAndCompleteConversion(t *testing.T) {
	searches := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			fmt.Fprint(w, `{"id":"org.stremio.fixture","resources":["subtitles"],"types":["series"],"idPrefixes":["tt"]}`)
		case "/subtitles/series/tt123:1:3.json":
			searches++
			fmt.Fprint(w, `{"subtitles":[{"id":"1","lang":"eng","url":"/download"},{"lang":"eng","url":"file:///secret"}]}`)
		case "/download":
			fmt.Fprint(w, "1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:20:01,000 --> 00:20:02,000\nLast\n")
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	allowLocalProviderForTest(t, server.URL)
	ref, ok := canonicalizeManifestURL(server.URL + "/manifest.json")
	if !ok {
		t.Fatal("fixture manifest invalid")
	}
	id := remoteManifestReferenceID(ref)
	query := PlaybackPrepareRequest{MediaType: "series", VideoID: "tt123:1:3", Season: 1, Episode: 3, AuthorizedAddonIDs: []string{id}}
	servers := []ProviderServer{{ID: id, Kind: "remote-manifest", Enabled: true, ManifestURL: ref}}
	tracks := searchSubtitleProvidersSubset(query, context.Background(), servers)
	if len(tracks) != 1 || searches != 1 || !tracks[0].stremio {
		t.Fatalf("SDK account lookup failed: tracks%d searches%d", len(tracks), searches)
	}
	vtt, err := externalSubtitleVTT(context.Background(), tracks[0])
	if err != nil || !strings.Contains(vtt, "First") || !strings.Contains(vtt, "Last") {
		t.Fatalf("complete conversion failed: %v", err)
	}
	query.VideoID = ""
	if len(searchSubtitleProvidersSubset(query, context.Background(), servers)) != 0 || searches != 1 {
		t.Fatal("missing identity guessed an episode")
	}
}

func TestPublicOpenSubtitlesSDKLookupAndDownload(t *testing.T) {
	if os.Getenv("ANIRIUM_TEST_PUBLIC_SUBTITLES") != "1" {
		t.Skip("explicit public integration run required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	manifestURL := "https://opensubtitles-v3.strem.io/manifest.json"
	id := remoteManifestReferenceID(manifestURL)
	query := PlaybackPrepareRequest{MediaType: "movie", VideoID: "tt1254207", AuthorizedAddonIDs: []string{id}}
	tracks := searchSubtitleProvidersSubset(query, ctx, []ProviderServer{{ID: id, Kind: "remote-manifest", Enabled: true, ManifestURL: manifestURL}})
	if len(tracks) == 0 {
		t.Fatal("public SDK returned no usable subtitles for canonical sample")
	}
	var lastErr error
	for _, track := range tracks {
		vtt, err := externalSubtitleVTT(ctx, track)
		if err == nil && strings.HasPrefix(strings.TrimSpace(vtt), "WEBVTT") && strings.Contains(vtt, "-->") {
			t.Logf("Public SDK lookup and complete subtitle conversion passed: %d tracks, %d output bytes", len(tracks), len(vtt))
			return
		}
		lastErr = err
	}
	// No URLs or remote payloads are printed: download links may carry tokens.
	_ = lastErr
	t.Fatal("public lookup succeeded but complete subtitle download/conversion failed")
}

func TestPublicOpenSubtitlesResolvedAnimeEpisode(t *testing.T) {
	if os.Getenv("ANIRIUM_TEST_PUBLIC_SUBTITLES") != "1" {
		t.Skip("explicit public integration run required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	manifestURL := "https://opensubtitles-v3.strem.io/manifest.json"
	id := remoteManifestReferenceID(manifestURL)
	query := PlaybackPrepareRequest{MALID: 1, EpisodeCount: 26, Format: "TV", Season: 99, Episode: 1, AuthorizedAddonIDs: []string{id}}
	tracks := searchSubtitleProvidersSubset(query, ctx, []ProviderServer{{ID: id, Kind: "remote-manifest", Enabled: true, ManifestURL: manifestURL}})
	if len(tracks) == 0 {
		t.Fatal("resolved anime episode returned no public subtitle tracks")
	}
	for _, track := range tracks {
		vtt, err := externalSubtitleVTT(ctx, track)
		if err != nil {
			continue
		}
		anchors := subtitleAlignmentAnchors(vtt)
		var lastEnd int64
		for _, anchor := range anchors {
			if anchor.end > lastEnd {
				lastEnd = anchor.end
			}
		}
		if len(anchors) >= 30 && lastEnd >= 600000 {
			t.Logf("Resolved anime episode: %d tracks, %d bytes, %d dialogue anchors, final anchor %.3fs", len(tracks), len(vtt), len(anchors), float64(lastEnd)/1000)
			return
		}
	}
	t.Fatal("public episode tracks did not yield a substantial complete subtitle")
}
