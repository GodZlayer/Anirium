package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestCoreAuthorizationDoesNotFollowCredentialRedirects(t *testing.T) {
	var forwarded atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forwarded.Add(1)
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	}))
	defer target.Close()
	for _, status := range []int{301, 302, 303, 307, 308} {
		for _, sameOrigin := range []bool{false, true} {
			t.Run(fmt.Sprintf("%d/same-origin=%t", status, sameOrigin), func(t *testing.T) {
				core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path == "/redirected" {
						forwarded.Add(1)
						fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
						return
					}
					location := target.URL
					if sameOrigin {
						location = "/redirected"
					}
					http.Redirect(w, r, location, status)
				}))
				defer core.Close()
				t.Setenv("ANIRIUM_CORE_URL", core.URL)
				if _, ok := validateServiceToken("private-token", "private-device"); ok {
					t.Fatal("redirect was accepted as authorization")
				}
				if forwarded.Load() != 0 {
					t.Fatal("authorization request reached redirect destination")
				}
			})
		}
	}
}

func TestLegacyEndpointsCannotReachTorrentHandlers(t *testing.T) {
	called := false
	handler := restrictLegacyPlayback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) }))
	for _, target := range []string{"/stream", "/set-mix", "/tracks", "/subtitles?magnet=anything", "/manifest?magnets=anything"} {
		called = false
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		if called || response.Code < 400 {
			t.Fatalf("legacy request reached handler: %s", target)
		}
	}
	called = false
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health", nil))
	if !called {
		t.Fatal("health endpoint blocked")
	}
}

func TestSubtitleDeliveryRequiresPublishedTrackID(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("fixture", "device", "account")
	if err != nil {
		t.Fatal(err)
	}
	handler := newServiceHTTPHandler(0)
	for _, test := range []struct {
		query  string
		status int
	}{
		{"", http.StatusBadRequest},
		{"&lang=por", http.StatusBadRequest},
		{"&trackId=unpublished-track&lang=por", http.StatusNotFound},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/subtitles?playbackTicket="+ticket+test.query, nil))
		if response.Code != test.status {
			t.Fatalf("subtitle query %q: got %d, want %d", test.query, response.Code, test.status)
		}
	}
}

func TestManifestRequiresLiveCoreAuthorization(t *testing.T) {
	authorized := true
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authorized {
			w.WriteHeader(401)
			return
		}
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	called := false
	handler := restrictLegacyPlayback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) }))
	for _, route := range []string{"/manifest", "/stats", "/providers"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, route, nil))
		if response.Code != 401 || called {
			t.Fatalf("anonymous %s accepted", route)
		}
	}
	request := httptest.NewRequest(http.MethodGet, "/manifest", nil)
	request.Header.Set("Authorization", "Bearer fixture")
	request.Header.Set("X-Anirium-Device", "fixture-device")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if !called {
		t.Fatal("valid session rejected")
	}
	called = false
	authorized = false
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 401 || called {
		t.Fatal("revoked session accepted")
	}
}

func TestServiceAuthorizationRejectsNonPlusAndMalformedResponses(t *testing.T) {
	body := `{"status":"authorized","level":1,"authorizedAddonIds":["test.provider"]}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer fixture" || r.Header.Get("X-Anirium-Device") != "device" {
			t.Error("missing validation identity")
		}
		fmt.Fprint(w, body)
	}))
	defer server.Close()
	t.Setenv("ANIRIUM_CORE_URL", server.URL)
	if _, ok := validateServiceToken("fixture", "device"); ok {
		t.Fatal("non-Plus account accepted")
	}
	body = `{"status":"authorized","level":2,"accountId":"account","playerSessionId":"player","authorizedAddonIds":["test.provider"]}`
	auth, ok := validateServiceToken("fixture", "device")
	if !ok || len(auth.AuthorizedAddonIDs) != 1 {
		t.Fatal("valid authorization rejected")
	}
	for _, invalid := range []string{
		`{"status":"authorized","level":2}`,
		`{"status":"authorized","level":2,"accountId":"   "}`,
		`{"status":"authorized","level":2,"accountId":"account"} {}`,
		`{"status":"authorized","level":2,"accountId":"account"} garbage`,
		`{"status":"authorized","level":2,"accountId":"account"}` + strings.Repeat(" ", 1<<20),
	} {
		body = invalid
		if _, ok := validateServiceToken("fixture", "device"); ok {
			t.Fatalf("incomplete, appended or oversized authorization accepted (%d bytes)", len(invalid))
		}
	}
	body = `not-json`
	if _, ok := validateServiceToken("fixture", "device"); ok {
		t.Fatal("malformed authorization accepted")
	}
	if _, ok := validateServiceToken("", "device"); ok {
		t.Fatal("empty token accepted")
	}
}

func TestProviderManifestControlsSearchEndpoint(t *testing.T) {
	searches := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest":
			fmt.Fprint(w, `{"id":"test.provider","capabilities":["magnet.search"],"endpoints":{"search":"/declared"}}`)
		case "/declared":
			searches++
			if r.URL.Query().Get("ep") != "2" {
				t.Error("missing episode context")
			}
			fmt.Fprint(w, `{"sources":[{"magnet":"magnet:?xt=urn:btih:0123456789012345678901234567890123456789","infoHash":"0123456789012345678901234567890123456789"}]}`)
		default:
			t.Errorf("unexpected provider endpoint: %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	allowLocalProviderForTest(t, server.URL)
	previous := providerServers
	defer func() { providerServers = previous }()
	providerServers = []ProviderServer{{ID: "test.provider", ManifestURL: server.URL + "/manifest", SearchURL: server.URL + "/wrong", Enabled: true}}
	request := PlaybackPrepareRequest{Title: "Fixture", Episode: 2, AuthorizedAddonIDs: []string{"test.provider"}}
	if len(searchProviderServers(PlaybackPrepareRequest{Title: "Fixture"})) != 0 || searches != 0 {
		t.Fatal("unauthorized provider was contacted")
	}
	results := searchProviderServers(request)
	if searches != 1 || len(results) != 1 || results[0].Provider != "test.provider" {
		t.Fatalf("searches=%d results=%v", searches, results)
	}
	providerServers[0].ID = "different.provider"
	request.AuthorizedAddonIDs = []string{"different.provider"}
	if len(searchProviderServers(request)) != 0 || searches != 1 {
		t.Fatal("mismatched manifest identity was accepted")
	}
	providerServers[0].ManifestURL = ""
	if len(searchProviderServers(PlaybackPrepareRequest{})) != 0 {
		t.Fatal("missing manifest was accepted")
	}
}

func TestSelectVariantQualitiesReturnsAllExistingQualities(t *testing.T) {
	got := selectVariantQualities([]string{"720p", "4k", "1080p", "480p"})
	want := []string{"4k", "1080p", "720p", "480p"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestChooseBestSegmentMixesSourcesByPosition(t *testing.T) {
	sources := [][]hlsSegment{
		{{duration: "4.0", path: "a0.ts", size: 100}, {duration: "4.0", path: "a1.ts", size: 900}},
		{{duration: "4.0", path: "b0.ts", size: 80}},
	}
	first, ok := chooseBestSegment(sources, 0)
	if !ok || first.path != "b0.ts" {
		t.Fatalf("first segment = %#v, %v", first, ok)
	}
	second, ok := chooseBestSegment(sources, 1)
	if !ok || second.path != "a1.ts" {
		t.Fatalf("second segment = %#v, %v", second, ok)
	}
	if _, ok := chooseBestSegment(sources, 2); ok {
		t.Fatal("expected missing third segment")
	}
}

func TestSegmentSelectionRejectsInvalidAndIncompatibleCandidates(t *testing.T) {
	sources := [][]hlsSegment{
		{{duration: "4.0", path: "reference.ts", size: 200}},
		{{duration: "3.0", path: "different-cut.ts", size: 10}},
		{{duration: "NaN", path: "invalid.ts", size: 1}},
		{{duration: "4.0", path: "empty.ts", size: 0}},
		{{duration: "4.0", path: "compressed.ts", size: 100}},
	}
	got, ok := chooseBestSegment(sources, 0)
	if !ok || got.path != "compressed.ts" {
		t.Fatalf("selected incompatible/invalid segment: %+v", got)
	}
}
