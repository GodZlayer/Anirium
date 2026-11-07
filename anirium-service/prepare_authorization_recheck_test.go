package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// The real POST /playback/prepare handler must re-validate token/device with
// Core after provider search and before generation/grant/torrent starts.
func TestPrepareAuthRecheckGate(t *testing.T) {
	if !mediaToolsAvailable() {
		t.Skip("ffmpeg/ffprobe ausentes: prepare retorna antes do recheck; skip reportado")
	}
	cases := []struct {
		name       string
		coreStatus int
		coreBody   string
		wantStatus int
		wantReason string
	}{
		{"session revoked", 401, `{"reason":"session_revoked"}`, 401, "session_revoked"},
		{"token expired", 401, `{"reason":"token_expired"}`, 401, "token_expired"},
		{"plus required", 403, `{"reason":"plus_required"}`, 403, "plus_required"},
		{"core offline", 503, `{}`, 503, "core_unavailable"},
		{"account mismatch", 200, `{"status":"authorized","level":2,"accountId":"account-02","playerSessionId":"player-01"}`, 403, "account_mismatch"},
		{"session mismatch", 200, `{"status":"authorized","level":2,"accountId":"account-01","playerSessionId":"player-02"}`, 403, "session_mismatch"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			var searches atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/manifest":
					fmt.Fprint(w, `{"id":"provider-01","capabilities":["magnet.search"],"endpoints":{"search":"/search-01"}}`)
				case "/search-01":
					searches.Add(1)
					fmt.Fprint(w, `{"sources":[{"magnet":"magnet:?xt=urn:btih:0123456789012345678901234567890123456789","infoHash":"0123456789012345678901234567890123456789"}]}`)
				default:
					w.WriteHeader(404)
				}
			}))
			defer provider.Close()
			allowLocalProviderForTest(t, provider.URL)
			var coreCalls atomic.Int32
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if coreCalls.Add(1) == 1 {
					fmt.Fprintf(w, `{"status":"authorized","level":2,"accountId":"account-01","playerSessionId":"player-01","authorizedAddonIds":["provider-01"],"installedAddons":[{"id":"provider-01","config":{"id":"provider-01","capabilities":["magnet.search"],"manifestUrl":%q}}]}`, provider.URL+"/manifest")
					return
				}
				w.WriteHeader(test.coreStatus)
				fmt.Fprint(w, test.coreBody)
			}))
			defer core.Close()
			t.Setenv("ANIRIUM_CORE_URL", core.URL)
			swarmMu.RLock()
			generationBefore := playbackGeneration
			playbackContextBefore := playbackContext
			swarmMu.RUnlock()
			grantMu.Lock()
			grantsBefore := len(grants)
			grantMu.Unlock()
			handler := newServiceHTTPHandler(0)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/playback/prepare", strings.NewReader(
				`{"token":"token-01","deviceId":"device-01","title":"Title-01","season":1,"episode":1}`))
			handler.ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d (%s)", response.Code, test.wantStatus, response.Body.String())
			}
			if reason := decodeRejectionBody(t, response); reason != test.wantReason {
				t.Fatalf("reason = %q, want %q (%s)", reason, test.wantReason, response.Body.String())
			}
			if searches.Load() != 1 {
				t.Fatalf("provider consulted %d vezes, want 1", searches.Load())
			}
			if coreCalls.Load() != 2 {
				t.Fatalf("core calls = %d, want 2 (validate + recheck)", coreCalls.Load())
			}
			swarmMu.RLock()
			generationAfter := playbackGeneration
			playbackContextAfter := playbackContext
			swarmMu.RUnlock()
			if generationAfter != generationBefore || playbackContextAfter != playbackContextBefore {
				t.Fatal("geração/contexto de playback iniciado apesar da rejeição")
			}
			grantMu.Lock()
			grantsAfter := len(grants)
			grantMu.Unlock()
			if grantsAfter != grantsBefore {
				t.Fatalf("grant iniciado: %d -> %d", grantsBefore, grantsAfter)
			}
		})
	}
}
