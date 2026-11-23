package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSearchRSSProviderExtractsMagnetsFromInfoHashAndLink(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if !strings.Contains(q, "Mouse Cursor") {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<rss><channel></channel></rss>`))
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel>
    <item>
      <title>[SubsPlease] Mouse Cursor - 01 (1080p).mkv</title>
      <nyaa:infoHash>0123456789abcdef0123456789abcdef01234567</nyaa:infoHash>
      <nyaa:seeders>42</nyaa:seeders>
    </item>
    <item>
      <title>[Erai-raws] Mouse Cursor - 01 [720p].mkv</title>
      <link>magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01</link>
      <nyaa:seeders>15</nyaa:seeders>
    </item>
  </channel>
</rss>`))
	}))
	defer srv.Close()

	prev := providerHTTPClient
	providerHTTPClient = srv.Client()
	defer func() { providerHTTPClient = prev }()

	server := ProviderServer{
		ID:          "remote-rss-test",
		Kind:        "remote-manifest",
		ManifestURL: srv.URL + "/?page=rss&q={query}",
		Enabled:     true,
	}
	results := searchRSSProvider(context.Background(), server, PlaybackPrepareRequest{
		Title:   "Mouse Cursor",
		Episode: 1,
	})
	if len(results) != 2 {
		t.Fatalf("expected 2 RSS results, got %d", len(results))
	}
	if results[0].Seeders != 42 || !strings.Contains(results[0].Magnet, "0123456789abcdef0123456789abcdef01234567") {
		t.Fatalf("unexpected top result: %+v", results[0])
	}
	if results[1].Seeders != 15 || !strings.Contains(results[1].Magnet, "abcdef0123456789abcdef0123456789abcdef01") {
		t.Fatalf("unexpected second result: %+v", results[1])
	}
}
