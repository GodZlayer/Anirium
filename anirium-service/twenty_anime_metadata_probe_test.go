package main

import (
	"context"
	"os"
	"testing"
	"time"
)

// Opt-in diagnosis: public metadata only; no media or account credentials.
func TestTwentyAnimeOnePieceStreamIdentity(t *testing.T) {
	if os.Getenv("ANIRIUM_LIVE_STREMIO") != "1" {
		t.Skip("public metadata probe is opt-in")
	}
	for _, endpoint := range []string{"https://torrentio.strem.fun/manifest.json", "https://c5541ffce7d3-aniscraper.baby-beamup.club/manifest.json"} {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		server := ProviderServer{ID: remoteManifestReferenceID(endpoint), Kind: "remote-manifest", ManifestURL: endpoint, Enabled: true}
		query := PlaybackPrepareRequest{MALID: 21, Episode: 1180, Season: 1, Title: "One Piece", Format: "TV", AuthorizedAddonIDs: []string{server.ID}, ManifestSnapshots: newProviderSnapshotStore()}
		if os.Getenv("ANIRIUM_PROBE_BLEACH") == "1" {
			query.MALID = 60636
			query.Episode = 9
			query.EpisodeCount = 10
			query.Title = "Bleach: Sennen Kessen-hen - Kashin-tan"
		}
		manifest, status := query.ManifestSnapshots.manifest(ctx, server)
		identity := streamIdentity(ctx, manifest, query)
		results := searchProviderServersSubset(query, ctx, []ProviderServer{server})
		t.Logf("provider=%s status=%s identity=%+v count=%d", server.ID, status, identity, len(results))
		for index, result := range results {
			if index >= 12 {
				break
			}
			title := result.Title
			if len(title) > 180 {
				title = title[:180]
			}
			t.Logf("candidate title=%q", title)
		}
		cancel()
	}
}
