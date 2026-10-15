package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAccountSubtitleCapabilitiesReachRemoteManifest(t *testing.T) {
	for _, capability := range []string{"subtitle.search", "subtitles.search"} {
		t.Run(capability, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/manifest" {
					json.NewEncoder(w).Encode(ProviderManifest{ID: "fixture.sub", Capabilities: []string{capability}, Endpoints: map[string]string{"subtitleSearch": "/search"}})
					return
				}
				fmt.Fprint(w, `{"subtitles":[{"season":1,"episode":1,"language":"eng","format":"srt","url":"/one.srt"},{"language":"eng","format":"srt","url":"/two.srt"},{"season":1,"episode":2,"language":"por","format":"srt","url":"/wrong-episode.srt"},{"season":2,"episode":1,"language":"por","format":"srt","url":"/wrong-season.srt"}]}`)
			}))
			defer server.Close()
			allowLocalProviderForTest(t, server.URL)
			config, _ := json.Marshal(map[string]any{"id": "fixture.sub", "capabilities": []string{capability}, "manifestUrl": server.URL + "/manifest"})
			auth := serviceAuthorization{AuthorizedAddonIDs: []string{"fixture.sub"}, InstalledAddons: []accountAddon{{ID: "fixture.sub", Config: config}}}
			servers := accountProviderServers(auth)
			results := searchSubtitleProvidersSubset(PlaybackPrepareRequest{Title: "Fixture", Season: 1, Episode: 1, AuthorizedAddonIDs: auth.AuthorizedAddonIDs}, context.Background(), servers)
			if len(servers) != 1 || len(results) != 2 || results[0].URL == results[1].URL {
				t.Fatalf("subtitle addon or same-language alternatives lost: %+v %+v", servers, results)
			}
		})
	}
}

func TestExternalSubtitleRejectsAnotherEpisodeOrSeason(t *testing.T) {
	query := PlaybackPrepareRequest{Season: 2, Episode: 3}
	for _, subtitle := range []ProviderSubtitle{{Season: 1, Episode: 3}, {Season: 2, Episode: 4}, {Season: -1}, {Episode: -3}} {
		if subtitleMatchesEpisode(subtitle, query) {
			t.Fatalf("incompatible subtitle accepted: %+v", subtitle)
		}
	}
	for _, subtitle := range []ProviderSubtitle{{}, {Season: 2}, {Episode: 3}, {Season: 2, Episode: 3}} {
		if !subtitleMatchesEpisode(subtitle, query) {
			t.Fatalf("episode-scoped subtitle rejected: %+v", subtitle)
		}
	}
}

func TestAuthorizedSubtitleProviderDiscoveryAndConversion(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		switch r.URL.Path {
		case "/manifest":
			fmt.Fprint(w, `{"id":"subtitles.fixture","capabilities":["subtitle.search"],"endpoints":{"subtitleSearch":"/search"}}`)
		case "/search":
			if r.URL.Query().Get("ep") != "3" || r.URL.Query().Get("season") != "1" || r.URL.Query().Get("titleEnglish") != "English fixture" || r.URL.Query().Get("titleRomaji") != "Romaji fixture" {
				t.Error("episode context missing")
			}
			fmt.Fprint(w, `{"subtitles":[{"language":"pt-BR","format":"srt","url":"/pt.srt"},{"language":"eng","format":"vtt","url":"https://unapproved.invalid/sub.vtt"},{"language":"eng","format":"pgs","url":"/unsupported.sup"}]}`)
		case "/pt.srt":
			fmt.Fprint(w, "1\n00:00:01,000 --> 00:00:02,000\nLegenda do provider\n")
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	allowLocalProviderForTest(t, server.URL)
	providerMu.Lock()
	old := providerServers
	providerServers = []ProviderServer{{ID: "subtitles.fixture", Enabled: true, ManifestURL: server.URL + "/manifest"}}
	providerMu.Unlock()
	defer func() { providerMu.Lock(); providerServers = old; providerMu.Unlock() }()
	query := PlaybackPrepareRequest{Title: "Fixture", TitleEnglish: "English fixture", TitleRomaji: "Romaji fixture", Episode: 3, Season: 1}
	if results := searchSubtitleProviders(query); len(results) != 0 || calls != 0 {
		t.Fatal("unauthorized provider contacted")
	}
	query.AuthorizedAddonIDs = []string{"subtitles.fixture"}
	results := searchSubtitleProviders(query)
	if len(results) != 1 || results[0].Language != "por" {
		t.Fatalf("invalid discovery: %+v", results)
	}
	content, err := externalSubtitleVTT(context.Background(), results[0])
	if err != nil || !strings.HasPrefix(content, "WEBVTT") || !strings.Contains(content, "00:01.000") || !strings.Contains(content, "Legenda do provider") {
		t.Fatalf("subtitle conversion: %s %v", content, err)
	}
}
