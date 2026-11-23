package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSearchSubtitleQueryProviderParsesJSONAndRSS(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/json" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"subtitles":[{"url":"https://example.com/ep1.pt.vtt","lang":"pt-BR","title":"PT-BR Oficial"},{"url":"https://example.com/ep1.en.srt","lang":"eng","title":"English"}]}`))
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(`<rss><channel><item><title>Mouse Cursor 01 [PT-BR]</title><enclosure url="https://example.com/mouse01.srt" /></item></channel></rss>`))
	}))
	defer srv.Close()

	prev := providerHTTPClient
	providerHTTPClient = srv.Client()
	defer func() { providerHTTPClient = prev }()

	jsonRes := searchSubtitleQueryProvider(context.Background(), ProviderServer{
		ID:          "sub-json",
		ManifestURL: srv.URL + "/json?q={subquery}",
	}, PlaybackPrepareRequest{Title: "Mouse Cursor", Episode: 1})
	if len(jsonRes) != 2 || jsonRes[0].Language != "por" || jsonRes[1].Language != "eng" {
		t.Fatalf("unexpected JSON subtitle results: %+v", jsonRes)
	}

	rssRes := searchSubtitleQueryProvider(context.Background(), ProviderServer{
		ID:          "sub-rss",
		ManifestURL: srv.URL + "/rss?q={subquery}",
	}, PlaybackPrepareRequest{Title: "Mouse Cursor", Episode: 1})
	if len(rssRes) != 1 || rssRes[0].Language != "por" || rssRes[0].URL != "https://example.com/mouse01.srt" {
		t.Fatalf("unexpected RSS subtitle results: %+v", rssRes)
	}
}

func TestSearchSubtitleQueryProviderParsesHTMLSearchAndDetail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if r.URL.Path == "/index.php" {
			_, _ = w.Write([]byte(`<html><body><a href="/subs/99/Mouse.Cursor.01.html">Mouse Cursor 01</a></body></html>`))
			return
		}
		if r.URL.Path == "/subs/99/Mouse.Cursor.01.html" {
			_, _ = w.Write([]byte(`<html><body><a href="/subs/99/Mouse.Cursor.01-pt-BR.srt">Portuguese</a><a href="/subs/99/Mouse.Cursor.01-en.srt">English</a></body></html>`))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	prev := providerHTTPClient
	providerHTTPClient = srv.Client()
	defer func() { providerHTTPClient = prev }()

	res := searchSubtitleQueryProvider(context.Background(), ProviderServer{
		ID:          "sub-html",
		ManifestURL: srv.URL + "/index.php?search={subquery}",
	}, PlaybackPrepareRequest{Title: "Mouse Cursor", Episode: 1})
	if len(res) != 2 || res[0].Language != "por" || res[1].Language != "eng" {
		t.Fatalf("unexpected HTML subtitle results: %+v", res)
	}
}
