package main

import (
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const maxLocalAPIBody = 64 * 1024

func isPrivateLANIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}

func isAllowedLocalHost(host string) bool {
	h := strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	if h == "localhost" {
		return true
	}
	return isPrivateLANIP(net.ParseIP(h))
}

func isAllowedLANOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	host := u.Hostname()
	if !isPrivateLANIP(net.ParseIP(host)) {
		return false
	}
	switch u.Port() {
	case "", "80", "443", "8080", "5173", "8000", "3000":
		return true
	default:
		return false
	}
}

func trustedPlayerOrigin(origin string) bool {
	trusted := []string{
		officialCoreURL,
		"https://godzlayer.github.io",
		"http://localhost:8080",
		"http://127.0.0.1:8080",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
	}
	if configured := configuredCoreURL(); configured != "" {
		if core, err := url.Parse(configured); err == nil && core.Host != "" {
			trusted = append(trusted, core.Scheme+"://"+core.Host)
		}
	}
	for _, item := range trusted {
		if origin == item {
			return true
		}
	}
	return isAllowedLANOrigin(origin)
}

// Restrict API access to loopback and private LAN clients/hosts only.
func secureLocalHTTP(next http.Handler, port int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		if r.RemoteAddr != "" {
			if remoteHost, _, splitErr := net.SplitHostPort(r.RemoteAddr); splitErr == nil {
				if ip := net.ParseIP(remoteHost); ip != nil && !isPrivateLANIP(ip) {
					http.Error(w, "LAN-only local API", http.StatusForbidden)
					return
				}
			}
		}
		host, requestPort, err := net.SplitHostPort(r.Host)
		if err != nil || requestPort != strconv.Itoa(port) || !isAllowedLocalHost(host) {
			http.Error(w, "Invalid local API host", http.StatusForbidden)
			return
		}
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")
		if origin != "" {
			if !trustedPlayerOrigin(origin) {
				http.Error(w, "Untrusted Player origin", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions {
			if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
				w.Header().Set("Access-Control-Allow-Private-Network", "true")
			}
			method := r.Header.Get("Access-Control-Request-Method")
			if method != "GET" && method != "POST" && method != "HEAD" {
				http.Error(w, "Unsupported preflight method", http.StatusForbidden)
				return
			}
			for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
				switch strings.ToLower(strings.TrimSpace(header)) {
				case "", "authorization", "content-type", "x-anirium-device", "range":
				default:
					http.Error(w, "Unsupported preflight header", http.StatusForbidden)
					return
				}
			}
		}
		if r.ContentLength > maxLocalAPIBody {
			http.Error(w, "Request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxLocalAPIBody)
		next.ServeHTTP(w, r)
	})
}

func newLocalHTTPServer(port int) *http.Server {
	return &http.Server{
		Handler:           secureLocalHTTP(newServiceHTTPHandler(port), port),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 * 1024,
		// Encoding can outlive a short write timeout. Cancellation is controlled
		// by playback/provider contexts, not an arbitrary media response deadline.
	}
}
