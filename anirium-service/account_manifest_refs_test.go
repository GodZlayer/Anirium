package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
)

func TestManifestRefSnapshotConcurrentAndRefresh(t *testing.T) {
	var calls, version atomic.Int32
	version.Store(1)
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("Cache-Control") != "no-cache, no-store" {
			t.Error("manifest may be cached")
		}
		json.NewEncoder(w).Encode(ProviderManifest{ID: fmt.Sprint("remote.v", version.Load()), Capabilities: []string{"magnet.search"}, Endpoints: map[string]string{"search": "/search"}})
	}))
	defer remote.Close()
	allowLocalProviderForTest(t, remote.URL)
	server := ProviderServer{ID: remoteManifestReferenceID(remote.URL + "/manifest"), Kind: "remote-manifest", ManifestURL: remote.URL + "/manifest", Enabled: true}
	snapshot := newProviderSnapshotStore()
	var workers sync.WaitGroup
	for i := 0; i < 16; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			manifest, status := snapshot.manifest(context.Background(), server)
			if status != "ok" || manifest.ID != "remote.v1" {
				t.Errorf("snapshot: %s %+v", status, manifest)
			}
		}()
	}
	workers.Wait()
	if calls.Load() != 1 {
		t.Fatalf("duplicate fetches: %d", calls.Load())
	}
	version.Store(2)
	manifest, _ := snapshot.manifest(context.Background(), server)
	if manifest.ID != "remote.v1" {
		t.Fatal("active snapshot changed")
	}
	manifest, status := newProviderSnapshotStore().manifest(context.Background(), server)
	if status != "ok" || manifest.ID != "remote.v2" || calls.Load() != 2 {
		t.Fatal("next preparation did not refresh")
	}
}

func TestManifestRefAuthorizationAndFailureIsolation(t *testing.T) {
	var searches atomic.Int32
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest":
			json.NewEncoder(w).Encode(ProviderManifest{ID: "different.provider", Capabilities: []string{"magnet.search"}, Endpoints: map[string]string{"search": "/search"}})
		case "/broken":
			fmt.Fprint(w, "not json")
		case "/search":
			searches.Add(1)
			json.NewEncoder(w).Encode(map[string]any{"sources": []ProviderSearchResult{{Magnet: "magnet:?xt=urn:btih:0123456789012345678901234567890123456789"}}})
		default:
			http.Error(w, "offline", 503)
		}
	}))
	defer remote.Close()
	allowLocalProviderForTest(t, remote.URL)
	auth := serviceAuthorization{}
	for _, path := range []string{"/manifest", "/broken", "/offline"} {
		endpoint := remote.URL + path
		id := remoteManifestReferenceID(endpoint)
		config, _ := json.Marshal(map[string]any{"id": id, "kind": "remote-manifest", "manifestUrl": endpoint})
		auth.AuthorizedAddonIDs = append(auth.AuthorizedAddonIDs, id)
		auth.InstalledAddons = append(auth.InstalledAddons, accountAddon{ID: id, Config: config})
	}
	snapshot := newProviderSnapshotStore()
	query := PlaybackPrepareRequest{AuthorizedAddonIDs: auth.AuthorizedAddonIDs, AccountProviderServers: accountProviderServers(auth), ManifestSnapshots: snapshot}
	results := searchProviderServers(query, context.Background())
	if len(results) != 1 || results[0].Provider != "different.provider" || searches.Load() != 1 {
		t.Fatalf("healthy addon lost: %+v", results)
	}
	statuses := snapshot.statusByID()
	if statuses[auth.AuthorizedAddonIDs[1]] != "invalid_manifest" || statuses[auth.AuthorizedAddonIDs[2]] == "ok" {
		t.Fatal("false success statuses")
	}
	auth.AuthorizedAddonIDs = nil
	if len(accountProviderServers(auth)) != 0 {
		t.Fatal("disabled account ref accepted")
	}
	query.AuthorizedAddonIDs = []string{"different.provider"}
	if len(searchProviderServers(query, context.Background())) != 0 || searches.Load() != 1 {
		t.Fatal("remote ID granted authority")
	}
	query.AuthorizedAddonIDs = nil
	query.AccountProviderServers = nil
	if len(searchProviderServers(query, context.Background())) != 0 || searches.Load() != 1 {
		t.Fatal("removed addon fetched")
	}
}

func TestManifestRefURLValidation(t *testing.T) {
	for _, raw := range []string{"https://[::1]:443/manifest", "https://example.com/manifest"} {
		if _, ok := canonicalizeManifestURL(raw); !ok {
			t.Fatal(raw)
		}
	}
	canonical, _ := canonicalizeManifestURL("https://[::1]:443/manifest")
	if canonical != "https://[::1]/manifest" {
		t.Fatal(canonical)
	}
	for _, raw := range []string{" https://example.com", "https://example.com/a b", "https://example.com/\\a", "https://u:p@example.com/manifest", "https://example.com/#x", "file:///tmp/a"} {
		if _, ok := canonicalizeManifestURL(raw); ok {
			t.Fatal("accepted invalid URL", raw)
		}
	}
}

func TestManifestRefRefreshChangesSearchEndpointWithoutAccountMutation(t *testing.T) {
	var version, searches atomic.Int32
	version.Store(1)
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/manifest" {
			capabilities := []string{"magnet.search"}
			if version.Load() == 3 {
				capabilities = nil
			}
			json.NewEncoder(w).Encode(ProviderManifest{ID: "stable.provider", Capabilities: capabilities, Endpoints: map[string]string{"search": fmt.Sprintf("/search-v%d", version.Load())}})
			return
		}
		if r.URL.Path != fmt.Sprintf("/search-v%d", version.Load()) {
			t.Errorf("stale search endpoint: %s", r.URL.Path)
			http.Error(w, "old endpoint", http.StatusGone)
			return
		}
		searches.Add(1)
		json.NewEncoder(w).Encode(map[string]any{"sources": []ProviderSearchResult{{Magnet: "magnet:?xt=urn:btih:0123456789012345678901234567890123456789"}}})
	}))
	defer remote.Close()
	allowLocalProviderForTest(t, remote.URL)
	endpoint := remote.URL + "/manifest"
	id := remoteManifestReferenceID(endpoint)
	config, _ := json.Marshal(map[string]any{"id": id, "kind": "remote-manifest", "manifestUrl": endpoint})
	auth := serviceAuthorization{AuthorizedAddonIDs: []string{id}, InstalledAddons: []accountAddon{{ID: id, Config: config}}}
	for _, current := range []int32{1, 2, 3} {
		version.Store(current)
		query := PlaybackPrepareRequest{AuthorizedAddonIDs: auth.AuthorizedAddonIDs, AccountProviderServers: accountProviderServers(auth), ManifestSnapshots: newProviderSnapshotStore()}
		results := searchProviderServers(query, context.Background())
		if current < 3 && (len(results) != 1 || results[0].Provider != "stable.provider") {
			t.Fatalf("manifest version%d not applied: %+v", current, results)
		}
		if current == 3 && (len(results) != 0 || searches.Load() != 2) {
			t.Fatal("removed capability still started search")
		}
	}
}
