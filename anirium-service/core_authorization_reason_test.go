package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
)

func TestCoreAuthorizationVerdictPreservesReasonAndStatus(t *testing.T) {
	var response atomic.Value
	response.Store(`{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload := response.Load().(string)
		if strings.HasPrefix(payload, "STATUS:") {
			status := 0
			fmt.Sscanf(payload, "STATUS:%d", &status)
			w.WriteHeader(status)
			fmt.Fprint(w, strings.TrimPrefix(payload, fmt.Sprintf("STATUS:%d\n", status)))
			return
		}
		fmt.Fprint(w, payload)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	for _, test := range []struct {
		name       string
		payload    string
		wantStatus int
		wantReason string
	}{
		{"token invalid", "STATUS:401\n" + `{"reason":"token_invalid"}`, 401, "token_invalid"},
		{"token expired", "STATUS:401\n" + `{"reason":"token_expired"}`, 401, "token_expired"},
		{"session revoked", "STATUS:401\n" + `{"reason":"session_revoked"}`, 401, "session_revoked"},
		{"device mismatch", "STATUS:403\n" + `{"reason":"device_mismatch"}`, 403, "device_mismatch"},
		{"plus required", "STATUS:403\n" + `{"reason":"plus_required"}`, 403, "plus_required"},
		{"session mismatch", "STATUS:403\n" + `{"reason":"session_mismatch"}`, 403, "session_mismatch"},
		{"account mismatch", "STATUS:403\n" + `{"reason":"account_mismatch"}`, 403, "account_mismatch"},
		{"core unavailable verdict", "STATUS:401\n" + `{"reason":"core_unavailable"}`, 503, "core_unavailable"},
		{"unknown reason hidden", "STATUS:401\n" + `{"reason":"internal_trace_id_9"}`, 401, "session_invalid"},
		{"empty deny body", "STATUS:403\n", 403, "session_invalid"},
		{"deny body not json", "STATUS:401\nnot-json", 401, "session_invalid"},
		{"core failure", "STATUS:503\n" + `{}`, 503, "core_unavailable"},
		{"core unavailable on 200", `{"status":"unavailable","reason":"core_unavailable"}`, 503, "core_unavailable"},
		{"revoked on 200", `{"status":"unauthorized","reason":"session_revoked"}`, 401, "session_revoked"},
		{"plus required on 200", `{"status":"authorized","level":1,"accountId":"account"}`, 403, "plus_required"},
		{"authorized without account", `{"status":"authorized","level":2}`, 401, "session_invalid"},
		{"authorized without player", `{"status":"authorized","level":2,"accountId":"account"}`, 401, "player_instance_required"},
		{"malformed authorized", `{"status":"authorized","level":2,"accountId":`, 503, "core_unavailable"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response.Store(test.payload)
			_, rejection := validateServiceTokenDetailed("fixture", "device")
			if rejection == nil {
				t.Fatal("denied verdict accepted")
			}
			if rejection.status != test.wantStatus || rejection.reason != test.wantReason {
				t.Fatalf("got %d %q, want %d %q", rejection.status, rejection.reason, test.wantStatus, test.wantReason)
			}
			if _, ok := validateServiceToken("fixture", "device"); ok {
				t.Fatal("bool wrapper accepted denied verdict")
			}
		})
	}
	response.Store(`{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	if _, rejection := validateServiceTokenDetailed("fixture", "device"); rejection != nil {
		t.Fatalf("live Plus session rejected: %v", rejection)
	}
}

func TestCoreAuthorizationNeverTrustsNon200Authorization(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	if _, rejection := validateServiceTokenDetailed("fixture", "device"); rejection == nil || rejection.status != 403 {
		t.Fatalf("non-200 authorization payload trusted: %v", rejection)
	}
}

func TestCoreOfflineAndMissingCredentialsMapToSafeRejections(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	offline := core.URL
	core.Close()
	t.Setenv("ANIRIUM_CORE_URL", offline)
	_, rejection := validateServiceTokenDetailed("fixture", "device")
	if rejection == nil || rejection.status != 503 || rejection.reason != "core_unavailable" {
		t.Fatalf("offline Core verdict = %v, want 503 core_unavailable", rejection)
	}
	for _, credentials := range [][2]string{{"", "device"}, {"fixture", ""}} {
		_, rejection = validateServiceTokenDetailed(credentials[0], credentials[1])
		if rejection == nil || rejection.status != 401 || rejection.reason != "token_invalid" {
			t.Fatalf("missing credential verdict = %v, want 401 token_invalid", rejection)
		}
	}
}

func decodeRejectionBody(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.Status != "unauthorized" {
		t.Fatalf("unexpected rejection body: %q", response.Body.String())
	}
	return body.Reason
}

func TestPrepareEndpointExposesCoreVerdict(t *testing.T) {
	var status atomic.Int32
	var body atomic.Value
	body.Store(`{"reason":"plus_required"}`)
	status.Store(403)
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(int(status.Load()))
		fmt.Fprint(w, body.Load().(string))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	handler := newServiceHTTPHandler(0)
	prepare := func() *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/playback/prepare", strings.NewReader(
			`{"token":"fixture","deviceId":"device","title":"Fixture","season":1,"episode":1}`))
		handler.ServeHTTP(response, request)
		return response
	}
	if response := prepare(); response.Code != 403 || decodeRejectionBody(t, response) != "plus_required" {
		t.Fatalf("Plus denial hidden: %d %s", response.Code, response.Body.String())
	}
	status.Store(401)
	body.Store(`{"reason":"token_expired"}`)
	if response := prepare(); response.Code != 401 || decodeRejectionBody(t, response) != "token_expired" {
		t.Fatalf("expiration hidden: %d %s", response.Code, response.Body.String())
	}
	status.Store(503)
	body.Store(`{}`)
	if response := prepare(); response.Code != 503 || decodeRejectionBody(t, response) != "core_unavailable" {
		t.Fatalf("Core failure not exposed as unavailable: %d %s", response.Code, response.Body.String())
	}
}

func TestManifestEndpointExposesCoreUnavailable(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	handler := restrictLegacyPlayback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	request := httptest.NewRequest(http.MethodGet, "/manifest", nil)
	request.Header.Set("Authorization", "Bearer fixture")
	request.Header.Set("X-Anirium-Device", "device")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	core.Close()
	if response.Code != 503 || decodeRejectionBody(t, response) != "core_unavailable" {
		t.Fatalf("Core 502 hidden: %d %s", response.Code, response.Body.String())
	}
}

func TestRenewEndpointExposesCoreVerdict(t *testing.T) {
	var revoked atomic.Bool
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if revoked.Load() {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprint(w, `{"reason":"token_expired"}`)
			return
		}
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("fixture", "device", "account", "player")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
	}()
	revoked.Store(true)
	handler := newServiceHTTPHandler(0)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/playback/renew", strings.NewReader(
		fmt.Sprintf(`{"playbackTicket":%q,"token":"fixture","deviceId":"device"}`, ticket))))
	if response.Code != 401 || decodeRejectionBody(t, response) != "token_expired" {
		t.Fatalf("renewal hid Core verdict: %d %s", response.Code, response.Body.String())
	}
}

func TestMediaEndpointExposesGrantRejection(t *testing.T) {
	var mismatch atomic.Bool
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if mismatch.Load() {
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprint(w, `{"reason":"session_revoked"}`)
			return
		}
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("fixture", "device", "account", "player")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
	}()
	handler := newServiceHTTPHandler(0)
	mismatch.Store(true)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/hls/mix/index.m3u8?playbackTicket="+ticket, nil))
	if response.Code != 403 || decodeRejectionBody(t, response) != "session_revoked" {
		t.Fatalf("media route hid Core verdict: %d %s", response.Code, response.Body.String())
	}
}

func TestCoreRevocationDuringPlaybackCancelsAndDropsTorrents(t *testing.T) {
	var revoked atomic.Bool
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if revoked.Load() {
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprint(w, `{"reason":"session_revoked"}`)
			return
		}
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	cfg := torrent.NewDefaultClientConfig()
	cfg.DisableUTP = true
	cfg.DataDir = t.TempDir()
	cfg.NoDHT, cfg.DisableTrackers, cfg.DisablePEX = true, true, true
	cfg.NoDefaultPortForwarding = true
	cfg.ListenPort = 0
	client, closeClient, err := newManagedTorrentClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer closeClient()
	magnet := "magnet:?xt=urn:btih:" + strings.Repeat("ab", 20)
	if _, err := client.AddMagnet(magnet); err != nil {
		t.Fatal(err)
	}
	ticket, err := issuePlaybackGrant("fixture", "device", "account", "player")
	if err != nil || !validatePlaybackGrant(ticket) {
		t.Fatal("live Core session rejected")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	previousClient, previousCancel := torrentClient, cancelPlayback
	torrentClient, cancelPlayback = client, cancel
	generation := playbackGeneration
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		torrentClient, cancelPlayback = previousClient, previousCancel
		swarmMu.Unlock()
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
	}()
	done := make(chan struct{})
	go func() { watchPlaybackAuthorization(ctx, generation, ticket, 10*time.Millisecond, magnet); close(done) }()
	revoked.Store(true)
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Core revocation did not stop the playback watcher")
	}
	if ctx.Err() == nil {
		t.Fatal("Core revocation did not cancel playback workers")
	}
	if remaining := client.Torrents(); len(remaining) != 0 {
		t.Fatalf("revoked playback kept %d torrents", len(remaining))
	}
}
