package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPrepareWithoutSourcesDoesNotIssueTicketOrStartWorkers(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"authorized","level":2,"accountId":"fixture","playerSessionId":"fixture-player"}`))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	swarmMu.RLock()
	generation := playbackGeneration
	swarmMu.RUnlock()
	response := httptest.NewRecorder()
	newServiceHTTPHandler(0).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/playback/prepare", strings.NewReader(
		`{"title":"Fixture","season":1,"episode":1,"token":"fixture","deviceId":"fixture"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"status":"no-sources"`) || strings.Contains(response.Body.String(), "playbackTicket") {
		t.Fatalf("empty search started playback: %d %s", response.Code, response.Body.String())
	}
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if playbackGeneration != generation {
		t.Fatal("empty provider response changed playback generation")
	}
}

func TestRealPrepareHandlerRejectsPlaybackAfterShutdown(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"authorized","level":2,"accountId":"fixture","playerSessionId":"fixture-player"}`))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	preparePlaybackMu.Lock()
	previous := playbackShuttingDown
	playbackShuttingDown = true
	preparePlaybackMu.Unlock()
	defer func() {
		preparePlaybackMu.Lock()
		playbackShuttingDown = previous
		preparePlaybackMu.Unlock()
	}()
	swarmMu.RLock()
	generation := playbackGeneration
	swarmMu.RUnlock()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/playback/prepare", strings.NewReader(
		`{"title":"Fixture","season":1,"episode":1,"token":"fixture","deviceId":"fixture"}`))
	newServiceHTTPHandler(0).ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), "service_shutting_down") {
		t.Fatalf("shutdown preparation returned %d: %s", response.Code, response.Body.String())
	}
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if playbackGeneration != generation {
		t.Fatal("shutdown preparation started a new playback generation")
	}
}

func TestPlaybackPrepareRejectsInvalidEpisodeAndAmbiguousPayload(t *testing.T) {
	for _, payload := range []string{
		`{"title":"Show","season":1,"episode":0}`,
		`{"title":"Show","season":-1,"episode":1}`,
		`{"title":"  ","season":1,"episode":1}`,
		`{"title":"Show","season":1,"episode":1} {}`,
		`{"title":"Show","season":1,"episode":1,"magnet":"forbidden"}`,
		`{"title":"Show","season":1,"episode":1,"authorizedAddonIDs":["fixture"]}`,
		strings.Repeat(" ", (32<<10)+1),
	} {
		if _, err := decodePlaybackPrepare(strings.NewReader(payload)); err == nil {
			t.Fatalf("invalid payload accepted: %.100s", payload)
		}
	}
	input, err := decodePlaybackPrepare(strings.NewReader(`{"title":"  Show  ","season":1,"episode":2,"deviceId":"fixture","token":"fixture"}`))
	if err != nil || input.Title != "Show" || input.Episode != 2 {
		t.Fatalf("valid request rejected: %+v %v", input, err)
	}
}

func TestPrepareRejectsAuthorizationWithoutPlayerInstance(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"authorized","level":2,"accountId":"fixture"}`))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	swarmMu.RLock()
	generation := playbackGeneration
	swarmMu.RUnlock()
	response := httptest.NewRecorder()
	newServiceHTTPHandler(0).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/playback/prepare", strings.NewReader(
		`{"title":"Fixture","season":1,"episode":1,"token":"fixture","deviceId":"fixture"}`)))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("unbound authorization accepted: %d %s", response.Code, response.Body.String())
	}
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if playbackGeneration != generation {
		t.Fatal("unbound authorization initiated media processing")
	}
}
