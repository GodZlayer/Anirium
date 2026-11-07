package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestAccountProviderManifestAndSearchOverHTTP(t *testing.T) {
	var manifestCalls, searchCalls atomic.Int32
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("X-Anirium-Device") != "" || r.Header.Get("Cookie") != "" || strings.Contains(r.URL.String(), "fixture-account-secret") || strings.Contains(r.URL.String(), "fixture-device-secret") {
			t.Error("Core credentials forwarded to provider")
		}
		switch r.URL.Path {
		case "/manifest":
			manifestCalls.Add(1)
			json.NewEncoder(w).Encode(ProviderManifest{ID: "account.fixture", Capabilities: []string{"magnet.search"}, Endpoints: map[string]string{"search": "/search"}})
		case "/search":
			searchCalls.Add(1)
			budget, err := strconv.ParseInt(r.Header.Get("X-Search-Timeout-Ms"), 10, 64)
			if err != nil || budget < 1 || budget > 400 {
				t.Errorf("search budget/response reserve lost over HTTP: %q", r.Header.Get("X-Search-Timeout-Ms"))
			}
			if r.URL.Query().Get("titleEnglish") != "English fixture" || r.URL.Query().Get("titleRomaji") != "Romaji fixture" {
				t.Error("explicit catalogue aliases lost over HTTP")
			}
			if r.URL.Query().Get("ep") != "2" || r.URL.Query().Get("season") != "1" {
				t.Error("episode context lost")
			}
			json.NewEncoder(w).Encode(map[string]any{"sources": []ProviderSearchResult{{Magnet: "magnet:?xt=urn:btih:0123456789012345678901234567890123456789"}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	allowLocalProviderForTest(t, remote.URL)
	config, _ := json.Marshal(map[string]any{"id": "account.fixture", "capabilities": []string{"provider.server"}, "serviceUrl": remote.URL})
	auth := serviceAuthorization{AuthorizedAddonIDs: []string{"account.fixture"}, InstalledAddons: []accountAddon{{ID: "account.fixture", Config: config}}}
	query := PlaybackPrepareRequest{Token: "fixture-account-secret", DeviceID: "fixture-device-secret", Title: "Authorized fixture", TitleEnglish: "English fixture", TitleRomaji: "Romaji fixture", Season: 1, Episode: 2, AuthorizedAddonIDs: auth.AuthorizedAddonIDs, AccountProviderServers: accountProviderServers(auth)}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	results := searchProviderServers(query, ctx)
	if len(results) != 1 || results[0].Provider != "account.fixture" || manifestCalls.Load() != 1 || searchCalls.Load() != 1 {
		t.Fatalf("discovery failed: %+v", results)
	}
	// The registry must be request-scoped: the next account has no provider.
	query.AuthorizedAddonIDs = nil
	query.AccountProviderServers = nil
	if len(searchProviderServers(query, context.Background())) != 0 || searchCalls.Load() != 1 {
		t.Fatal("account provider leaked into subsequent request")
	}
}

func TestCoreValidatedAccountDiscoversOnlyItsProvider(t *testing.T) {
	var requests atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Header.Get("Authorization") != "" || r.Header.Get("X-Anirium-Device") != "" || r.Header.Get("Cookie") != "" || strings.Contains(r.URL.String(), "fixture-account-secret") || strings.Contains(r.URL.String(), "fixture-device-secret") {
			t.Error("account credentials leaked to provider")
		}
		if r.URL.Path == "/manifest" {
			json.NewEncoder(w).Encode(ProviderManifest{ID: "fixture.remote", Capabilities: []string{"magnet.search"}, Endpoints: map[string]string{"search": "/search"}})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"sources": []ProviderSearchResult{{Magnet: "magnet:?xt=urn:btih:0123456789012345678901234567890123456789"}}})
	}))
	defer provider.Close()
	allowLocalProviderForTest(t, provider.URL)
	config, _ := json.Marshal(map[string]any{"id": "fixture.remote", "capabilities": []string{"magnet.search"}, "manifestUrl": provider.URL + "/manifest"})
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cache-Control") != "no-cache, no-store" || r.Header.Get("Pragma") != "no-cache" {
			t.Error("account authorization request permits cached responses")
		}
		if r.URL.Path != "/api/service/session/validate" || r.Header.Get("X-Anirium-Device") != "device" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		auth := serviceAuthorization{Status: "authorized", AccountID: "fixture", Level: 2, PlayerSessionID: "fixture-player"}
		switch r.Header.Get("Authorization") {
		case "Bearer plus":
			auth.AuthorizedAddonIDs = []string{"fixture.remote"}
			auth.InstalledAddons = []accountAddon{{ID: "fixture.remote", Config: config}}
		case "Bearer basic":
			auth.Level = 1
		case "Bearer other":
		default:
			w.WriteHeader(http.StatusForbidden)
			return
		}
		json.NewEncoder(w).Encode(auth)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	for _, token := range []string{"plus", "other", "basic", "expired"} {
		auth, ok := validateServiceToken(token, "device")
		if token == "basic" || token == "expired" {
			if ok {
				t.Fatalf("unauthorized account accepted: %s", token)
			}
			continue
		}
		if !ok {
			t.Fatalf("valid account rejected: %s", token)
		}
		query := PlaybackPrepareRequest{Title: "Fixture", Season: 1, Episode: 1, AuthorizedAddonIDs: auth.AuthorizedAddonIDs, AccountProviderServers: accountProviderServers(auth)}
		results := searchProviderServers(query, context.Background())
		if (len(results) == 1) != (token == "plus") {
			t.Fatalf("provider isolation failed for %s", token)
		}
	}
	if requests.Load() != 2 {
		t.Fatalf("unexpected provider requests: %d", requests.Load())
	}
	if _, ok := validateServiceToken("plus", "other-device"); ok {
		t.Fatal("wrong device accepted")
	}
}

func TestAccountProviderDiscoveryIsAuthorizedAndScoped(t *testing.T) {
	config := json.RawMessage(`{"id":"community.test","capabilities":["provider.server"],"serviceUrl":"https://provider.example"}`)
	auth := serviceAuthorization{AuthorizedAddonIDs: []string{"community.test"}, InstalledAddons: []accountAddon{{ID: "community.test", Config: config}}}
	servers := accountProviderServers(auth)
	if len(servers) != 1 || servers[0].ManifestURL != "https://provider.example/manifest" {
		t.Fatalf("unexpected servers: %+v", servers)
	}
	auth.AuthorizedAddonIDs = nil
	if len(accountProviderServers(auth)) != 0 {
		t.Fatal("unauthorized addon exposed")
	}
	auth.AuthorizedAddonIDs = []string{"other-account-addon"}
	if len(accountProviderServers(auth)) != 0 {
		t.Fatal("cross-account configuration exposed")
	}
}

func TestAccountProviderConfigurationRejectsUnsafeURLsAndIdentity(t *testing.T) {
	for _, raw := range []string{
		`{"id":"wrong","capabilities":["provider.server"],"manifestUrl":"https://example.com/manifest"}`,
		`{"id":"test","capabilities":["provider.server"],"manifestUrl":"file:///secret"}`,
		`{"id":"test","capabilities":["provider.server"],"manifestUrl":"https://user:pass@example.com/manifest"}`,
		`{"id":"test","capabilities":["ui.player.render"],"manifestUrl":"https://example.com/manifest"}`,
	} {
		auth := serviceAuthorization{AuthorizedAddonIDs: []string{"test"}, InstalledAddons: []accountAddon{{ID: "test", Config: json.RawMessage(raw)}}}
		if len(accountProviderServers(auth)) != 0 {
			t.Fatalf("accepted invalid config: %s", raw)
		}
	}
}
