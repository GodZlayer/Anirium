package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestCatalogContextComesOnlyFromTheConfiguredAuthenticatedCore(t *testing.T) {
	data := catalogContextFixture()
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/service/playback/context" || r.Header.Get("Authorization") != "Bearer fixture-token" || r.Header.Get("X-Anirium-Device") != "fixture-device" {
			t.Error("incorrect Core boundary")
		}
		var input map[string]string
		json.NewDecoder(r.Body).Decode(&input)
		if input["workId"] != data.WorkID || input["episodeId"] != data.EpisodeID || len(input) != 2 {
			t.Error("untrusted provider metadata forwarded to Core")
		}
		json.NewEncoder(w).Encode(data)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	input := PlaybackPrepareRequest{WorkID: data.WorkID, EpisodeID: data.EpisodeID, Token: "fixture-token", DeviceID: "fixture-device"}
	resolved, rejection := resolveCatalogPlaybackContext(context.Background(), input, serviceAuthorization{AccountID: data.AccountID, PlayerSessionID: data.PlayerSessionID})
	if rejection != nil || resolved.CatalogIdentity.WorkID != data.WorkID || resolved.Episode != 49 {
		t.Fatal("authorized context rejected")
	}
}

func TestCatalogContextRejectsOtherWorkEpisodeAccountOrPlayer(t *testing.T) {
	for _, field := range []string{"workId", "episodeId", "accountId", "playerSessionId"} {
		t.Run(field, func(t *testing.T) {
			data := catalogContextFixture()
			body, _ := json.Marshal(data)
			var payload map[string]any
			json.Unmarshal(body, &payload)
			payload[field] = "different-identity"
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { json.NewEncoder(w).Encode(payload) }))
			defer core.Close()
			t.Setenv("ANIRIUM_CORE_URL", core.URL)
			_, rejection := resolveCatalogPlaybackContext(context.Background(), PlaybackPrepareRequest{WorkID: data.WorkID, EpisodeID: data.EpisodeID}, serviceAuthorization{AccountID: data.AccountID, PlayerSessionID: data.PlayerSessionID})
			if rejection == nil {
				t.Fatal("foreign context accepted")
			}
		})
	}
}

func TestCatalogContextNeverFollowsCredentialRedirects(t *testing.T) {
	var forwarded atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { forwarded.Add(1) }))
	defer target.Close()
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	_, rejection := resolveCatalogPlaybackContext(context.Background(), PlaybackPrepareRequest{WorkID: fixtureCatalogWork, EpisodeID: fixtureCatalogEpisode, Token: "fixture-token"}, serviceAuthorization{})
	if rejection == nil || forwarded.Load() != 0 {
		t.Fatal("Core credential redirect followed")
	}
}
