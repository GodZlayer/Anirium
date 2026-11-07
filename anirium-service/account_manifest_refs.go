package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode"
)

// URL-only account configuration (new shape):
//
//	{"id":"remote-"+sha256(canonicalURL).hex[:32],"kind":"remote-manifest","manifestUrl":canonicalURL}
//
// The account reference ID authorizes the addon; the remote manifest's own
// provider ID identifies the provider. The two are never merged, so a remote
// manifest ID can neither satisfy nor escalate a different grant. Remote
// capabilities are never persisted: they are resolved from the current
// manifest fetched by the Service on each prepare.
func remoteManifestReferenceID(canonical string) string {
	sum := sha256.Sum256([]byte(canonical))
	return "remote-" + hex.EncodeToString(sum[:])[:32]
}

// canonicalizeManifestURL normalizes the URL used for both the derived
// reference ID and the manifest fetch so validation cannot be bypassed by
// casing, default ports, fragments or embedded credentials.
func canonicalizeManifestURL(raw string) (string, bool) {
	trimmed := raw
	if trimmed == "" || len(trimmed) > 2048 || strings.Contains(trimmed, "\\") || strings.IndexFunc(trimmed, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
		return "", false
	}
	endpoint, err := url.Parse(trimmed)
	if err != nil || endpoint.Opaque != "" || endpoint.User != nil || endpoint.Fragment != "" || endpoint.Hostname() == "" {
		return "", false
	}
	if endpoint.Scheme != "https" && endpoint.Scheme != "http" {
		return "", false
	}
	endpoint.Scheme = strings.ToLower(endpoint.Scheme)
	host := strings.ToLower(endpoint.Hostname())
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	port := endpoint.Port()
	if port != "" && !((endpoint.Scheme == "https" && port == "443") || (endpoint.Scheme == "http" && port == "80")) {
		host = host + ":" + port
	}
	endpoint.Host = host
	return endpoint.String(), true
}

// accountManifestAcceptsRef reports whether a config matches the derived
// remote reference ID, using either the raw or canonical manifest URL so a
// Core that hashes the exact stored URL still validates.
func accountManifestAcceptsRef(configID string, canonical, raw string) bool {
	if configID == "" {
		return false
	}
	if configID == remoteManifestReferenceID(canonical) {
		return true
	}
	return configID == remoteManifestReferenceID(strings.TrimSpace(raw))
}

// manifestIdentityAcceptsServer prefers the remote manifest identity for
// remote-manifest refs and keeps the legacy strict ID match for local,
// fullJSON configs. Authorization always uses the server ID; the manifest
// ID only labels the provider identity.
func manifestIdentityAcceptsServer(server ProviderServer, manifest ProviderManifest) bool {
	if server.Kind == "remote-manifest" {
		return strings.TrimSpace(manifest.ID) != ""
	}
	return manifest.ID == server.ID
}

// providerLabelForServer keeps authorization identity and provider identity
// distinct in results: remote refs surface the current manifest identity.
func providerLabelForServer(server ProviderServer, manifest ProviderManifest) string {
	if server.Kind == "remote-manifest" && strings.TrimSpace(manifest.ID) != "" {
		return manifest.ID
	}
	return server.ID
}

type providerManifestSnapshot struct {
	Manifest ProviderManifest
	Status   string // "ok", "offline", "invalid_manifest", "invalid_ref"
}

// providerSnapshotStore caches one manifest snapshot per provider per
// prepare so magnet and subtitle discovery in the same prepare observe the
// same current manifest, and a fresh store on the next prepare refetches.
type providerSnapshotStore struct {
	mu      sync.Mutex
	entries map[string]providerManifestSnapshot
	pending map[string]chan struct{}
}

func newProviderSnapshotStore() *providerSnapshotStore {
	return &providerSnapshotStore{entries: map[string]providerManifestSnapshot{}}
}

func (s *providerSnapshotStore) manifest(parent context.Context, server ProviderServer) (ProviderManifest, string) {
	if s == nil {
		snap := fetchProviderManifest(parent, server)
		return snap.Manifest, snap.Status
	}
	s.mu.Lock()
	if s.entries == nil {
		s.entries = map[string]providerManifestSnapshot{}
	}
	if snap, ok := s.entries[server.ID]; ok {
		s.mu.Unlock()
		return snap.Manifest, snap.Status
	}
	if s.pending == nil {
		s.pending = map[string]chan struct{}{}
	}
	if ready, ok := s.pending[server.ID]; ok {
		s.mu.Unlock()
		select {
		case <-parent.Done():
			return ProviderManifest{}, "offline"
		case <-ready:
			return s.manifest(parent, server)
		}
	}
	ready := make(chan struct{})
	s.pending[server.ID] = ready
	s.mu.Unlock()
	snap := fetchProviderManifest(parent, server)
	s.mu.Lock()
	s.entries[server.ID] = snap
	delete(s.pending, server.ID)
	close(ready)
	s.mu.Unlock()
	return snap.Manifest, snap.Status
}

// statusByID renders safe per-addon diagnostics: ids and statuses only,
// never credentials or URLs.
func (s *providerSnapshotStore) statusByID() map[string]string {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.entries) == 0 {
		return nil
	}
	status := make(map[string]string, len(s.entries))
	for id, snap := range s.entries {
		status[id] = snap.Status
	}
	return status
}

// fetchProviderManifest runs the manifest request exclusively through the
// existing network guards: HTTPS-or-trusted-local transport, no redirects,
// public-address validation, bound timeout and a bounded JSON body.
func fetchProviderManifest(parent context.Context, server ProviderServer) providerManifestSnapshot {
	canonical, ok := canonicalizeManifestURL(server.ManifestURL)
	if !ok {
		return providerManifestSnapshot{Status: "invalid_ref"}
	}
	ctx, cancel := context.WithTimeout(parent, 8*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, canonical, nil)
	if err != nil {
		return providerManifestSnapshot{Status: "invalid_ref"}
	}
	request.Header.Set("Cache-Control", "no-cache, no-store")
	request.Header.Set("Pragma", "no-cache")
	response, err := providerHTTPClient.Do(request)
	if err != nil {
		return providerManifestSnapshot{Status: "offline"}
	}
	var manifest ProviderManifest
	decodeErr := decodeProviderJSON(response.Body, 256<<10, &manifest)
	status := response.StatusCode
	response.Body.Close()
	if status != http.StatusOK {
		return providerManifestSnapshot{Status: "offline"}
	}
	if status != 200 || decodeErr != nil || !validAddonIdentity(manifest.ID) || !manifestIdentityAcceptsServer(server, manifest) {
		return providerManifestSnapshot{Status: "invalid_manifest"}
	}
	supported := supportsStremioSubtitleResource(manifest, "movie", "tt0") || supportsStremioSubtitleResource(manifest, "series", "tt0:1:1")
	for _, capability := range manifest.Capabilities {
		key := ""
		if capability == "magnet.search" {
			key = "search"
		}
		if supportsSubtitleSearch([]string{capability}) {
			key = "subtitleSearch"
		}
		if key == "" {
			continue
		}
		supported = true
		base, _ := url.Parse(canonical)
		endpoint, err := url.Parse(manifest.Endpoints[key])
		if err != nil || manifest.Endpoints[key] == "" || !sameProviderOrigin(base, base.ResolveReference(endpoint)) || endpoint.Fragment != "" {
			return providerManifestSnapshot{Status: "invalid_manifest"}
		}
	}
	if !supported {
		return providerManifestSnapshot{Status: "unsupported"}
	}
	return providerManifestSnapshot{Manifest: manifest, Status: "ok"}
}

func validAddonIdentity(id string) bool {
	if len(id) == 0 || len(id) > 100 {
		return false
	}
	for index, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			continue
		}
		if index > 0 && (r == '.' || r == '_' || r == '-') {
			continue
		}
		return false
	}
	return true
}

// logAccountAddonDiagnostic records a safe, credential-free per-addon
// status: the account reference ID and a fixed status word only.
func logAccountAddonDiagnostic(id, status string) {
	if !validAddonIdentity(id) || !containsString([]string{"offline", "invalid_manifest", "invalid_ref", "unknown_kind", "unsupported", "ok"}, status) {
		return
	}
	appendLog(fmt.Sprintf("addon status addon=%s status=%s", id, status))
}
