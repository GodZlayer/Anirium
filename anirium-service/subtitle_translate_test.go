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
