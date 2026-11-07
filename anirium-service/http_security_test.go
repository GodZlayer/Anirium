package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLocalHTTPTrustBoundary(t *testing.T) {
	t.Setenv("ANIRIUM_CORE_URL", "https://anirium.com.br")
	for _, test := range []struct {
		name, host, origin string
		allowed            bool
	}{
		{"player", "127.0.0.1:4004", "https://anirium.com.br", true},
		{"native", "localhost:4004", "", true},
		{"rebind", "attacker.example:4004", "", false},
		{"wrong-port", "localhost:4005", "https://anirium.com.br", false},
		{"foreign", "127.0.0.1:4004", "https://attacker.example", false},
		{"null", "127.0.0.1:4004", "null", false},
		{"suffix", "127.0.0.1:4004", "https://anirium.com.br.attacker.example", false},
		{"other-port", "127.0.0.1:4004", "https://anirium.com.br:444", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			called := false
			handler := secureLocalHTTP(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) }), 4004)
			request := httptest.NewRequest("GET", "http://127.0.0.1:4004/health", nil)
			request.Host = test.host
			if test.origin != "" {
				request.Header.Set("Origin", test.origin)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if called != test.allowed {
				t.Fatalf("request reached handler=%v, expected=%v", called, test.allowed)
			}
			if !test.allowed && response.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("untrusted response readable via CORS")
			}
			if test.allowed && response.Header().Get("Access-Control-Allow-Origin") != test.origin {
				t.Fatal("origin not scoped")
			}
		})
	}
}

func TestProductionLocalServerPreflightAndLimits(t *testing.T) {
	t.Setenv("ANIRIUM_CORE_URL", "https://anirium.com.br")
	server := newLocalHTTPServer(4004)
	for _, headers := range []string{"authorization, content-type, x-anirium-device", "x-evil-header"} {
		r := httptest.NewRequest("OPTIONS", "http://127.0.0.1:4004/playback/prepare", nil)
		r.Header.Set("Origin", "https://anirium.com.br")
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", headers)
		w := httptest.NewRecorder()
		server.Handler.ServeHTTP(w, r)
		want := 204
		if headers == "x-evil-header" {
			want = 403
		}
		if w.Code != want {
			t.Fatalf("preflight got %d want %d", w.Code, want)
		}
	}
	r := httptest.NewRequest("POST", "http://127.0.0.1:4004/playback/prepare", strings.NewReader(strings.Repeat("x", maxLocalAPIBody+1)))
	w := httptest.NewRecorder()
	server.Handler.ServeHTTP(w, r)
	if w.Code != 413 {
		t.Fatalf("oversized body got %d", w.Code)
	}
	if server.ReadHeaderTimeout <= 0 || server.ReadTimeout <= 0 || server.IdleTimeout <= 0 || server.MaxHeaderBytes > 16*1024 {
		t.Fatal("HTTP resource limits missing")
	}
}
