package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
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

func TestExactAiringSingleSeasonEpisodeAcceptsContiguousAiringAndRejectsAmbiguity(t *testing.T) {
	airing26 := make([]identityEpisode, 0, 27)
	airing26 = append(airing26, identityEpisode{ID: "tt123:0:1", Season: 0, Episode: 1})
	for ep := 1; ep <= 26; ep++ {
		airing26 = append(airing26, identityEpisode{ID: fmt.Sprintf("tt123:1:%d", ep), Season: 1, Episode: ep})
	}
	if got := exactAiringSingleSeasonEpisode("tt123", airing26, 21, 21); got != "tt123:1:21" {
		t.Fatalf("expected airing ep 21 resolution, got %q", got)
	}
	if got := exactAiringSingleSeasonEpisode("tt123", airing26[:21], 21, 21); got != "" {
		t.Fatalf("accepted insufficient episode list: %q", got)
	}
	gapped := append(append([]identityEpisode(nil), airing26[:5]...), airing26[6:]...)
	if got := exactAiringSingleSeasonEpisode("tt123", gapped, 21, 21); got != "" {
		t.Fatalf("accepted gapped season: %q", got)
	}
	multiSeason := append(append([]identityEpisode(nil), airing26...), identityEpisode{ID: "tt123:2:1", Season: 2, Episode: 1})
	if got := exactAiringSingleSeasonEpisode("tt123", multiSeason, 21, 21); got != "" {
		t.Fatalf("accepted multi-season series: %q", got)
	}
}

func TestResolveSubtitleEpisodeIdentityFallsBackToCinemetaTitleSearch(t *testing.T) {
	previous := providerHTTPClient
	defer func() { providerHTTPClient = previous }()
	providerHTTPClient = &http.Client{Transport: streamMappingTransport(func(r *http.Request) (*http.Response, error) {
		switch {
		case r.URL.Host == "api.ani.zip", r.URL.Host == "query.wikidata.org":
			return &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}, nil
		case r.URL.Host == "v3-cinemeta.strem.io" && strings.HasPrefix(r.URL.Path, "/catalog/series/top/search="):
			body := `{"metas":[{"id":"tt9876543","type":"series","name":"Example Anime Title"}]}`
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		case r.URL.Host == "v3-cinemeta.strem.io" && r.URL.Path == "/meta/series/tt9876543.json":
			body := `{"meta":{"id":"tt9876543","type":"series","videos":[{"id":"tt9876543:1:1","season":1,"episode":1},{"id":"tt9876543:1:2","season":1,"episode":2}]}}`
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		default:
			return &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}, nil
		}
	})}
	resolved := resolveSubtitleEpisodeIdentity(context.Background(), PlaybackPrepareRequest{
		MALID:        64298,
		Title:        "Example Anime Title",
		Episode:      1,
		Season:       1,
		EpisodeCount: 2,
		Format:       "TV",
	})
	if resolved.VideoID != "tt9876543:1:1" || resolved.MediaType != "series" || resolved.Season != 1 {
		t.Fatalf("expected title fallback resolution tt9876543:1:1, got video=%q type=%q season=%d", resolved.VideoID, resolved.MediaType, resolved.Season)
	}
}
