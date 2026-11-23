package main

import (
	"context"
	"net/http"
	"os"
	"testing"
	"time"
)

// Explicit opt-in: fetches public manifests and stream metadata, never downloads media.
func TestLiveStremioStreamMetadata(t *testing.T) {
	if os.Getenv("ANIRIUM_LIVE_STREMIO") != "1" {
		t.Skip("public provider probe is opt-in")
	}
	for _, endpoint := range []string{"https://torrentio.strem.fun/manifest.json", "https://c5541ffce7d3-aniscraper.baby-beamup.club/manifest.json"} {
		t.Run(endpoint, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			server := ProviderServer{ID: remoteManifestReferenceID(endpoint), Kind: "remote-manifest", ManifestURL: endpoint, Enabled: true}
			store := newProviderSnapshotStore()
			query := PlaybackPrepareRequest{MALID: 21881, EpisodeCount: 24, Format: "TV", Episode: 1, Season: 1, Title: "Sword Art Online II", AuthorizedAddonIDs: []string{server.ID}, ManifestSnapshots: store}
			results := searchProviderServersSubset(query, ctx, []ProviderServer{server})
			if store.statusByID()[server.ID] != "ok" {
				req, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
				response, err := providerHTTPClient.Do(req)
				if err != nil {
					t.Logf("public manifest transport: %v", err)
				} else {
					t.Logf("public manifest HTTP status=%d", response.StatusCode)
					response.Body.Close()
				}
				t.Fatalf("manifest status=%s", store.statusByID()[server.ID])
			}
			t.Logf("provider=%s validated_torrent_sources=%d", server.ID, len(results))
		})
	}
}

func TestLiveStremioSubtitleMetadata(t *testing.T) {
	if os.Getenv("ANIRIUM_LIVE_STREMIO") != "1" {
		t.Skip("public provider probe is opt-in")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	query := PlaybackPrepareRequest{MALID: 21881, EpisodeCount: 24, Format: "TV", Episode: 1, Season: 1}
	query = resolveSubtitleEpisodeIdentity(ctx, query)
	if query.VideoID != "tt2250192:2:1" {
		t.Fatalf("exact episode mapping unavailable: %s", query.VideoID)
	}
	endpoint := "https://opensubtitles-v3.strem.io/manifest.json"
	server := ProviderServer{ID: remoteManifestReferenceID(endpoint), Kind: "remote-manifest", ManifestURL: endpoint, Enabled: true}
	query.AuthorizedAddonIDs = []string{server.ID}
	query.ManifestSnapshots = newProviderSnapshotStore()
	// Exercise the same unresolved catalog identity used by /playback/prepare.
	query.VideoID, query.MediaType = "", ""
	result := searchSubtitleProvidersSubset(query, ctx, []ProviderServer{server})
	if query.ManifestSnapshots.statusByID()[server.ID] != "ok" {
		t.Fatal("subtitle manifest unavailable")
	}
	t.Logf("exact_video=%s subtitle_candidates=%d", query.VideoID, len(result))
	if len(result) == 0 {
		t.Fatal("no subtitle candidates from the catalog identity")
	}
}
