package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type wsEnvelope struct {
	Event   string                 `json:"event"`
	Payload map[string]interface{} `json:"payload"`
	Status  string                 `json:"status"`
}

func readWSEventMatching(t *testing.T, conn *websocket.Conn, timeout time.Duration, match func(string, map[string]interface{}) bool) (string, map[string]interface{}) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(deadline)
		_, raw, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("ws read failed waiting for event: %v", err)
		}
		var env wsEnvelope
		if err := json.Unmarshal(raw, &env); err != nil {
			t.Fatalf("invalid ws json %q: %v", string(raw), err)
		}
		if match(env.Event, env.Payload) {
			return env.Event, env.Payload
		}
	}
	t.Fatal("timed out waiting for matching ws event")
	return "", nil
}

func TestWSOriginValidationAndSafeClose(t *testing.T) {
	cases := []struct {
		origin string
		allow  bool
	}{
		{"", true},
		{"http://localhost:8080", true},
		{"http://127.0.0.1:8080", true},
		{"https://untrusted.example", false},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/ws", nil)
		if tc.origin != "" {
			req.Header.Set("Origin", tc.origin)
		}
		if got := upgrader.CheckOrigin(req); got != tc.allow {
			t.Fatalf("CheckOrigin(%q) = %v, want %v", tc.origin, got, tc.allow)
		}
	}

	client := &wsClient{send: make(chan []byte, 4)}
	client.closeSend()
	client.closeSend() // idempotent
	client.sendEvent("pong", map[string]interface{}{"time": 1})
}

func TestWSPrepareAndRenewEnforceAuthorization(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer good-token" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"reason":"token_invalid"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"authorized","level":2,"accountId":"acc-ws-1","playerSessionId":"ps-ws-1"}`))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)

	srv := httptest.NewServer(http.HandlerFunc(handleWebSocket))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	headers := http.Header{}
	headers.Set("Origin", "http://localhost:8080")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial ws: %v", err)
	}
	defer conn.Close()

	readWSEventMatching(t, conn, 3*time.Second, func(ev string, _ map[string]interface{}) bool {
		return ev == "status"
	})

	if err := conn.WriteJSON(map[string]interface{}{
		"action":    "prepare",
		"requestId": "prep-bad-1",
		"token":     "bad-token",
		"deviceId":  "dev-1",
		"title":     "Test Anime",
		"season":    1,
		"episode":   1,
	}); err != nil {
		t.Fatal(err)
	}
	_, prepPayload := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "prepare_result" && p["requestId"] == "prep-bad-1"
	})
	if prepPayload["ok"] != false || prepPayload["statusCode"] != float64(401) || prepPayload["reason"] != "token_invalid" {
		t.Fatalf("expected 401 token_invalid prepare_result, got %+v", prepPayload)
	}

	if err := conn.WriteJSON(map[string]interface{}{
		"action":         "renew",
		"requestId":      "renew-bad-1",
		"playbackTicket": "bogus-ticket",
		"token":          "bad-token",
		"deviceId":       "dev-1",
	}); err != nil {
		t.Fatal(err)
	}
	_, badRenew := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "renew_result" && p["requestId"] == "renew-bad-1"
	})
	if badRenew["ok"] != false || badRenew["statusCode"] != float64(401) {
		t.Fatalf("expected 401 renew_result, got %+v", badRenew)
	}

	ticket, ticketErr := issuePlaybackGrant("good-token", "dev-1", "acc-ws-1", "ps-ws-1")
	if ticketErr != nil {
		t.Fatal(ticketErr)
	}
	defer func() {
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
	}()

	if err := conn.WriteJSON(map[string]interface{}{
		"action":         "renew",
		"requestId":      "renew-good-1",
		"playbackTicket": ticket,
		"token":          "good-token",
		"deviceId":       "dev-1",
	}); err != nil {
		t.Fatal(err)
	}
	_, goodRenew := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "renew_result" && p["requestId"] == "renew-good-1"
	})
	if goodRenew["ok"] != true || goodRenew["status"] != "authorized" {
		t.Fatalf("expected authorized renew_result, got %+v", goodRenew)
	}
}

func TestWSSubtitleGetAndProactivePush(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"authorized","level":2,"accountId":"acc-sub-1","playerSessionId":"ps-sub-1"}`))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)

	ticket, ticketErr := issuePlaybackGrant("sub-token", "dev-sub", "acc-sub-1", "ps-sub-1")
	if ticketErr != nil {
		t.Fatal(ticketErr)
	}
	defer func() {
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
	}()

	ctx, cancel := context.WithCancel(context.Background())
	cache := newMediaInputCache(ctx, nil)
	b := cache.bundle()
	releaseFull := make(chan struct{})
	track := SubtitleTrack{ID: "ws-sub-por", Source: "private-src", StreamIndex: 2, Language: "por"}
	b.configure("private-src", []SubtitleTrack{track}, 180)
	b.extractSpan = func(extractCtx context.Context, _ *mediaInputCache, _ string, _ []SubtitleTrack, start, span float64) map[int]string {
		if span < 60 {
			return map[int]string{2: "WEBVTT\n\n00:01.000 --> 00:03.000\nQuick WS cue\n"}
		}
		select {
		case <-releaseFull:
		case <-extractCtx.Done():
			return nil
		}
		return map[int]string{2: "WEBVTT\n\n00:01.000 --> 00:03.000\nQuick WS cue\n\n00:45.000 --> 00:48.000\nLate WS cue\n"}
	}
	b.extract = func(extractCtx context.Context, c *mediaInputCache, source string, tracks []SubtitleTrack, start float64) map[int]string {
		return b.extractSpan(extractCtx, c, source, tracks, start, 60)
	}

	swarmMu.Lock()
	oldCtx, oldInputs := playbackContext, playbackInputs
	playbackContext, playbackInputs = ctx, cache
	swarmMu.Unlock()
	defer func() {
		cancel()
		b.wait()
		swarmMu.Lock()
		playbackContext, playbackInputs = oldCtx, oldInputs
		swarmMu.Unlock()
	}()

	srv := httptest.NewServer(http.HandlerFunc(handleWebSocket))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	headers := http.Header{}
	headers.Set("Origin", "http://localhost:8080")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial ws: %v", err)
	}
	defer conn.Close()

	readWSEventMatching(t, conn, 3*time.Second, func(ev string, _ map[string]interface{}) bool {
		return ev == "status"
	})

	if err := conn.WriteJSON(map[string]interface{}{
		"action":         "get_subtitle",
		"requestId":      "sub-unauth",
		"playbackTicket": "invalid-ticket",
		"trackId":        "ws-sub-por",
		"start":          float64(0),
	}); err != nil {
		t.Fatal(err)
	}
	_, unauthSub := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "subtitle_error" && p["requestId"] == "sub-unauth"
	})
	if unauthSub["status"] != float64(401) {
		t.Fatalf("expected 401 subtitle_error for bad ticket, got %+v", unauthSub)
	}

	if err := conn.WriteJSON(map[string]interface{}{
		"action":         "get_subtitle",
		"requestId":      "sub-fast-1",
		"playbackTicket": ticket,
		"trackId":        "ws-sub-por",
		"start":          float64(0),
		"at":             float64(0),
		"fast":           true,
	}); err != nil {
		t.Fatal(err)
	}
	_, partialData := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "subtitle_data" && p["trackId"] == "ws-sub-por" && p["partial"] == true
	})
	vttFast, _ := partialData["vtt"].(string)
	if !strings.Contains(vttFast, "Quick WS cue") {
		t.Fatalf("expected fast-head cue in WS subtitle_data, got %q", vttFast)
	}

	close(releaseFull)
	_, fullData := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "subtitle_data" && p["trackId"] == "ws-sub-por" && p["partial"] == false
	})
	vttFull, _ := fullData["vtt"].(string)
	if !strings.Contains(vttFull, "Late WS cue") {
		t.Fatalf("expected proactively pushed full 60s cue over WS, got %q", vttFull)
	}
}

func TestProgressiveWindowRampUpAndWake(t *testing.T) {
	cases := []struct {
		isPrefetch    bool
		start         float64
		timelineStart float64
		continuous    bool
		e2e           bool
		want          float64
	}{
		{false, 0, 0, true, false, 4},
		{true, 4, 0, true, false, 8},
		{true, 12, 0, true, false, 12},
		{true, 24, 0, true, false, 24},
		{true, 108, 100, true, false, 8},
		{false, 0, 0, true, true, 24},
		{true, 4, 0, true, true, 24},
		{false, 0, 0, false, false, 24},
		{true, 4, 0, false, false, 24},
	}
	for i, tc := range cases {
		if got := progressiveWindowDuration(tc.isPrefetch, tc.start, tc.timelineStart, tc.continuous, tc.e2e); got != tc.want {
			t.Fatalf("case %d: progressiveWindowDuration(%v, %v, %v, %v, %v) = %v, want %v",
				i, tc.isPrefetch, tc.start, tc.timelineStart, tc.continuous, tc.e2e, got, tc.want)
		}
	}

	// Verify wakeSessionPreparation never blocks across repeated calls.
	for i := 0; i < 10; i++ {
		wakeSessionPreparation()
	}
}

func TestPreferredVideoProducerPreventsPrefetchSourceRotation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	if cache.preferredVideoSource("1080p") != "" {
		t.Fatal("expected empty initial preferredVideoSource")
	}
	cache.rememberVideoProducer("1080p", "m1")
	if got := cache.preferredVideoSource("1080p"); got != "m1" {
		t.Fatalf("expected preferredVideoSource m1, got %q", got)
	}
	sources := cache.preferredVideoSources("1080p", []string{"m0", "m1", "m2"})
	if len(sources) != 3 || sources[0] != "m1" {
		t.Fatalf("expected m1 pinned first, got %v", sources)
	}
}
