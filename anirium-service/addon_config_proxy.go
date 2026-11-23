package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	addonConfigSessionIdleTTL    = 10 * time.Minute
	maxActiveAddonConfigSessions = 4
	maxProxiedBodyBytes          = 4 << 20
	maxCaptureBodyBytes          = 16 << 10
)

var cspNonceRegexp = regexp.MustCompile(`(?i)'nonce-([a-zA-Z0-9+/_=-]+)'`)

type addonConfigSession struct {
	ID                   string
	Token                string
	ParentOrigin         string
	UpstreamScheme       string
	UpstreamHost         string
	InitialConfigurePath string
	ProxyOrigin          string
	ProxyHostPort        string
	Owner                *wsClient
	Listener             net.Listener
	Server               *http.Server
	CreatedAt            time.Time

	mu           sync.Mutex
	LastUsedAt   time.Time
	closed       bool
	capturedOnce sync.Once
}

var (
	addonConfigSessionsMu sync.Mutex
	addonConfigSessions   = map[string]*addonConfigSession{}
)

func init() {
	go cleanupExpiredAddonConfigSessionsLoop()
}

func cleanupExpiredAddonConfigSessionsLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		var expired []*addonConfigSession
		now := time.Now()
		addonConfigSessionsMu.Lock()
		for _, s := range addonConfigSessions {
			s.mu.Lock()
			idle := now.Sub(s.LastUsedAt)
			isClosed := s.closed
			s.mu.Unlock()
			if isClosed || idle > addonConfigSessionIdleTTL {
				expired = append(expired, s)
			}
		}
		addonConfigSessionsMu.Unlock()
		for _, s := range expired {
			s.Close()
		}
	}
}

func randomHexToken(byteLen int) (string, error) {
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func startAddonConfigSession(owner *wsClient, rawManifestURL string) (*addonConfigSession, error) {
	canonical, ok := normalizeAddonInputURL(rawManifestURL)
	if !ok {
		return nil, fmt.Errorf("URL do manifesto inválida")
	}
	parsedManifest, err := url.Parse(canonical)
	if err != nil || parsedManifest.Host == "" {
		return nil, fmt.Errorf("URL do manifesto inválida")
	}
	if parsedManifest.Scheme != "https" && !(parsedManifest.Scheme == "http" && trustedLocalProvider(parsedManifest.Host)) {
		return nil, fmt.Errorf("apenas add-ons HTTPS são permitidos")
	}
	configureStr := deriveAddonConfigureURL(canonical)
	parsedConfigure, err := url.Parse(configureStr)
	if err != nil || parsedConfigure.Path == "" {
		return nil, fmt.Errorf("URL de configuração inválida")
	}
	sessionID, err := randomHexToken(12)
	if err != nil {
		return nil, err
	}
	token, err := randomHexToken(16)
	if err != nil {
		return nil, err
	}

	parentOrigin := ""
	if owner != nil && owner.origin != "" && trustedPlayerOrigin(owner.origin) {
		parentOrigin = owner.origin
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("falha ao abrir sessão local: %w", err)
	}
	addr := listener.Addr().(*net.TCPAddr)
	proxyHostPort := fmt.Sprintf("127.0.0.1:%d", addr.Port)
	proxyOrigin := "http://" + proxyHostPort

	session := &addonConfigSession{
		ID:                   sessionID,
		Token:                token,
		ParentOrigin:         parentOrigin,
		UpstreamScheme:       parsedManifest.Scheme,
		UpstreamHost:         parsedManifest.Host,
		InitialConfigurePath: parsedConfigure.Path,
		ProxyOrigin:          proxyOrigin,
		ProxyHostPort:        proxyHostPort,
		Owner:                owner,
		Listener:             listener,
		CreatedAt:            time.Now(),
		LastUsedAt:           time.Now(),
	}

	session.Server = &http.Server{
		// Use raw HandlerFunc instead of http.ServeMux so // inside
		// /__anirium_install__/stremio://... is never cleaned or 301-redirected.
		Handler:           http.HandlerFunc(session.serveHTTP),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       20 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    32 * 1024,
	}

	// Register session (evicting oldest if over capacity) before serving requests.
	var toEvict []*addonConfigSession
	addonConfigSessionsMu.Lock()
	for len(addonConfigSessions) >= maxActiveAddonConfigSessions {
		var oldest *addonConfigSession
		for _, candidate := range addonConfigSessions {
			if oldest == nil || candidate.CreatedAt.Before(oldest.CreatedAt) {
				oldest = candidate
			}
		}
		if oldest == nil {
			break
		}
		delete(addonConfigSessions, oldest.ID)
		toEvict = append(toEvict, oldest)
	}
	addonConfigSessions[session.ID] = session
	addonConfigSessionsMu.Unlock()
	for _, old := range toEvict {
		old.Close()
	}

	go func() {
		if err := session.Server.Serve(listener); err != nil && err != http.ErrServerClosed {
			appendLog(fmt.Sprintf("Addon config proxy ended id=%s err=%v", session.ID, err))
		}
	}()

	return session, nil
}

func closeAddonConfigSessionByOwner(owner *wsClient, sessionID string) bool {
	addonConfigSessionsMu.Lock()
	session, ok := addonConfigSessions[sessionID]
	if ok && owner != nil && session.Owner != nil && session.Owner != owner {
		addonConfigSessionsMu.Unlock()
		return false
	}
	if ok {
		delete(addonConfigSessions, sessionID)
	}
	addonConfigSessionsMu.Unlock()
	if ok {
		session.Close()
		return true
	}
	return false
}

func closeAddonConfigSessionsForClient(owner *wsClient) {
	if owner == nil {
		return
	}
	var owned []*addonConfigSession
	addonConfigSessionsMu.Lock()
	for id, s := range addonConfigSessions {
		if s.Owner == owner {
			owned = append(owned, s)
			delete(addonConfigSessions, id)
		}
	}
	addonConfigSessionsMu.Unlock()
	for _, s := range owned {
		s.Close()
	}
}

func (s *addonConfigSession) FrameURL() string {
	return s.ProxyOrigin + s.InitialConfigurePath
}

func (s *addonConfigSession) UpstreamConfigureURL() string {
	return s.UpstreamScheme + "://" + s.UpstreamHost + s.InitialConfigurePath
}

func (s *addonConfigSession) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	srv := s.Server
	ln := s.Listener
	s.mu.Unlock()

	addonConfigSessionsMu.Lock()
	delete(addonConfigSessions, s.ID)
	addonConfigSessionsMu.Unlock()

	if srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = srv.Shutdown(ctx)
		cancel()
	}
	if ln != nil {
		_ = ln.Close()
	}
}

func (s *addonConfigSession) touch() {
	s.mu.Lock()
	s.LastUsedAt = time.Now()
	s.mu.Unlock()
}

func (s *addonConfigSession) emitCaptured(manifestURL string) {
	s.capturedOnce.Do(func() {
		if s.Owner != nil {
			s.Owner.sendEvent("addon_config_captured", map[string]interface{}{
				"sessionId":   s.ID,
				"manifestUrl": manifestURL,
			})
		}
	})
}

func (s *addonConfigSession) validLocalHost(hostHeader string) bool {
	if hostHeader == s.ProxyHostPort {
		return true
	}
	_, port, err := net.SplitHostPort(s.ProxyHostPort)
	if err != nil {
		return false
	}
	reqHost, reqPort, err := net.SplitHostPort(hostHeader)
	if err != nil {
		return false
	}
	return reqPort == port && (reqHost == "127.0.0.1" || reqHost == "localhost" || reqHost == "::1")
}

func (s *addonConfigSession) normalizeCapturedManifestURL(raw string) (string, bool) {
	val := strings.TrimSpace(raw)
	val = strings.TrimPrefix(val, "web/")
	lower := strings.ToLower(val)
	if strings.HasPrefix(lower, "https%3a%2f%2f") || strings.HasPrefix(lower, "http%3a%2f%2f") || strings.HasPrefix(lower, "stremio%3a%2f%2f") {
		if decoded, err := url.PathUnescape(val); err == nil {
			val = decoded
		}
	}
	val = unwrapWebStremioInstallURL(val)
	lower = strings.ToLower(val)
	if strings.HasPrefix(lower, "stremio://") {
		rest := val[len("stremio://"):]
		restLower := strings.ToLower(rest)
		if strings.HasPrefix(restLower, "http://") || strings.HasPrefix(restLower, "https://") {
			val = rest
		} else {
			val = "https://" + rest
		}
	}

	parsed, err := url.Parse(val)
	if err != nil || parsed.Host == "" {
		return "", false
	}
	_, port, _ := net.SplitHostPort(s.ProxyHostPort)
	localLoopback := parsed.Port() == port && (parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost" || parsed.Hostname() == "::1")
	if localLoopback {
		parsed.Scheme = s.UpstreamScheme
		parsed.Host = s.UpstreamHost
		val = parsed.String()
	} else if parsed.Scheme != "https" && !(parsed.Scheme == "http" && trustedLocalProvider(parsed.Host)) {
		// e.g., stremio://upstreamHost in a loopback test
		if strings.EqualFold(parsed.Host, s.UpstreamHost) {
			parsed.Scheme = s.UpstreamScheme
			val = parsed.String()
		}
	}

	canonical, ok := canonicalizeManifestURL(val)
	if !ok {
		return "", false
	}
	finalURL, err := url.Parse(canonical)
	if err != nil || !strings.EqualFold(finalURL.Host, s.UpstreamHost) {
		return "", false
	}
	lowerPath := strings.ToLower(finalURL.Path)
	if !strings.Contains(lowerPath, "manifest") || strings.HasSuffix(lowerPath, "/configure") {
		return "", false
	}
	return canonical, true
}

func (s *addonConfigSession) serveHTTP(w http.ResponseWriter, r *http.Request) {
	if !s.validLocalHost(r.Host) {
		http.Error(w, "Forbidden local config host", http.StatusForbidden)
		return
	}
	s.touch()
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")

	rawURI := r.RequestURI
	if rawURI == "" {
		rawURI = r.URL.RequestURI()
	}

	const installPrefix = "/__anirium_install__/"
	if strings.HasPrefix(rawURI, installPrefix) {
		s.handleInstallRoute(w, strings.TrimPrefix(rawURI, installPrefix))
		return
	}

	if r.URL.Path == "/__anirium_capture__" && r.Method == http.MethodPost {
		s.handleCapturePOST(w, r)
		return
	}

	if r.URL.Path == "/__anirium_bridge__.js" && (r.Method == http.MethodGet || r.Method == http.MethodHead) {
		s.serveBridgeScript(w)
		return
	}

	s.proxyUpstream(w, r, rawURI)
}

func (s *addonConfigSession) handleInstallRoute(w http.ResponseWriter, rawTail string) {
	manifestURL, ok := s.normalizeCapturedManifestURL(rawTail)
	if !ok {
		http.Error(w, "Invalid configured addon URL", http.StatusBadRequest)
		return
	}
	s.emitCaptured(manifestURL)
	s.writeCapturedHTML(w, manifestURL)
}

func (s *addonConfigSession) handleCapturePOST(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxCaptureBodyBytes)
	var payload struct {
		URL string `json:"url"`
	}
	if json.NewDecoder(r.Body).Decode(&payload) != nil {
		http.Error(w, "Invalid capture payload", http.StatusBadRequest)
		return
	}
	manifestURL, ok := s.normalizeCapturedManifestURL(payload.URL)
	if !ok {
		http.Error(w, "Invalid manifest URL", http.StatusUnprocessableEntity)
		return
	}
	s.emitCaptured(manifestURL)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":          true,
		"manifestUrl": manifestURL,
	})
}

func (s *addonConfigSession) writeCapturedHTML(w http.ResponseWriter, manifestURL string) {
	msgJSON, _ := json.Marshal(map[string]string{
		"type":        "anirium:addon-configured",
		"sessionId":   s.ID,
		"token":       s.Token,
		"manifestUrl": manifestURL,
	})
	targetOrigin := s.ProxyOrigin
	if s.ParentOrigin != "" {
		targetOrigin = s.ParentOrigin
	}
	targetJSON, _ := json.Marshal(targetOrigin)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Anirium</title>
<style>body{margin:0;background:#111116;color:#f4f4f5;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}p{color:#a1a1aa;font-size:13px}.ok{color:#ffc766;font-weight:700;font-size:16px}</style>
</head>
<body><div><div class="ok">Configuração capturada</div><p>Validando e instalando add-on no Anirium...</p></div>
<script>(function(){try{if(window.parent&&window.parent!==window){window.parent.postMessage(%s,%s);}}catch(e){}})();</script>
</body></html>`, string(msgJSON), string(targetJSON))
}

func (s *addonConfigSession) serveBridgeScript(w http.ResponseWriter) {
	targetOrigin := s.ProxyOrigin
	if s.ParentOrigin != "" {
		targetOrigin = s.ParentOrigin
	}
	cfgJSON, _ := json.Marshal(map[string]string{
		"sessionId":    s.ID,
		"token":        s.Token,
		"proxyOrigin":  s.ProxyOrigin,
		"targetOrigin": targetOrigin,
	})
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	fmt.Fprintf(w, `(function(){
var cfg = %s;
var sent = false;
function looksLikeManifestUrl(raw) {
  if (!raw || typeof raw !== "string") return false;
  var s = raw.trim();
  if (/^stremio:\/\//i.test(s)) return true;
  if (/web\.stremio\.com\/#\/addons\?addon=/i.test(s)) return true;
  if (s.indexOf("/__anirium_install__/") !== -1) return true;
  return /\/manifest(\.json)?([?#].*)?$/i.test(s);
}
function extractCandidate(raw) {
  if (!raw || typeof raw !== "string") return "";
  var s = raw.trim();
  var idx = s.indexOf("/__anirium_install__/");
  if (idx !== -1) s = s.slice(idx + "/__anirium_install__/".length);
  return s;
}
function notifyCaptured(rawUrl) {
  if (!looksLikeManifestUrl(rawUrl) || sent) return;
  var cleaned = extractCandidate(rawUrl);
  fetch("/__anirium_capture__", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: cleaned })
  }).then(function(r) {
    if (!r.ok) return null;
    return r.json();
  }).then(function(data) {
    if (data && data.ok && data.manifestUrl) {
      sent = true;
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: "anirium:addon-configured",
            sessionId: cfg.sessionId,
            token: cfg.token,
            manifestUrl: data.manifestUrl
          }, cfg.targetOrigin);
        }
      } catch (e) {}
    }
  }).catch(function(){});
}
document.addEventListener("click", function(ev) {
  var el = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
  if (!el) return;
  var href = el.getAttribute("href") || "";
  if (looksLikeManifestUrl(href)) {
    ev.preventDefault();
    ev.stopPropagation();
    notifyCaptured(href);
  }
}, true);
var origOpen = window.open;
window.open = function(url) {
  if (typeof url === "string" && looksLikeManifestUrl(url)) {
    notifyCaptured(url);
    return null;
  }
  return origOpen ? origOpen.apply(window, arguments) : null;
};
if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
  var origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = function(text) {
    if (typeof text === "string" && looksLikeManifestUrl(text)) {
      notifyCaptured(text);
    }
    return origWrite(text);
  };
}
})();`, string(cfgJSON))
}

func (s *addonConfigSession) proxyUpstream(w http.ResponseWriter, r *http.Request, rawURI string) {
	if !strings.HasPrefix(rawURI, "/") {
		rawURI = "/" + rawURI
	}
	targetURL := s.UpstreamScheme + "://" + s.UpstreamHost + rawURI

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	var bodyReader io.Reader
	if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
		bodyReader = io.LimitReader(r.Body, maxProxiedBodyBytes)
	}
	upReq, err := http.NewRequestWithContext(ctx, r.Method, targetURL, bodyReader)
	if err != nil {
		http.Error(w, "Invalid upstream request", http.StatusBadRequest)
		return
	}

	upstreamOrigin := s.UpstreamScheme + "://" + s.UpstreamHost
	for _, hName := range []string{"Accept", "Accept-Language", "Content-Type", "Cookie", "X-Requested-With", "X-CSRF-Token", "X-XSRF-Token"} {
		for _, v := range r.Header.Values(hName) {
			upReq.Header.Add(hName, v)
		}
	}
	if r.Header.Get("Origin") != "" {
		upReq.Header.Set("Origin", upstreamOrigin)
	}
	if ref := r.Header.Get("Referer"); ref != "" {
		if parsedRef, parseErr := url.Parse(ref); parseErr == nil {
			parsedRef.Scheme = s.UpstreamScheme
			parsedRef.Host = s.UpstreamHost
			upReq.Header.Set("Referer", parsedRef.String())
		}
	}
	upReq.Header.Set("Accept-Encoding", "identity")

	resp, err := providerHTTPClient.Do(upReq)
	if err != nil {
		http.Error(w, "Não foi possível carregar a página de configuração do add-on.", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		loc := strings.TrimSpace(resp.Header.Get("Location"))
		if loc != "" {
			if capturedURL, ok := s.normalizeCapturedManifestURL(loc); ok {
				s.emitCaptured(capturedURL)
				s.writeCapturedHTML(w, capturedURL)
				return
			}
			if parsedLoc, parseErr := url.Parse(loc); parseErr == nil {
				if parsedLoc.Host == "" || strings.EqualFold(parsedLoc.Host, s.UpstreamHost) {
					parsedLoc.Scheme = "http"
					parsedLoc.Host = s.ProxyHostPort
					w.Header().Set("Location", parsedLoc.String())
				} else {
					w.Header().Set("Location", loc)
				}
			}
		}
		copyUpstreamCookies(w, resp)
		w.WriteHeader(resp.StatusCode)
		return
	}

	bodyBytes, err := readProxiedResponseBytes(resp)
	if err != nil {
		http.Error(w, "Erro ao ler resposta do add-on.", http.StatusBadGateway)
		return
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	isHTML := strings.Contains(contentType, "text/html")
	isJS := strings.Contains(contentType, "javascript") || strings.Contains(contentType, "ecmascript")

	nonce := ""
	for k, vals := range resp.Header {
		lowerKey := strings.ToLower(k)
		switch lowerKey {
		case "x-frame-options", "content-security-policy-report-only", "content-length", "content-encoding", "transfer-encoding", "set-cookie":
			continue
		case "content-security-policy":
			for _, v := range vals {
				if n := extractCSPNonce(v); n != "" && nonce == "" {
					nonce = n
				}
				if cleaned := sanitizeConfigCSP(v); cleaned != "" {
					w.Header().Add("Content-Security-Policy", cleaned)
				}
			}
		default:
			for _, v := range vals {
				w.Header().Add(k, v)
			}
		}
	}
	copyUpstreamCookies(w, resp)

	if isHTML || isJS {
		text := string(bodyBytes)
		text = strings.ReplaceAll(text, "stremio://", s.ProxyOrigin+"/__anirium_install__/stremio://")
		text = strings.ReplaceAll(text, "https://web.stremio.com/#/addons?addon=", s.ProxyOrigin+"/__anirium_install__/web/")
		if isHTML {
			text = injectBridgeIntoHTML(text, nonce)
		}
		bodyBytes = []byte(text)
	} else if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}

	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(bodyBytes)
}

func readProxiedResponseBytes(resp *http.Response) ([]byte, error) {
	var reader io.Reader = io.LimitReader(resp.Body, maxProxiedBodyBytes)
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Encoding")), "gzip") {
		gz, err := gzip.NewReader(reader)
		if err != nil {
			return nil, err
		}
		defer gz.Close()
		reader = io.LimitReader(gz, maxProxiedBodyBytes)
	}
	return io.ReadAll(reader)
}

func copyUpstreamCookies(w http.ResponseWriter, resp *http.Response) {
	for _, rawCookie := range resp.Header.Values("Set-Cookie") {
		parts := strings.Split(rawCookie, ";")
		kept := make([]string, 0, len(parts))
		for i, part := range parts {
			trimmed := strings.TrimSpace(part)
			if i == 0 {
				kept = append(kept, trimmed)
				continue
			}
			lower := strings.ToLower(trimmed)
			if lower == "secure" || strings.HasPrefix(lower, "domain=") || strings.HasPrefix(lower, "samesite=none") {
				continue
			}
			kept = append(kept, trimmed)
		}
		if len(kept) > 0 {
			w.Header().Add("Set-Cookie", strings.Join(kept, "; "))
		}
	}
}

func extractCSPNonce(csp string) string {
	m := cspNonceRegexp.FindStringSubmatch(csp)
	if len(m) >= 2 {
		return m[1]
	}
	return ""
}

func sanitizeConfigCSP(csp string) string {
	directives := strings.Split(csp, ";")
	kept := make([]string, 0, len(directives))
	for _, dir := range directives {
		trimmed := strings.TrimSpace(dir)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "frame-ancestors") || lower == "upgrade-insecure-requests" || strings.HasPrefix(lower, "block-all-mixed-content") {
			continue
		}
		kept = append(kept, trimmed)
	}
	return strings.Join(kept, "; ")
}

func injectBridgeIntoHTML(htmlText, nonce string) string {
	tag := `<script src="/__anirium_bridge__.js"></script>`
	if nonce != "" {
		tag = fmt.Sprintf(`<script src="/__anirium_bridge__.js" nonce="%s"></script>`, nonce)
	}
	lower := strings.ToLower(htmlText)
	if headIdx := strings.Index(lower, "<head"); headIdx != -1 {
		closeRel := strings.IndexByte(lower[headIdx:], '>')
		if closeRel != -1 {
			insertAt := headIdx + closeRel + 1
			var buf bytes.Buffer
			buf.WriteString(htmlText[:insertAt])
			buf.WriteString(tag)
			buf.WriteString(htmlText[insertAt:])
			return buf.String()
		}
	}
	return tag + htmlText
}
