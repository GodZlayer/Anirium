package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	stremioAddonsNetBaseURL = "https://stremio-addons.net/api/v0/addons"
	stremioCollectionURL    = "https://api.strem.io/addonscollection.json"
	stremioOfficialIndexURL = "https://raw.githubusercontent.com/Stremio/stremio-official-addons/master/index.json"
)

type AddonInspectionResult struct {
	InputURL              string               `json:"inputUrl"`
	ManifestURL           string               `json:"manifestUrl"`
	ConfigureURL          string               `json:"configureUrl,omitempty"`
	Status                string               `json:"status"` // "ready", "configuration_required", "unsupported", "offline", "invalid_manifest", "invalid_ref"
	HTTPStatus            int                  `json:"httpStatus,omitempty"`
	ID                    string               `json:"id,omitempty"`
	Name                  string               `json:"name,omitempty"`
	Version               string               `json:"version,omitempty"`
	Description           string               `json:"description,omitempty"`
	Logo                  string               `json:"logo,omitempty"`
	Resources             []string             `json:"resources,omitempty"`
	Types                 []string             `json:"types,omitempty"`
	SupportsStreams       bool                 `json:"supportsStreams"`
	SupportsSubtitles     bool                 `json:"supportsSubtitles"`
	Configurable          bool                 `json:"configurable"`
	ConfigurationRequired bool                 `json:"configurationRequired"`
	ConfigFields          []StremioConfigField `json:"configFields,omitempty"`
	ConfigMode            string               `json:"configMode"` // "none", "native", "page"
	ExistingConfigValues  map[string]string    `json:"existingConfigValues,omitempty"`
	Error                 string               `json:"error,omitempty"`
}

type AddonDirectoryItem struct {
	ManifestURL           string               `json:"manifestUrl"`
	ConfigureURL          string               `json:"configureUrl,omitempty"`
	ID                    string               `json:"id"`
	Name                  string               `json:"name"`
	Version               string               `json:"version,omitempty"`
	Description           string               `json:"description,omitempty"`
	Logo                  string               `json:"logo,omitempty"`
	Resources             []string             `json:"resources,omitempty"`
	Types                 []string             `json:"types,omitempty"`
	SupportsStreams       bool                 `json:"supportsStreams"`
	SupportsSubtitles     bool                 `json:"supportsSubtitles"`
	Configurable          bool                 `json:"configurable"`
	ConfigurationRequired bool                 `json:"configurationRequired"`
	ConfigFields          []StremioConfigField `json:"configFields,omitempty"`
	ConfigMode            string               `json:"configMode"`
	Directories           []string             `json:"directories"`
}

type AddonDirectorySourceStatus struct {
	Name  string `json:"name"`
	OK    bool   `json:"ok"`
	Count int    `json:"count"`
	Error string `json:"error,omitempty"`
}

type AddonDirectorySearchResponse struct {
	Items   []AddonDirectoryItem         `json:"items"`
	Sources []AddonDirectorySourceStatus `json:"sources"`
}

type cachedAddonDirectory struct {
	fetchedAt time.Time
	entries   []rawDirectoryAddon
}

type rawDirectoryAddon struct {
	TransportURL string           `json:"transportUrl"`
	ManifestURL  string           `json:"manifestUrl"`
	Manifest     ProviderManifest `json:"manifest"`
}

var (
	directoryCacheMu sync.Mutex
	directoryCache   = map[string]cachedAddonDirectory{}
)

const directoryCacheTTL = 10 * time.Minute

// normalizeAddonInputURL unwraps stremio:// and https://web.stremio.com/#/addons?addon=...
// links while preserving strict canonicalizeManifestURL validation.
func normalizeAddonInputURL(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || len(trimmed) > 4096 {
		return "", false
	}
	trimmed = unwrapWebStremioInstallURL(trimmed)
	if len(trimmed) >= 10 && strings.EqualFold(trimmed[:10], "stremio://") {
		trimmed = "https://" + trimmed[10:]
	}
	return canonicalizeManifestURL(trimmed)
}

func unwrapWebStremioInstallURL(input string) string {
	parsed, err := url.Parse(input)
	if err != nil {
		return input
	}
	scheme := strings.ToLower(parsed.Scheme)
	host := strings.ToLower(parsed.Hostname())
	if (scheme != "http" && scheme != "https") || host != "web.stremio.com" || (parsed.Path != "" && parsed.Path != "/") {
		return input
	}
	if !strings.HasPrefix(parsed.Fragment, "/addons?") {
		return input
	}
	params, err := url.ParseQuery(strings.TrimPrefix(parsed.Fragment, "/addons?"))
	if err != nil {
		return input
	}
	addon := strings.TrimSpace(params.Get("addon"))
	if addon == "" {
		return input
	}
	return addon
}

func extractManifestResources(manifest ProviderManifest) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, raw := range manifest.Resources {
		var name string
		if json.Unmarshal(raw, &name) != nil {
			var obj struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(raw, &obj) != nil {
				continue
			}
			name = obj.Name
		}
		name = strings.TrimSpace(name)
		if name != "" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

func manifestSupportsStreams(manifest ProviderManifest) bool {
	if hasStremioStreams(manifest) || containsString(manifest.Capabilities, "magnet.search") {
		return true
	}
	// Accept addons declaring stream resource with custom anime/generic types/prefixes too.
	for _, raw := range manifest.Resources {
		var name string
		types := manifest.Types
		if json.Unmarshal(raw, &name) != nil {
			var obj struct {
				Name  string   `json:"name"`
				Types []string `json:"types"`
			}
			if json.Unmarshal(raw, &obj) != nil {
				continue
			}
			name, types = obj.Name, obj.Types
		}
		if name == "stream" && (len(types) == 0 || containsString(types, "anime") || containsString(types, "series") || containsString(types, "movie")) {
			return true
		}
	}
	return false
}

func manifestSupportsSubtitles(manifest ProviderManifest) bool {
	if supportsStremioSubtitleResource(manifest, "series", "tt0:1:1") ||
		supportsStremioSubtitleResource(manifest, "movie", "tt0") ||
		supportsSubtitleSearch(manifest.Capabilities) {
		return true
	}
	return supportsStremioResource(manifest, "subtitles", "anime", "kitsu:1:1")
}

func deriveAddonConfigureURL(manifestURL string) string {
	parsed, err := url.Parse(manifestURL)
	if err != nil || parsed.Host == "" {
		return ""
	}
	switch {
	case strings.HasSuffix(parsed.Path, "/manifest.json"):
		parsed.Path = strings.TrimSuffix(parsed.Path, "/manifest.json") + "/configure"
	case strings.HasSuffix(parsed.Path, "/manifest"):
		parsed.Path = strings.TrimSuffix(parsed.Path, "/manifest") + "/configure"
	case strings.HasSuffix(parsed.Path, "/"):
		parsed.Path += "configure"
	default:
		parsed.Path += "/configure"
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func parseExistingNativeConfigValues(manifestURL string, fields []StremioConfigField) map[string]string {
	if len(fields) == 0 {
		return nil
	}
	parsed, err := url.Parse(manifestURL)
	if err != nil {
		return nil
	}
	cleaned := strings.Trim(parsed.Path, "/")
	parts := strings.Split(cleaned, "/")
	if len(parts) < 2 {
		return nil
	}
	seg := parts[len(parts)-2]
	decoded, err := url.PathUnescape(seg)
	if err != nil {
		decoded = seg
	}
	decoded = strings.TrimSpace(decoded)
	if !strings.HasPrefix(decoded, "{") {
		return nil
	}
	var rawMap map[string]json.RawMessage
	if json.Unmarshal([]byte(decoded), &rawMap) != nil {
		return nil
	}
	allowed := make(map[string]bool, len(fields))
	for _, f := range fields {
		if f.Key != "" {
			allowed[f.Key] = true
		}
	}
	values := map[string]string{}
	for k, rawVal := range rawMap {
		if !allowed[k] {
			continue
		}
		var flex FlexString
		if (&flex).UnmarshalJSON(rawVal) == nil {
			values[k] = string(flex)
		}
	}
	if len(values) == 0 {
		return nil
	}
	return values
}

func classifyManifestMetadata(manifest ProviderManifest, manifestURL string) (resources []string, supportsStreams, supportsSubtitles, configurable, needsConfig bool, configMode, configureURL string) {
	resources = extractManifestResources(manifest)
	supportsStreams = manifestSupportsStreams(manifest)
	supportsSubtitles = manifestSupportsSubtitles(manifest)
	configurable = manifest.BehaviorHints.Configurable || manifest.BehaviorHints.ConfigurationRequired || len(manifest.Config) > 0
	needsConfig = manifest.BehaviorHints.ConfigurationRequired || (configurable && !supportsStreams && !supportsSubtitles)
	switch {
	case len(manifest.Config) > 0:
		configMode = "native"
	case configurable:
		configMode = "page"
	default:
		configMode = "none"
	}
	if configurable {
		configureURL = deriveAddonConfigureURL(manifestURL)
	}
	return
}

func inspectRemoteAddonManifest(parent context.Context, rawURL string) AddonInspectionResult {
	canonical, ok := normalizeAddonInputURL(rawURL)
	if !ok {
		return AddonInspectionResult{
			InputURL:   rawURL,
			Status:     "invalid_ref",
			ConfigMode: "none",
			Error:      "URL do manifesto inválida.",
		}
	}
	if isSubtitleQueryProviderURL(canonical) {
		host := "Legendas"
		if parsed, err := url.Parse(canonical); err == nil && parsed.Hostname() != "" {
			host = parsed.Hostname()
		}
		return AddonInspectionResult{
			InputURL:    rawURL,
			ManifestURL: canonical,
			Status:      "ready",
			ID:          remoteManifestReferenceID(canonical),
			Name:        "Legendas (" + host + ")",
			Version:     "1.0.0",
			Description: "Busca de legendas externas por títulos/episódio via URL parametrizada.",
			ConfigMode:  "none",
		}
	}
	if isRSSProviderURL(canonical) {
		host := "RSS"
		if parsed, err := url.Parse(canonical); err == nil && parsed.Hostname() != "" {
			host = parsed.Hostname()
		}
		return AddonInspectionResult{
			InputURL:    rawURL,
			ManifestURL: canonical,
			Status:      "ready",
			ID:          remoteManifestReferenceID(canonical),
			Name:        "Feed RSS (" + host + ")",
			Version:     "1.0.0",
			Description: "Busca P2P por títulos e episódio via Feed RSS parametrizado.",
			ConfigMode:  "none",
		}
	}
	ctx, cancel := context.WithTimeout(parent, 6*time.Second)
	defer cancel()

	currentURL := canonical
	var response *http.Response
	var err error
	for hop := 0; hop < 3; hop++ {
		var request *http.Request
		request, err = http.NewRequestWithContext(ctx, http.MethodGet, currentURL, nil)
		if err != nil {
			return AddonInspectionResult{InputURL: rawURL, ManifestURL: canonical, Status: "invalid_ref", ConfigMode: "none", Error: "Falha ao montar requisição."}
		}
		request.Header.Set("Cache-Control", "no-cache, no-store")
		request.Header.Set("Pragma", "no-cache")
		request.Header.Set("Accept", "application/json")
		response, err = providerHTTPClient.Do(request)
		if err != nil {
			return AddonInspectionResult{InputURL: rawURL, ManifestURL: canonical, Status: "offline", ConfigMode: "none", Error: "Não foi possível conectar ao add-on."}
		}
		if response.StatusCode >= 300 && response.StatusCode < 400 {
			loc := strings.TrimSpace(response.Header.Get("Location"))
			response.Body.Close()
			if loc == "" {
				return AddonInspectionResult{InputURL: rawURL, ManifestURL: canonical, Status: "offline", HTTPStatus: response.StatusCode, ConfigMode: "none", Error: "Redirecionamento inválido do add-on."}
			}
			curBase, _ := url.Parse(currentURL)
			nextRef, parseErr := url.Parse(loc)
			if parseErr != nil {
				return AddonInspectionResult{InputURL: rawURL, ManifestURL: canonical, Status: "offline", HTTPStatus: response.StatusCode, ConfigMode: "none", Error: "Redirecionamento inválido do add-on."}
			}
			resolved := curBase.ResolveReference(nextRef)
			if !sameProviderOrigin(curBase, resolved) {
				return AddonInspectionResult{InputURL: rawURL, ManifestURL: canonical, Status: "offline", HTTPStatus: response.StatusCode, ConfigMode: "none", Error: "Redirecionamento externo bloqueado."}
			}
			currentURL = resolved.String()
			continue
		}
		break
	}
	if response == nil {
		return AddonInspectionResult{InputURL: rawURL, ManifestURL: canonical, Status: "offline", ConfigMode: "none", Error: "Sem resposta do add-on."}
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return AddonInspectionResult{
			InputURL:    rawURL,
			ManifestURL: canonical,
			Status:      "offline",
			HTTPStatus:  response.StatusCode,
			ConfigMode:  "none",
			Error:       fmt.Sprintf("O add-on respondeu HTTP %d.", response.StatusCode),
		}
	}

	var manifest ProviderManifest
	if decodeProviderJSON(response.Body, 512<<10, &manifest) != nil || !validAddonIdentity(manifest.ID) {
		return AddonInspectionResult{
			InputURL:    rawURL,
			ManifestURL: canonical,
			Status:      "invalid_manifest",
			HTTPStatus:  response.StatusCode,
			ConfigMode:  "none",
			Error:       "O endereço não retornou um manifesto Stremio válido.",
		}
	}

	resources, supportsStreams, supportsSubtitles, configurable, needsConfig, configMode, configureURL := classifyManifestMetadata(manifest, canonical)
	status := "unsupported"
	if needsConfig {
		status = "configuration_required"
	} else if supportsStreams || supportsSubtitles {
		status = "ready"
	}

	name := strings.TrimSpace(manifest.Name)
	if name == "" {
		name = manifest.ID
	}

	return AddonInspectionResult{
		InputURL:              rawURL,
		ManifestURL:           canonical,
		ConfigureURL:          configureURL,
		Status:                status,
		HTTPStatus:            response.StatusCode,
		ID:                    manifest.ID,
		Name:                  name,
		Version:               manifest.Version,
		Description:           truncateRunes(manifest.Description, 280),
		Logo:                  safeHTTPSMediaURL(manifest.Logo),
		Resources:             resources,
		Types:                 manifest.Types,
		SupportsStreams:       supportsStreams,
		SupportsSubtitles:     supportsSubtitles,
		Configurable:          configurable,
		ConfigurationRequired: manifest.BehaviorHints.ConfigurationRequired,
		ConfigFields:          manifest.Config,
		ConfigMode:            configMode,
		ExistingConfigValues:  parseExistingNativeConfigValues(canonical, manifest.Config),
	}
}

func safeHTTPSMediaURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return ""
	}
	return u.String()
}

func truncateRunes(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return strings.TrimSpace(string(runes[:maxLen-1])) + "…"
}

func directoryEntryURL(raw rawDirectoryAddon) (string, bool) {
	candidate := strings.TrimSpace(raw.ManifestURL)
	if candidate == "" {
		candidate = strings.TrimSpace(raw.TransportURL)
	}
	if candidate == "" {
		return "", false
	}
	canonical, ok := normalizeAddonInputURL(candidate)
	if !ok {
		return "", false
	}
	parsed, err := url.Parse(canonical)
	if err != nil || parsed.Host == "" {
		return "", false
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && trustedLocalProvider(parsed.Host)) {
		return "", false
	}
	lowerPath := strings.ToLower(parsed.Path)
	if !strings.HasSuffix(lowerPath, "/manifest.json") && !strings.HasSuffix(lowerPath, "/manifest") {
		return "", false
	}
	return canonical, true
}

func fetchDirectoryJSON(ctx context.Context, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := providerHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return decodeProviderJSON(resp.Body, 4<<20, out)
}

func fetchCachedCollectionDirectory(ctx context.Context, endpoint string) ([]rawDirectoryAddon, error) {
	directoryCacheMu.Lock()
	cached, ok := directoryCache[endpoint]
	directoryCacheMu.Unlock()
	if ok && time.Since(cached.fetchedAt) < directoryCacheTTL {
		return cached.entries, nil
	}
	var list []rawDirectoryAddon
	if err := fetchDirectoryJSON(ctx, endpoint, &list); err != nil {
		return nil, err
	}
	directoryCacheMu.Lock()
	directoryCache[endpoint] = cachedAddonDirectory{fetchedAt: time.Now(), entries: list}
	directoryCacheMu.Unlock()
	return list, nil
}

func matchesAddonDirectoryFilter(entry rawDirectoryAddon, manifestURL, queryLower, category string) bool {
	_, supportsStreams, supportsSubtitles, _, _, _, _ := classifyManifestMetadata(entry.Manifest, manifestURL)
	switch category {
	case "subtitles":
		if !supportsSubtitles {
			return false
		}
	case "torrents", "streams":
		if !supportsStreams {
			return false
		}
	case "anime":
		hay := strings.ToLower(entry.Manifest.Name + " " + entry.Manifest.Description + " " + entry.Manifest.ID + " " + strings.Join(entry.Manifest.Types, " ") + " " + strings.Join(entry.Manifest.IDPrefixes, " "))
		if !strings.Contains(hay, "anime") && !strings.Contains(hay, "kitsu") && !strings.Contains(hay, "mal") {
			return false
		}
	}
	if queryLower == "" {
		return true
	}
	searchable := strings.ToLower(strings.Join([]string{
		entry.Manifest.ID,
		entry.Manifest.Name,
		entry.Manifest.Description,
		manifestURL,
		strings.Join(entry.Manifest.Types, " "),
		strings.Join(extractManifestResources(entry.Manifest), " "),
	}, " "))
	for _, token := range strings.Fields(queryLower) {
		if !strings.Contains(searchable, token) {
			return false
		}
	}
	return true
}

func searchAddonDirectories(parent context.Context, query, category string, limit int) AddonDirectorySearchResponse {
	if limit <= 0 || limit > 80 {
		limit = 40
	}
	query = strings.TrimSpace(query)
	queryLower := strings.ToLower(query)
	category = strings.ToLower(strings.TrimSpace(category))

	type dirBatch struct {
		name  string
		order int
		items []rawDirectoryAddon
		err   error
	}

	batches := make([]dirBatch, 3)
	var wg sync.WaitGroup

	// 1. stremio-addons.net API
	wg.Add(1)
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(parent, 5*time.Second)
		defer cancel()
		u, err := url.Parse(stremioAddonsNetBaseURL)
		if err != nil {
			batches[0] = dirBatch{name: "stremio-addons.net", order: 0, err: err}
			return
		}
		q := u.Query()
		q.Set("limit", strconv.Itoa(30))
		q.Set("sort_by", "stars")
		if query != "" {
			q.Set("search", query)
		}
		if category == "subtitles" || category == "anime" || category == "torrents" {
			q.Set("category", category)
		}
		u.RawQuery = q.Encode()
		var payload struct {
			Addons []rawDirectoryAddon `json:"addons"`
		}
		err = fetchDirectoryJSON(ctx, u.String(), &payload)
		batches[0] = dirBatch{name: "stremio-addons.net", order: 0, items: payload.Addons, err: err}
	}()

	// 2. api.strem.io/addonscollection.json
	wg.Add(1)
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(parent, 5*time.Second)
		defer cancel()
		entries, err := fetchCachedCollectionDirectory(ctx, stremioCollectionURL)
		batches[1] = dirBatch{name: "Stremio Community", order: 1, items: entries, err: err}
	}()

	// 3. Stremio Official Index
	wg.Add(1)
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(parent, 5*time.Second)
		defer cancel()
		entries, err := fetchCachedCollectionDirectory(ctx, stremioOfficialIndexURL)
		batches[2] = dirBatch{name: "Stremio Oficial", order: 2, items: entries, err: err}
	}()

	wg.Wait()

	sources := make([]AddonDirectorySourceStatus, 0, len(batches))
	mergedMap := map[string]AddonDirectoryItem{}
	idToKey := map[string]string{}

	for _, b := range batches {
		if b.err != nil {
			sources = append(sources, AddonDirectorySourceStatus{Name: b.name, OK: false, Error: b.err.Error()})
			continue
		}
		matchedCount := 0
		for _, raw := range b.items {
			canonical, ok := directoryEntryURL(raw)
			if !ok || !validAddonIdentity(raw.Manifest.ID) {
				continue
			}
			// Notice that stremio-addons.net already filters by query/category server-side,
			// so only apply the local filter strictly to the full-collection directories (or when server didn't).
			if b.order != 0 && !matchesAddonDirectoryFilter(raw, canonical, queryLower, category) {
				continue
			}
			resources, supportsStreams, supportsSubtitles, configurable, _, configMode, configureURL := classifyManifestMetadata(raw.Manifest, canonical)
			if !supportsStreams && !supportsSubtitles && len(resources) == 0 {
				continue
			}
			matchedCount++
			key := canonical
			if existingKey, seenID := idToKey[strings.ToLower(raw.Manifest.ID)]; seenID && strings.Contains(canonical, "/manifest.json") && strings.Contains(existingKey, "/manifest.json") {
				// Prefer the same canonical URL key, or dedupe exact host+id matches only when same URL
				if path.Dir(existingKey) == path.Dir(canonical) {
					key = existingKey
				}
			}
			name := strings.TrimSpace(raw.Manifest.Name)
			if name == "" {
				name = raw.Manifest.ID
			}
			item := AddonDirectoryItem{
				ManifestURL:           canonical,
				ConfigureURL:          configureURL,
				ID:                    raw.Manifest.ID,
				Name:                  name,
				Version:               raw.Manifest.Version,
				Description:           truncateRunes(raw.Manifest.Description, 240),
				Logo:                  safeHTTPSMediaURL(raw.Manifest.Logo),
				Resources:             resources,
				Types:                 raw.Manifest.Types,
				SupportsStreams:       supportsStreams,
				SupportsSubtitles:     supportsSubtitles,
				Configurable:          configurable,
				ConfigurationRequired: raw.Manifest.BehaviorHints.ConfigurationRequired,
				ConfigFields:          raw.Manifest.Config,
				ConfigMode:            configMode,
				Directories:           []string{b.name},
			}
			if existing, exists := mergedMap[key]; exists {
				if !containsString(existing.Directories, b.name) {
					existing.Directories = append(existing.Directories, b.name)
				}
				if existing.Logo == "" && item.Logo != "" {
					existing.Logo = item.Logo
				}
				if len(item.Description) > len(existing.Description) {
					existing.Description = item.Description
				}
				if len(existing.ConfigFields) == 0 && len(item.ConfigFields) > 0 {
					existing.ConfigFields = item.ConfigFields
					existing.ConfigMode = item.ConfigMode
				}
				mergedMap[key] = existing
			} else {
				mergedMap[key] = item
				idToKey[strings.ToLower(raw.Manifest.ID)] = key
			}
		}
		sources = append(sources, AddonDirectorySourceStatus{Name: b.name, OK: true, Count: matchedCount})
	}

	items := make([]AddonDirectoryItem, 0, len(mergedMap))
	for _, item := range mergedMap {
		items = append(items, item)
	}

	sort.SliceStable(items, func(i, j int) bool {
		score := func(it AddonDirectoryItem) int {
			s := 0
			if it.SupportsStreams || it.SupportsSubtitles {
				s += 100
			}
			if !it.ConfigurationRequired {
				s += 25
			}
			if queryLower != "" && strings.Contains(strings.ToLower(it.Name), queryLower) {
				s += 40
			}
			if containsString(it.Directories, "Stremio Oficial") {
				s += 15
			}
			s += len(it.Directories) * 10
			return s
		}
		si, sj := score(items[i]), score(items[j])
		if si != sj {
			return si > sj
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	if len(items) > limit {
		items = items[:limit]
	}

	return AddonDirectorySearchResponse{
		Items:   items,
		Sources: sources,
	}
}

func (c *wsClient) handleWSInspectAddon(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	rawURL, _ := cmd["manifestUrl"].(string)
	res := inspectRemoteAddonManifest(c.ctx, rawURL)
	c.sendEvent("addon_inspect_result", map[string]interface{}{
		"requestId": requestID,
		"result":    res,
	})
}

func (c *wsClient) handleWSInspectAddons(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	rawList, _ := cmd["manifestUrls"].([]interface{})
	urls := make([]string, 0, 30)
	seen := map[string]bool{}
	for _, entry := range rawList {
		u, ok := entry.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(u)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		urls = append(urls, trimmed)
		if len(urls) >= 30 {
			break
		}
	}

	results := make([]AddonInspectionResult, len(urls))
	sem := make(chan struct{}, 6)
	var wg sync.WaitGroup
	for i, rawURL := range urls {
		wg.Add(1)
		go func(idx int, target string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[idx] = inspectRemoteAddonManifest(c.ctx, target)
		}(i, rawURL)
	}
	wg.Wait()

	c.sendEvent("addons_inspect_result", map[string]interface{}{
		"requestId": requestID,
		"results":   results,
	})
}

func (c *wsClient) handleWSSearchAddonDirectories(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	query, _ := cmd["query"].(string)
	category, _ := cmd["category"].(string)
	limit := 40
	if rawLimit, ok := cmd["limit"].(float64); ok && rawLimit > 0 {
		limit = int(rawLimit)
	}
	resp := searchAddonDirectories(c.ctx, query, category, limit)
	c.sendEvent("addon_directory_results", map[string]interface{}{
		"requestId": requestID,
		"items":     resp.Items,
		"sources":   resp.Sources,
	})
}

func (c *wsClient) handleWSStartAddonConfigSession(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	rawURL, _ := cmd["manifestUrl"].(string)
	session, err := startAddonConfigSession(c, rawURL)
	if err != nil {
		c.sendEvent("addon_config_session", map[string]interface{}{
			"requestId": requestID,
			"error":     err.Error(),
		})
		return
	}
	c.sendEvent("addon_config_session", map[string]interface{}{
		"requestId":    requestID,
		"sessionId":    session.ID,
		"token":        session.Token,
		"proxyOrigin":  session.ProxyOrigin,
		"frameUrl":     session.FrameURL(),
		"configureUrl": session.UpstreamConfigureURL(),
	})
}

func (c *wsClient) handleWSCloseAddonConfigSession(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	sessionID, _ := cmd["sessionId"].(string)
	closed := false
	if sessionID != "" {
		closed = closeAddonConfigSessionByOwner(c, sessionID)
	}
	c.sendEvent("addon_config_session_closed", map[string]interface{}{
		"requestId": requestID,
		"sessionId": sessionID,
		"closed":    closed,
	})
}
