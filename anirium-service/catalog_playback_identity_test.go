package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

const fixtureCatalogWork = "00000000-0000-4000-8000-000000000001"
const fixtureCatalogEpisode = "00000000-0000-4000-8000-000000000002"
const fixtureCatalogSeason = "00000000-0000-4000-8000-000000000003"

func catalogContextFixture() corePlaybackContext {
	return corePlaybackContext{Schema: 1, WorkID: fixtureCatalogWork, EpisodeID: fixtureCatalogEpisode, SeasonID: fixtureCatalogSeason,
		AccountID: "fixture-account", PlayerSessionID: "fixture-player", Title: "Authoritative work", Episode: 49, Season: 2, Format: "TV", EpisodeCount: 50,
		References: []catalogExternalReference{{Provider: "kitsu", Namespace: "anime:work", ID: "700"}}}
}

func TestCatalogPrepareAcceptsOnlyValidEntityIDsAndKeepsProviderFieldsPrivate(t *testing.T) {
	input, err := decodePlaybackPrepare(strings.NewReader(`{"workId":"` + fixtureCatalogWork + `","episodeId":"` + fixtureCatalogEpisode + `","token":"fixture","deviceId":"fixture"}`))
	if err != nil || input.WorkID != fixtureCatalogWork || input.EpisodeID != fixtureCatalogEpisode {
		t.Fatalf("canonical request rejected: %v", err)
	}
	for _, body := range []string{
		`{"workId":"bad"}`, `{"episodeId":"` + fixtureCatalogEpisode + `"}`,
		`{"workId":"` + fixtureCatalogWork + `","kitsuId":700}`,
		`{"workId":"` + fixtureCatalogWork + `","catalogIdentity":{}}`,
	} {
		if _, err := decodePlaybackPrepare(strings.NewReader(body)); err == nil {
			t.Fatal("invalid or private catalog field accepted")
		}
	}
}

func TestCatalogContextOverridesPlayerMetadataAndSupportsStremioWithoutMAL(t *testing.T) {
	data := catalogContextFixture()
	input := PlaybackPrepareRequest{WorkID: fixtureCatalogWork, EpisodeID: fixtureCatalogEpisode, Title: "Spoof", MALID: 999, Episode: 1, Season: 99, VideoID: "tt999", MediaType: "movie"}
	resolved, err := applyCatalogPlaybackContext(input, data, serviceAuthorization{AccountID: data.AccountID, PlayerSessionID: data.PlayerSessionID})
	if err != nil || resolved.Title != data.Title || resolved.Episode != 49 || resolved.Season != 2 || resolved.MALID != 0 || resolved.VideoID != "" || resolved.CatalogIdentity.EpisodeID != fixtureCatalogEpisode {
		t.Fatalf("untrusted player metadata used: %v", err)
	}
	var manifest ProviderManifest
	json.Unmarshal([]byte(`{"id":"fixture","types":["anime"],"resources":[{"name":"stream","types":["anime"],"idPrefixes":["kitsu:"]}]}`), &manifest)
	if identity := streamIdentity(context.Background(), manifest, resolved); identity.ID != "kitsu:700:49" {
		t.Fatal("explicit Kitsu mapping lost without MAL")
	}
	data.References = append(data.References, catalogExternalReference{Provider: "mal", Namespace: "anime:work", ID: "1"}, catalogExternalReference{Provider: "mal", Namespace: "anime:work", ID: "2"})
	resolved, _ = applyCatalogPlaybackContext(input, data, serviceAuthorization{AccountID: data.AccountID, PlayerSessionID: data.PlayerSessionID})
	if resolved.MALID != 0 {
		t.Fatal("ambiguous external aliases selected arbitrarily")
	}
}

func TestCatalogMovieKeepsWorkIdentityWithoutAnEpisodeAndResetClearsTheOldIdentity(t *testing.T) {
	data := catalogContextFixture()
	data.EpisodeID, data.SeasonID, data.Format, data.Episode = "", "", "MOVIE", 1
	data.References = []catalogExternalReference{{Provider: "imdb", Namespace: "anime:work", ID: "tt1254207"}}
	resolved, err := applyCatalogPlaybackContext(PlaybackPrepareRequest{WorkID: data.WorkID}, data, serviceAuthorization{AccountID: data.AccountID, PlayerSessionID: data.PlayerSessionID})
	if err != nil || resolved.CatalogIdentity.EpisodeID != "" || resolved.VideoID != "tt1254207" || resolved.MediaType != "movie" {
		t.Fatalf("movie identity fabricated: %v", err)
	}
	swarmMu.Lock()
	currentCatalogIdentity = resolved.CatalogIdentity
	resetPlaybackLocked()
	cleared := currentCatalogIdentity.WorkID == ""
	swarmMu.Unlock()
	if !cleared {
		t.Fatal("previous catalog identity survived session reset")
	}
}
