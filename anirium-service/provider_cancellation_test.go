package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestProviderDiscoveryStopsWhenPlaybackRequestIsCancelled(t *testing.T) {
	for _, subtitle := range []bool{false, true} {
		t.Run(map[bool]string{false: "magnets", true: "subtitles"}[subtitle], func(t *testing.T) {
			started := make(chan struct{})
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				close(started)
				<-r.Context().Done()
			}))
			defer server.Close()
			allowLocalProviderForTest(t, server.URL)
			providerMu.Lock()
			old := providerServers
			providerServers = []ProviderServer{{ID: "fixture", ManifestURL: server.URL, Enabled: true}}
			providerMu.Unlock()
			defer func() { providerMu.Lock(); providerServers = old; providerMu.Unlock() }()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan struct{})
			go func() {
				defer close(done)
				query := PlaybackPrepareRequest{AuthorizedAddonIDs: []string{"fixture"}}
				if subtitle {
					searchSubtitleProviders(query, ctx)
				} else {
					searchProviderServers(query, ctx)
				}
			}()
			select {
			case <-started:
			case <-time.After(2 * time.Second):
				t.Fatal("provider was not contacted")
			}
			cancel()
			select {
			case <-done:
			case <-time.After(2 * time.Second):
				t.Fatal("cancelled playback kept provider discovery running")
			}
		})
	}
}
