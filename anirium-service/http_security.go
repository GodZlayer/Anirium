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

func trustedPlayerOrigin(origin string) bool {
	core, err := url.Parse(configuredCoreURL())
	if err != nil || core.User != nil || core.Host == "" {
		return false
	}
	return origin == core.Scheme+"://"+core.Host
}

// Loopback binding alone does not prevent DNS rebinding or a hostile website
// from invoking a local API. Native clients may omit Origin; grants still apply.
func secureLocalHTTP(next http.Handler, port int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		host, requestPort, err := net.SplitHostPort(r.Host)
		if err != nil || requestPort != strconv.Itoa(port) ||
			(host != "localhost" && host != "127.0.0.1" && host != "::1") {
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
