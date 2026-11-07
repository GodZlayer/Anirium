package main

import (
	"encoding/json"
	"net/url"
	"strings"
)

type accountAddon struct {
	ID     string          `json:"id"`
	Config json.RawMessage `json:"config"`
}

// Only the Service interprets provider configuration. Account configuration
// travels from authenticated Core validation, never from the Player request.
func accountProviderServers(auth serviceAuthorization) []ProviderServer {
	servers := []ProviderServer{}
	for _, addon := range auth.InstalledAddons {
		if !containsString(auth.AuthorizedAddonIDs, addon.ID) {
			continue
		}
		var config struct {
			ID           string   `json:"id"`
			Kind         string   `json:"kind"`
			Capabilities []string `json:"capabilities"`
			ManifestURL  string   `json:"manifestUrl"`
			ServiceURL   string   `json:"serviceUrl"`
			TimeoutMS    int      `json:"timeoutMs"`
		}
		raw := addon.Config
		var serialized string
		if json.Unmarshal(raw, &serialized) == nil {
			raw = json.RawMessage(serialized)
		}
		if json.Unmarshal(raw, &config) != nil || config.ID != addon.ID {
			continue
		}
		if config.Kind == "remote-manifest" {
			// URL-only account ref: no capabilities are saved. Authorization
			// uses the account reference ID; provider identity and endpoints
			// come from the current manifest inside the Service.
			canonical, ok := canonicalizeManifestURL(config.ManifestURL)
			if !ok || !accountManifestAcceptsRef(config.ID, canonical, config.ManifestURL) {
				logAccountAddonDiagnostic(addon.ID, "invalid_ref")
				continue
			}
			servers = append(servers, ProviderServer{ID: addon.ID, Kind: "remote-manifest", ManifestURL: canonical, Enabled: true, TimeoutMS: config.TimeoutMS})
			continue
		}
		if config.Kind != "" {
			logAccountAddonDiagnostic(addon.ID, "unknown_kind")
			continue
		}
		if !containsString(config.Capabilities, "provider.server") && !containsString(config.Capabilities, "magnet.search") && !supportsSubtitleSearch(config.Capabilities) {
			continue
		}
		manifestURL := config.ManifestURL
		if manifestURL == "" && config.ServiceURL != "" {
			manifestURL = strings.TrimRight(config.ServiceURL, "/") + "/manifest"
		}
		endpoint, err := url.Parse(manifestURL)
		if err != nil || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.Fragment != "" || (endpoint.Scheme != "https" && endpoint.Scheme != "http") {
			continue
		}
		servers = append(servers, ProviderServer{ID: addon.ID, ManifestURL: endpoint.String(), Enabled: true, TimeoutMS: config.TimeoutMS})
	}
	return servers
}

func mergeAccountProviderServers(local, account []ProviderServer) []ProviderServer {
	merged := append([]ProviderServer(nil), local...)
	for _, server := range account {
		replaced := false
		for index := range merged {
			if merged[index].ID == server.ID {
				merged[index] = server
				replaced = true
				break
			}
		}
		if !replaced {
			merged = append(merged, server)
		}
	}
	return merged
}
