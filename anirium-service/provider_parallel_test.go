package main

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func TestProviderTimeoutIsBounded(t *testing.T) {
	for _, test := range []struct {
		value int
		want  time.Duration
	}{
		{0, 30 * time.Second}, {-1, 30 * time.Second}, {1, 100 * time.Millisecond},
		{250, 250 * time.Millisecond}, {30001, 30 * time.Second},
	} {
		if got := providerTimeout(ProviderServer{TimeoutMS: test.value}); got != test.want {
			t.Fatalf("timeout %d: got %v want %v", test.value, got, test.want)
		}
	}
}

func TestConfiguredProviderTimeoutCancelsWorker(t *testing.T) {
	providerMu.Lock()
	old := providerServers
	providerServers = []ProviderServer{{ID: "fixture", Enabled: true, TimeoutMS: 100}}
	providerMu.Unlock()
	defer func() { providerMu.Lock(); providerServers = old; providerMu.Unlock() }()
	started := time.Now()
	result := parallelProviderSearch(PlaybackPrepareRequest{AuthorizedAddonIDs: []string{"fixture"}}, nil, func(_ PlaybackPrepareRequest, ctx context.Context, _ []ProviderServer) []string {
		<-ctx.Done()
		if ctx.Err() != context.DeadlineExceeded {
			t.Errorf("unexpected cancellation: %v", ctx.Err())
		}
		return nil
	})
	if len(result) != 0 || time.Since(started) > 2*time.Second {
		t.Fatal("configured deadline ignored")
	}
}

func TestProviderWorkersAreConcurrentAuthorizedAndOrdered(t *testing.T) {
	providerMu.Lock()
	old := providerServers
	providerServers = []ProviderServer{{ID: "first", Enabled: true}, {ID: "second", Enabled: true}, {ID: "unapproved", Enabled: true}, {ID: "disabled", Enabled: false}}
	providerMu.Unlock()
	defer func() { providerMu.Lock(); providerServers = old; providerMu.Unlock() }()
	started := make(chan string, 4)
	release := make(chan struct{})
	defer close(release)
	finished := make(chan []string, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		finished <- parallelProviderSearch(PlaybackPrepareRequest{AuthorizedAddonIDs: []string{"first", "second", "disabled"}}, []context.Context{ctx}, func(_ PlaybackPrepareRequest, ctx context.Context, servers []ProviderServer) []string {
			started <- servers[0].ID
			select {
			case <-release:
			case <-ctx.Done():
			}
			return []string{servers[0].ID}
		})
	}()
	for i := 0; i < 2; i++ {
		select {
		case id := <-started:
			if id != "first" && id != "second" {
				t.Fatalf("unauthorized provider %s", id)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("providers ran sequentially")
		}
	}
	cancel()
	select {
	case got := <-finished:
		if !reflect.DeepEqual(got, []string{"first", "second"}) {
			t.Fatalf("unstable provider order: %v", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("workers did not finish")
	}
}
