package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

type streamMappingTransport func(*http.Request) (*http.Response, error)

func (f streamMappingTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestStremioKitsuIdentityRequiresExplicitMatchingWorkAndEpisode(t *testing.T) {
	previous := providerHTTPClient
	defer func() { providerHTTPClient = previous }()
	body := `{"mappings":{"mal_id":21881,"kitsu_id":8174},"episodes":{"16":{"episode":"16"}}}`
	providerHTTPClient = &http.Client{Transport: streamMappingTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.ani.zip" || r.URL.Query().Get("mal_id") != "21881" {
			t.Fatal("unexpected identity destination")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	var manifest ProviderManifest
	json.Unmarshal([]byte(`{"id":"fixture","types":["anime"],"resources":[{"name":"stream","types":["anime"],"idPrefixes":["kitsu"]}]}`), &manifest)
	query := PlaybackPrepareRequest{MALID: 21881, Episode: 16}
	if got := streamIdentity(context.Background(), manifest, query); got.ID != "kitsu:8174:16" {
		t.Fatalf("identity: %+v", got)
	}
	body = `{"mappings":{"mal_id":999,"kitsu_id":8174},"episodes":{"16":{"episode":"16"}}}`
	if streamIdentity(context.Background(), manifest, query).ID != "" {
		t.Fatal("contradicting MAL mapping accepted")
	}
	body = `{"mappings":{"mal_id":21881,"kitsu_id":8174},"episodes":{}}`
	if streamIdentity(context.Background(), manifest, query).ID != "" {
		t.Fatal("unknown episode invented")
	}
}

func TestStremioFileIndexSurvivesPoolAndConflictsAreNotGuessed(t *testing.T) {
	base := "magnet:?xt=urn:btih:0123456789012345678901234567890123456789"
	if got := pooledMagnets([]ProviderSearchResult{{Magnet: base}, {Magnet: base + "&so=2"}}); len(got) != 1 || !strings.Contains(got[0], "so=2") {
		t.Fatal("later explicit selection discarded")
	}
	if got := pooledMagnets([]ProviderSearchResult{{Magnet: base + "&so=1"}, {Magnet: base + "&so=2"}}); len(got) != 0 {
		t.Fatal("conflicting episode file selected")
	}
}

func TestStremioStreamAccountReferenceUsesConfiguredPathAndExactIdentity(t *testing.T) {
	var calls atomic.Int32
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.UserAgent() != "AniriumIntegration/2.3" {
			t.Errorf("provider client did not identify Anirium")
		}
		switch r.URL.Path {
		case "/config/manifest.json":
			fmt.Fprint(w, `{"id":"fixture.stremio","types":["anime"],"resources":[{"name":"stream","types":["anime"],"idPrefixes":["mal:"]}]}`)
		case "/config/stream/anime/mal:21881:16.json":
			calls.Add(1)
			fmt.Fprint(w, `{"streams":[{"infoHash":"0123456789012345678901234567890123456789","fileIdx":2,"title":"exact episode"},{"infoHash":"invalid"},{"infoHash":"0123456789012345678901234567890123456789","fileIdx":-1}]}`)
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	allowLocalProviderForTest(t, remote.URL)
	endpoint := remote.URL + "/config/manifest.json"
	server := ProviderServer{ID: remoteManifestReferenceID(endpoint), Kind: "remote-manifest", ManifestURL: endpoint, Enabled: true}
	query := PlaybackPrepareRequest{MALID: 21881, Episode: 16, Season: 1, AuthorizedAddonIDs: []string{server.ID}}
	results := searchProviderServersSubset(query, context.Background(), []ProviderServer{server})
	if len(results) != 1 || calls.Load() != 1 {
		t.Fatalf("stream adapter skipped/repeated: %d calls=%d", len(results), calls.Load())
	}
	magnets := pooledMagnets(results)
	uri, _ := url.Parse(magnets[0])
	if uri.Query().Get("so") != "2" {
		t.Fatal("explicit file index lost")
	}
	query.AuthorizedAddonIDs = nil
	if len(searchProviderServersSubset(query, context.Background(), []ProviderServer{server})) != 0 || calls.Load() != 1 {
		t.Fatal("uninstalled addon executed")
	}
}

func TestStremioStreamManifestFiltersRemainIndependentOfNativeCapabilities(t *testing.T) {
	var manifest ProviderManifest
	json.Unmarshal([]byte(`{"id":"fixture","types":["anime"],"resources":[{"name":"stream","types":["anime"],"idPrefixes":["kitsu:"]}]}`), &manifest)
	if !hasStremioStreams(manifest) || supportsStremioResource(manifest, "stream", "anime", "mal:1:1") || supportsStremioSubtitleResource(manifest, "series", "tt1:1:1") {
		t.Fatal("resource scope changed")
	}
}

func TestPlayerPrepareMetadataContractAcceptedButUnknownFieldsRejected(t *testing.T) {
	input, err := decodePlaybackPrepare(strings.NewReader(`{"title":"Work","season":1,"episode":1,"malId":21881,"episodeCount":24,"format":"TV","token":"fixture","deviceId":"fixture"}`))
	if err != nil || input.MALID != 21881 || input.EpisodeCount != 24 {
		t.Fatalf("current player contract rejected: %v", err)
	}
	if _, err := decodePlaybackPrepare(strings.NewReader(`{"title":"Work","season":1,"episode":1,"providerServers":[]}`)); err == nil {
		t.Fatal("player can inject providers")
	}
}

func TestStremioStreamFallsBackToVerifiedIMDbIdentityWhenKitsuMissing(t *testing.T) {
	previous := providerHTTPClient
	defer func() { providerHTTPClient = previous }()
	providerHTTPClient = &http.Client{Transport: streamMappingTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.ani.zip" || r.URL.Query().Get("mal_id") != "63045" {
			t.Fatalf("unexpected identity lookup host=%s query=%s", r.URL.Host, r.URL.RawQuery)
		}
		return &http.Response{
			StatusCode: 200,
			Body:       io.NopCloser(strings.NewReader(`{"mappings":{"mal_id":63045,"kitsu_id":null},"episodes":{}}`)),
			Header:     make(http.Header),
		}, nil
	})}

	var resolveCalls atomic.Int32
	snapshots := newProviderSnapshotStore()
	snapshots.resolveIdentity = func(_ context.Context, req PlaybackPrepareRequest) PlaybackPrepareRequest {
		resolveCalls.Add(1)
		req.VideoID = "tt41054228:1:4"
		req.MediaType = "series"
		req.Season = 1
		return req
	}

	var ttAndKitsuManifest ProviderManifest
	_ = json.Unmarshal([]byte(`{"id":"com.stremio.torrentio.addon","types":["movie","series","anime"],"resources":["stream"],"idPrefixes":["tt","kitsu"]}`), &ttAndKitsuManifest)

	var kitsuOnlyManifest ProviderManifest
	_ = json.Unmarshal([]byte(`{"id":"fixture.kitsu.only","types":["anime"],"resources":[{"name":"stream","types":["anime"],"idPrefixes":["kitsu:"]}]}`), &kitsuOnlyManifest)

	query := PlaybackPrepareRequest{
		MALID:             63045,
		Episode:           4,
		EpisodeCount:      4,
		Format:            "ONA",
		ManifestSnapshots: snapshots,
	}

	if got := streamIdentity(context.Background(), kitsuOnlyManifest, query); got.ID != "" || resolveCalls.Load() != 0 {
		t.Fatalf("kitsu-only manifest should return empty without resolving IMDb: got=%+v calls=%d", got, resolveCalls.Load())
	}

	got1 := streamIdentity(context.Background(), ttAndKitsuManifest, query)
	got2 := streamIdentity(context.Background(), ttAndKitsuManifest, query)
	if got1.Media != "series" || got1.ID != "tt41054228:1:4" || got2 != got1 {
		t.Fatalf("expected verified IMDb fallback tt41054228:1:4, got %+v / %+v", got1, got2)
	}
	if resolveCalls.Load() != 1 {
		t.Fatalf("expected single-flight episodeIdentity lookup (1 call), got %d", resolveCalls.Load())
	}
}
