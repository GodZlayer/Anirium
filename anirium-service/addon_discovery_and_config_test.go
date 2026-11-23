package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestInspectRemoteAddonManifestClassifications(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/native/manifest.json":
			_, _ = w.Write([]byte(`{
				"id":"community.nyaa.br",
				"name":"Nyaa Anime BR",
				"version":"1.0.0",
				"description":"Animes PT-BR",
				"resources":[],
				"types":[],
				"behaviorHints":{"configurable":true,"configurationRequired":true},
				"config":[
					{"key":"userToken","title":"Token de Acesso","type":"text","required":"true"},
					{"key":"quality","title":"Qualidade","type":"select","options":["1080p","720p"],"default":"1080p"},
					{"key":"onlySubbed","title":"Apenas legendado","type":"checkbox","default":true}
				]
			}`))
		case `/native/{"userToken":"abc123","quality":"720p","onlySubbed":true}/manifest.json`:
			_, _ = w.Write([]byte(`{
				"id":"community.nyaa.br",
				"name":"Nyaa Anime BR",
				"version":"1.0.0",
				"resources":["stream"],
				"types":["anime","series"],
				"idPrefixes":["kitsu:"],
				"behaviorHints":{"configurable":true,"configurationRequired":false},
				"config":[
					{"key":"userToken","title":"Token de Acesso","type":"text","required":"true"},
					{"key":"quality","title":"Qualidade","type":"select","options":["1080p","720p"],"default":"1080p"},
					{"key":"onlySubbed","title":"Apenas legendado","type":"checkbox","default":true}
				]
			}`))
		case "/page/manifest.json":
			_, _ = w.Write([]byte(`{
				"id":"community.subdl.subtitles",
				"name":"SubDL Subtitles",
				"version":"1.2.2",
				"resources":["subtitles"],
				"types":["movie","series"],
				"behaviorHints":{"configurable":true,"configurationRequired":true}
			}`))
		case "/ready/manifest.json":
			_, _ = w.Write([]byte(`{
				"id":"org.stremio.opensubtitlesv3",
				"name":"OpenSubtitles v3",
				"version":"1.0.0",
				"resources":["subtitles"],
				"types":["movie","series"],
				"idPrefixes":["tt"]
			}`))
		case "/catalog-only/manifest.json":
			_, _ = w.Write([]byte(`{
				"id":"community.catalog.only",
				"name":"Apenas Catálogo",
				"version":"1.0.0",
				"resources":["catalog"],
				"types":["series"]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", srv.URL)

	nativeRes := inspectRemoteAddonManifest(context.Background(), srv.URL+"/native/manifest.json")
	if nativeRes.Status != "configuration_required" || nativeRes.ConfigMode != "native" {
		t.Fatalf("native addon unexpected: %+v", nativeRes)
	}
	if len(nativeRes.ConfigFields) != 3 || !bool(nativeRes.ConfigFields[0].Required) || nativeRes.ConfigFields[2].Default != "true" {
		t.Fatalf("unexpected native config fields: %+v", nativeRes.ConfigFields)
	}

	configuredURL := srv.URL + "/native/" + url.PathEscape(`{"userToken":"abc123","quality":"720p","onlySubbed":true}`) + "/manifest.json"
	configuredNativeRes := inspectRemoteAddonManifest(context.Background(), configuredURL)
	if configuredNativeRes.Status != "ready" || !configuredNativeRes.SupportsStreams || !configuredNativeRes.Configurable {
		t.Fatalf("configured native addon should be ready: %+v", configuredNativeRes)
	}
	if configuredNativeRes.ExistingConfigValues["userToken"] != "abc123" || configuredNativeRes.ExistingConfigValues["quality"] != "720p" {
		t.Fatalf("expected parsed existing config values, got %+v", configuredNativeRes.ExistingConfigValues)
	}

	pageRes := inspectRemoteAddonManifest(context.Background(), srv.URL+"/page/manifest.json")
	if pageRes.Status != "configuration_required" || pageRes.ConfigMode != "page" || pageRes.ConfigureURL != srv.URL+"/page/configure" {
		t.Fatalf("page addon unexpected: %+v", pageRes)
	}

	readyRes := inspectRemoteAddonManifest(context.Background(), srv.URL+"/ready/manifest.json")
	if readyRes.Status != "ready" || !readyRes.SupportsSubtitles || readyRes.ConfigMode != "none" {
		t.Fatalf("ready addon unexpected: %+v", readyRes)
	}

	catRes := inspectRemoteAddonManifest(context.Background(), srv.URL+"/catalog-only/manifest.json")
	if catRes.Status != "unsupported" {
		t.Fatalf("catalog-only addon should be unsupported, got %+v", catRes)
	}
}

func TestSearchAddonDirectoriesAggregatesDeduplicatesAndToleratesFailure(t *testing.T) {
	dirNet := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"addons":[
				{
					"manifestUrl":"https://opensubtitles-v3.strem.io/manifest.json",
					"manifest":{
						"id":"org.stremio.opensubtitlesv3",
						"name":"OpenSubtitles v3",
						"version":"1.0.0",
						"description":"Official OpenSubtitles v3",
						"resources":["subtitles"],
						"types":["movie","series"]
					}
				},
				{
					"manifestUrl":"https://subdl.strem.top/manifest.json",
					"manifest":{
						"id":"community.subdl",
						"name":"SubDL Subtitles",
						"version":"1.2.0",
						"resources":["subtitles"],
						"types":["movie","series"],
						"behaviorHints":{"configurable":true,"configurationRequired":true}
					}
				}
			]
		}`))
	}))
	defer dirNet.Close()

	dirCollection := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream down", http.StatusInternalServerError)
	}))
	defer dirCollection.Close()

	dirOfficial := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{
				"transportUrl":"https://opensubtitles-v3.strem.io/manifest.json",
				"manifest":{
					"id":"org.stremio.opensubtitlesv3",
					"name":"OpenSubtitles v3",
					"version":"1.0.0",
					"description":"Official OpenSubtitles v3 (rich description)",
					"logo":"https://example.com/osv3.png",
					"resources":["subtitles"],
					"types":["movie","series"],
					"idPrefixes":["tt"]
				}
			},
			{
				"transportUrl":"https://anime-kitsu.strem.fun/manifest.json",
				"manifest":{
					"id":"community.anime.kitsu",
					"name":"Anime Kitsu",
					"version":"0.0.10",
					"resources":["catalog","meta"],
					"types":["anime"]
				}
			},
			{
				"transportUrl":"https://opensubtitles.strem.io/stremio/v1",
				"manifest":{
					"id":"org.stremio.opensubtitles",
					"name":"OpenSubtitles",
					"version":"0.24.0",
					"resources":["subtitles"],
					"types":["movie","series"]
				}
			},
			{
				"transportUrl":"http://127.0.0.1:11470/local-addon/manifest.json",
				"manifest":{
					"id":"org.stremio.local",
					"name":"Local Files Subtitle",
					"version":"1.0.0",
					"resources":["subtitles"],
					"types":["movie","series"]
				}
			}
		]`))
	}))
	defer dirOfficial.Close()

	prevNet, prevCol, prevOff := stremioAddonsNetBaseURL, stremioCollectionURL, stremioOfficialIndexURL
	stremioAddonsNetBaseURL = dirNet.URL
	stremioCollectionURL = dirCollection.URL + "/addonscollection.json"
	stremioOfficialIndexURL = dirOfficial.URL + "/index.json"
	defer func() {
		stremioAddonsNetBaseURL, stremioCollectionURL, stremioOfficialIndexURL = prevNet, prevCol, prevOff
	}()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", strings.Join([]string{dirNet.URL, dirCollection.URL, dirOfficial.URL}, ","))

	res := searchAddonDirectories(context.Background(), "subtitle", "subtitles", 20)
	if len(res.Sources) != 3 {
		t.Fatalf("expected 3 source statuses, got %+v", res.Sources)
	}
	if len(res.Items) != 2 {
		t.Fatalf("expected 2 deduplicated subtitle items (non-manifest, loopback, and catalog-only filtered out), got %+v", res.Items)
	}
	if res.Items[0].ID != "org.stremio.opensubtitlesv3" || len(res.Items[0].Directories) != 2 || res.Items[0].Logo == "" {
		t.Fatalf("expected merged OpenSubtitles v3 first with 2 directories and logo, got %+v", res.Items[0])
	}
}

func TestAddonConfigProxyBridgeRewritesHeadersScriptsAndCapturesViaWS(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/configure":
			w.Header().Set("Location", "/configure/")
			w.WriteHeader(http.StatusFound)
		case "/configure/":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'nonce-test123'; frame-ancestors 'none'")
			w.Header().Add("Set-Cookie", "sid=xyz; Path=/; Secure; Domain=upstream.example; HttpOnly")
			_, _ = w.Write([]byte(`<!doctype html><html><head><title>Cfg</title></head><body><a href="stremio://upstream.example/token=1/manifest.json">Install</a><script nonce="test123" src="/cfg.js"></script></body></html>`))
		case "/cfg.js":
			w.Header().Set("Content-Type", "application/javascript")
			_, _ = w.Write([]byte(`window.installUrl = "stremio://" + window.location.host + "/source=nyaa&lang=pt/manifest.json"; window.webUrl = "https://web.stremio.com/#/addons?addon=" + encodeURIComponent(window.installUrl);`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", upstream.URL)

	wsSrv := httptest.NewServer(http.HandlerFunc(handleWebSocket))
	defer wsSrv.Close()

	wsURL := "ws" + strings.TrimPrefix(wsSrv.URL, "http") + "/ws"
	headers := http.Header{}
	headers.Set("Origin", "http://127.0.0.1:8080")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial ws: %v", err)
	}
	defer conn.Close()

	_ = conn.WriteJSON(map[string]interface{}{
		"action":      "start_addon_config_session",
		"requestId":   "cfg-1",
		"manifestUrl": upstream.URL + "/manifest.json",
	})

	_, sessionPayload := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "addon_config_session" && p["requestId"] == "cfg-1"
	})
	sessionID, _ := sessionPayload["sessionId"].(string)
	frameURL, _ := sessionPayload["frameUrl"].(string)
	proxyOrigin, _ := sessionPayload["proxyOrigin"].(string)
	if sessionID == "" || !strings.HasPrefix(frameURL, proxyOrigin+"/configure") {
		t.Fatalf("unexpected session payload: %+v", sessionPayload)
	}

	httpClient := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	// 1. Check same-origin redirect rewrite (/configure -> proxy /configure/)
	redirResp, err := httpClient.Get(frameURL)
	if err != nil {
		t.Fatalf("GET proxy /configure: %v", err)
	}
	redirResp.Body.Close()
	if redirResp.StatusCode != http.StatusFound || redirResp.Header.Get("Location") != proxyOrigin+"/configure/" {
		t.Fatalf("expected rewritten proxy redirect, got status=%d loc=%q", redirResp.StatusCode, redirResp.Header.Get("Location"))
	}

	// 2. Check HTML header sanitization, cookie rewrite, and CSP nonce bridge injection
	htmlResp, err := httpClient.Get(proxyOrigin + "/configure/")
	if err != nil {
		t.Fatalf("GET proxy /configure/: %v", err)
	}
	htmlBody, _ := io.ReadAll(htmlResp.Body)
	htmlResp.Body.Close()
	if htmlResp.Header.Get("X-Frame-Options") != "" {
		t.Fatalf("expected X-Frame-Options stripped, got %q", htmlResp.Header.Get("X-Frame-Options"))
	}
	if strings.Contains(strings.ToLower(htmlResp.Header.Get("Content-Security-Policy")), "frame-ancestors") {
		t.Fatalf("expected frame-ancestors stripped from CSP: %q", htmlResp.Header.Get("Content-Security-Policy"))
	}
	cookie := htmlResp.Header.Get("Set-Cookie")
	if strings.Contains(strings.ToLower(cookie), "secure") || strings.Contains(strings.ToLower(cookie), "domain=") {
		t.Fatalf("expected Secure/Domain stripped from Set-Cookie: %q", cookie)
	}
	if !strings.Contains(string(htmlBody), `<script src="/__anirium_bridge__.js" nonce="test123"></script>`) {
		t.Fatalf("expected bridge tag with preserved CSP nonce, got %q", string(htmlBody))
	}
	if !strings.Contains(string(htmlBody), proxyOrigin+"/__anirium_install__/stremio://") {
		t.Fatalf("expected stremio:// rewritten in HTML, got %q", string(htmlBody))
	}

	// 3. Check JS rewrite
	jsResp, err := httpClient.Get(proxyOrigin + "/cfg.js")
	if err != nil {
		t.Fatalf("GET proxy /cfg.js: %v", err)
	}
	jsBody, _ := io.ReadAll(jsResp.Body)
	jsResp.Body.Close()
	if !strings.Contains(string(jsBody), proxyOrigin+"/__anirium_install__/web/") {
		t.Fatalf("expected web.stremio.com prefix rewritten in JS: %q", string(jsBody))
	}

	// 4. Trigger /__anirium_install__/ preserving & and = and verify WS addon_config_captured event
	instURL := proxyOrigin + "/__anirium_install__/stremio://" + strings.TrimPrefix(proxyOrigin, "http://") + "/source=nyaa&lang=pt/manifest.json"
	instResp, err := httpClient.Get(instURL)
	if err != nil {
		t.Fatalf("GET /__anirium_install__: %v", err)
	}
	instBody, _ := io.ReadAll(instResp.Body)
	instResp.Body.Close()
	if instResp.StatusCode != http.StatusOK || !strings.Contains(string(instBody), "anirium:addon-configured") {
		t.Fatalf("unexpected capture HTML response status=%d body=%q", instResp.StatusCode, string(instBody))
	}

	_, capturedPayload := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "addon_config_captured" && p["sessionId"] == sessionID
	})
	wantManifest := upstream.URL + "/source=nyaa&lang=pt/manifest.json"
	if capturedPayload["manifestUrl"] != wantManifest {
		t.Fatalf("captured manifestUrl = %v, want %v", capturedPayload["manifestUrl"], wantManifest)
	}

	// 5. Verify close_addon_config_session shuts down ephemeral listener
	_ = conn.WriteJSON(map[string]interface{}{
		"action":    "close_addon_config_session",
		"requestId": "cfg-close",
		"sessionId": sessionID,
	})
	_, closedPayload := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "addon_config_session_closed" && p["requestId"] == "cfg-close"
	})
	if closedPayload["closed"] != true {
		t.Fatalf("expected closed=true, got %+v", closedPayload)
	}

	// 6. Verify POST /__anirium_capture__ normalizes web.stremio.com encoded wrapper cleanly
	_ = conn.WriteJSON(map[string]interface{}{
		"action":      "start_addon_config_session",
		"requestId":   "cfg-2",
		"manifestUrl": upstream.URL + "/manifest.json",
	})
	_, session2Payload := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "addon_config_session" && p["requestId"] == "cfg-2"
	})
	session2ID := session2Payload["sessionId"].(string)
	proxy2Origin := session2Payload["proxyOrigin"].(string)

	encodedInner := url.PathEscape(proxy2Origin + "/" + url.PathEscape(`{"lang":"pob"}`) + "/manifest.json")
	postBody, _ := json.Marshal(map[string]string{
		"url": "https://web.stremio.com/#/addons?addon=" + encodedInner,
	})
	capResp, err := httpClient.Post(proxy2Origin+"/__anirium_capture__", "application/json", strings.NewReader(string(postBody)))
	if err != nil {
		t.Fatalf("POST /__anirium_capture__: %v", err)
	}
	capResp.Body.Close()
	if capResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from /__anirium_capture__, got %d", capResp.StatusCode)
	}
	_, cap2Payload := readWSEventMatching(t, conn, 5*time.Second, func(ev string, p map[string]interface{}) bool {
		return ev == "addon_config_captured" && p["sessionId"] == session2ID
	})
	want2 := upstream.URL + "/" + url.PathEscape(`{"lang":"pob"}`) + "/manifest.json"
	if cap2Payload["manifestUrl"] != want2 {
		t.Fatalf("captured POST manifestUrl = %v, want %v", cap2Payload["manifestUrl"], want2)
	}
}
