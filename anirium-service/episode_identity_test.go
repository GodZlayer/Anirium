package main

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestExactEpisodeIdentityRejectsAmbiguousCatalogMapping(t *testing.T) {
	regular := []identityEpisode{{"tt123:1:1", 1, 1}, {"tt123:1:2", 1, 2}, {"tt123:0:1", 0, 1}}
	if got := exactSingleSeasonEpisode("tt123", regular, 2, 2); got != "tt123:1:2" {
		t.Fatalf("exact episode: %q", got)
	}
	cases := [][]identityEpisode{
		regular[:1],
		{{"tt123:1:1", 1, 1}, {"tt123:2:2", 2, 2}},
		{{"tt123:1:1", 1, 1}, {"tt123:1:1", 1, 1}},
		{{"tt123:1:1", 1, 1}, {"tt999:1:2", 1, 2}},
		{{"tt123:1:1", 1, 1}, {"tt123:1:3", 1, 3}},
	}
	for _, videos := range cases {
		if exactSingleSeasonEpisode("tt123", videos, 2, 2) != "" {
			t.Fatal("incomplete, multi-season or conflicting mapping accepted")
		}
	}
}

func TestPublicCatalogEpisodeIdentityByMALID(t *testing.T) {
	if os.Getenv("ANIRIUM_TEST_PUBLIC_IDENTITY") != "1" {
		t.Skip("opt-in public identity lookup")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resolved := resolveSubtitleEpisodeIdentity(ctx, PlaybackPrepareRequest{MALID: 1, EpisodeCount: 26, Format: "TV", Episode: 1, Season: 99})
	if resolved.VideoID != "tt0213338:1:1" || resolved.MediaType != "series" || resolved.Season != 1 {
		t.Fatalf("public exact-ID lookup unavailable: video=%q type=%q", resolved.VideoID, resolved.MediaType)
	}
}
