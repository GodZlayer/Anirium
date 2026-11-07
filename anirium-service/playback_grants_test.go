package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPlaybackGrantCannotMoveBetweenPlayerInstances(t *testing.T) {
	player := "player-a"
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":%q}`, player)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("token-a", "device", "account", player)
	if err != nil || !validatePlaybackGrant(ticket) {
		t.Fatal("original player rejected")
	}
	if !renewPlaybackGrant(ticket, "renewed-a", "device") {
		t.Fatal("same player could not renew")
	}
	player = "player-b"
	if renewPlaybackGrant(ticket, "token-b", "device") || validatePlaybackGrant(ticket) {
		t.Fatal("second player took over the first player's media grant")
	}
	player = ""
	if renewPlaybackGrant(ticket, "legacy-token", "device") {
		t.Fatal("missing player identity bypassed an instance-bound grant")
	}
}

func TestPlaybackGrantRequiresLiveSession(t *testing.T) {
	valid := true
	account := "account"
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !valid {
			w.WriteHeader(401)
			return
		}
		fmt.Fprintf(w, `{"status":"authorized","level":2,"accountId":%q,"playerSessionId":"player"}`, account)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("fixture", "device", "account")
	if err != nil || !validatePlaybackGrant(ticket) {
		t.Fatal("valid grant failed")
	}
	if validatePlaybackGrant("unknown") {
		t.Fatal("unknown grant accepted")
	}
	if !renewPlaybackGrant(ticket, "renewed-token", "device") {
		t.Fatal("same-account renewal failed")
	}
	if renewPlaybackGrant(ticket, "renewed-token", "other-device") {
		t.Fatal("other device renewed grant")
	}
	account = "another-account"
	if validatePlaybackGrant(ticket) || renewPlaybackGrant(ticket, "other-token", "device") {
		t.Fatal("another account accepted an existing grant")
	}
	handler := newServiceHTTPHandler(0)
	for _, path := range []string{"/hls/mix/index.m3u8", "/hls/mix/segment.ts", "/subtitles"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path+"?playbackTicket="+ticket, nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("another account reached media route %s: %d", path, response.Code)
		}
	}
	account = "account"
	playlist := authorizePlaylist("#EXTM3U\n#EXTINF:4,\nsegment.ts\n", ticket)
	if !strings.Contains(playlist, "segment.ts?playbackTicket="+ticket) {
		t.Fatal("segment credential missing")
	}
	valid = false
	if renewPlaybackGrant(ticket, "renewed-token", "device") {
		t.Fatal("revoked session renewed grant")
	}
	if validatePlaybackGrant(ticket) {
		t.Fatal("revoked session accepted")
	}
	called := false
	handler = restrictLegacyPlayback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))
	for _, path := range []string{"/hls/mix/index.m3u8", "/hls/mix/segment.ts", "/subtitles"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 401 || called {
			t.Fatal("anonymous media accepted")
		}
	}
}
