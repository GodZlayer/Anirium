package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTranslateWebVTTPreservesTimestampsAndCaches(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = r.ParseForm()
		q := r.FormValue("q")
		out := strings.ReplaceAll(q, "Hello world", "Olá mundo")
		out = strings.ReplaceAll(out, "Good morning", "Bom dia")
		payload := []any{[]any{[]any{out, q}}}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	}))
	defer srv.Close()

	prevURL := subTranslateBaseURL
	prevClient := subTranslateClient
	subTranslateBaseURL = srv.URL
	subTranslateClient = srv.Client()
	defer func() {
		subTranslateBaseURL = prevURL
		subTranslateClient = prevClient
	}()

	input := "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world\n\n00:00:04.000 --> 00:00:06.000\nGood morning"
	got, cached, err := translateWebVTT(context.Background(), input, "pt-BR")
	if err != nil {
		t.Fatalf("translateWebVTT failed: %v", err)
	}
	if cached {
		t.Fatal("first call should not be cached")
	}
	if !strings.Contains(got, "00:00:01.000 --> 00:00:03.000\nOlá mundo") || !strings.Contains(got, "00:00:04.000 --> 00:00:06.000\nBom dia") {
		t.Fatalf("unexpected translated VTT:\n%s", got)
	}

	got2, cached2, err := translateWebVTT(context.Background(), input, "pt-BR")
	if err != nil || !cached2 || got2 != got || calls != 1 {
		t.Fatalf("expected cached hit with 1 upstream call, got cached=%v calls=%d err=%v", cached2, calls, err)
	}
}

func TestParseTranslatedTrackIDAndNormalizeLang(t *testing.T) {
	lang, base, ok := parseTranslatedTrackID("translated-por:subtitle-1-0-2")
	if !ok || lang != "pt" || base != "subtitle-1-0-2" {
		t.Fatalf("unexpected parse result: ok=%v lang=%q base=%q", ok, lang, base)
	}

	lang, base, ok = parseTranslatedTrackID("translated-spa:sub-99")
	if !ok || lang != "es" || base != "sub-99" {
		t.Fatalf("unexpected spa parse result: ok=%v lang=%q base=%q", ok, lang, base)
	}

	lang, base, ok = parseTranslatedTrackID("translated-zho:sub-1")
	if !ok || lang != "zh-CN" || base != "sub-1" {
		t.Fatalf("unexpected zho parse result: ok=%v lang=%q base=%q", ok, lang, base)
	}

	if got := unwrapTranslatedTrackID("translated-jpn:subtitle-0"); got != "subtitle-0" {
		t.Fatalf("expected subtitle-0, got %q", got)
	}
	if got := unwrapTranslatedTrackID("subtitle-0"); got != "subtitle-0" {
		t.Fatalf("expected unchanged subtitle-0, got %q", got)
	}
}

func TestTranslateWebVTTSubdividesOnSeparatorMismatch(t *testing.T) {
	prevURL := subTranslateBaseURL
	prevClient := subTranslateClient
	subTranslateMu.Lock()
	subTranslateMem = map[string]string{}
	subTranslateMu.Unlock()
	defer func() {
		subTranslateBaseURL = prevURL
		subTranslateClient = prevClient
	}()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		q := r.FormValue("q")
		// Simulate mangled separator when batch has multiple cues
		if strings.Contains(q, "@@@ANIRIUM_SEP@@@") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[[["corrupted single block","src"]]]`))
			return
		}
		translated := "PT:" + strings.TrimSpace(q)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[[["` + translated + `","src"]]]`))
	}))
	defer srv.Close()

	subTranslateBaseURL = srv.URL
	subTranslateClient = srv.Client()

	input := "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n\n00:00:03.000 --> 00:00:04.000\nWorld"
	got, cached, err := translateWebVTT(context.Background(), input, "por")
	if err != nil {
		t.Fatalf("expected fallback subdivision to succeed, got err: %v", err)
	}
	if cached {
		t.Fatalf("expected uncached result")
	}
	if !strings.Contains(got, "PT:Hello") || !strings.Contains(got, "PT:World") {
		t.Fatalf("expected both cues translated via subdivision, got:\n%s", got)
	}
}
