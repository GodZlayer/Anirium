package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
)

func TestAuthorizationWatchCancelsOnlyItsOwnGeneration(t *testing.T) {
	for _, stale := range []bool{false, true} {
		ctx, cancel := context.WithCancel(context.Background())
		swarmMu.Lock()
		previous := cancelPlayback
		cancelPlayback = cancel
		generation := playbackGeneration
		if stale {
			generation++
		}
		swarmMu.Unlock()
		done := make(chan struct{})
		go func() { watchPlaybackAuthorization(ctx, generation, "missing-grant", time.Millisecond); close(done) }()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("revoked authorization watcher did not stop")
		}
		if (ctx.Err() != nil) == stale {
			t.Fatal("authorization canceled the wrong playback generation")
		}
		swarmMu.Lock()
		cancelPlayback = previous
		swarmMu.Unlock()
		cancel()
	}
}

func TestCoreRevocationStopsLiveGeneration(t *testing.T) {
	var revoked atomic.Bool
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if revoked.Load() {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Write([]byte(`{"status":"authorized","level":2,"accountId":"fixture","playerSessionId":"player-fixture"}`))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("token", "device", "fixture", "player-fixture")
	if err != nil || !validatePlaybackGrant(ticket) {
		t.Fatal("live Core session rejected")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	previous := cancelPlayback
	cancelPlayback = cancel
	generation := playbackGeneration
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlayback = previous
		swarmMu.Unlock()
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
	}()
	done := make(chan struct{})
	go func() { watchPlaybackAuthorization(ctx, generation, ticket, 10*time.Millisecond); close(done) }()
	revoked.Store(true)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Core revocation did not stop the monitor")
	}
	if ctx.Err() == nil {
		t.Fatal("Core revocation did not cancel media workers")
	}
}

func TestAuthorizationWatchRevokesWhilePrepareMuHeld(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusServiceUnavailable} {
		cfg := torrent.NewDefaultClientConfig()
		cfg.DisableUTP = true
		cfg.DataDir = t.TempDir()
		cfg.NoDHT, cfg.DisableTrackers, cfg.DisablePEX = true, true, true
		cfg.NoDefaultPortForwarding = true
		cfg.ListenPort = 0
		client, closeClient, err := newManagedTorrentClient(cfg)
		if err != nil {
			t.Fatal(err)
		}
		one := "magnet:?xt=urn:btih:" + strings.Repeat("ab", 20)
		two := "magnet:?xt=urn:btih:" + strings.Repeat("cd", 20)
		for _, magnet := range []string{one, two} {
			if _, err := client.AddMagnet(magnet); err != nil {
				closeClient()
				t.Fatal(err)
			}
		}
		var revoked atomic.Bool
		core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if revoked.Load() {
				w.WriteHeader(status)
				return
			}
			w.Write([]byte(`{"status":"authorized","level":2,"accountId":"fixture","playerSessionId":"player-fixture"}`))
		}))
		t.Setenv("ANIRIUM_CORE_URL", core.URL)
		ticket, err := issuePlaybackGrant("token", "device", "fixture", "player-fixture")
		if err != nil || !validatePlaybackGrant(ticket) {
			core.Close()
			closeClient()
			t.Fatal("live Core session rejected")
		}
		ctx, cancel := context.WithCancel(context.Background())
		preparePlaybackMu.Lock()
		swarmMu.Lock()
		oldClient, oldCancel := torrentClient, cancelPlayback
		torrentClient, cancelPlayback = client, cancel
		generation := playbackGeneration
		swarmMu.Unlock()
		done := make(chan struct{})
		go func() { watchPlaybackAuthorization(ctx, generation, ticket, 10*time.Millisecond, one); close(done) }()
		revoked.Store(true)
		select {
		case <-done:
		case <-time.After(time.Second):
			preparePlaybackMu.Unlock()
			swarmMu.Lock()
			torrentClient, cancelPlayback = oldClient, oldCancel
			swarmMu.Unlock()
			core.Close()
			closeClient()
			cancel()
			t.Fatalf("watcher stalled behind held preparePlaybackMu (status %d)", status)
		}
		if ctx.Err() == nil {
			t.Fatalf("Core status %d did not cancel media workers", status)
		}
		remaining := client.Torrents()
		if len(remaining) != 1 || remaining[0].InfoHash().HexString() != strings.Repeat("cd", 20) {
			t.Fatalf("Core status %d did not drop only the owned torrent", status)
		}
		preparePlaybackMu.Unlock()
		swarmMu.Lock()
		torrentClient, cancelPlayback = oldClient, oldCancel
		swarmMu.Unlock()
		core.Close()
		closeClient()
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
		cancel()
	}
}

func TestAuthorizationWatchStaleGenerationDropsNothing(t *testing.T) {
	var revoked atomic.Bool
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if revoked.Load() {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Write([]byte(`{"status":"authorized","level":2,"accountId":"fixture","playerSessionId":"player-fixture"}`))
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("token", "device", "fixture", "player-fixture")
	if err != nil || !validatePlaybackGrant(ticket) {
		t.Fatal("live Core session rejected")
	}
	defer func() {
		grantMu.Lock()
		delete(grants, ticket)
		grantMu.Unlock()
	}()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	liveCtx, liveCancel := context.WithCancel(context.Background())
	defer liveCancel()
	swarmMu.Lock()
	previous := cancelPlayback
	cancelPlayback = liveCancel
	generation := playbackGeneration + 1
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlayback = previous
		swarmMu.Unlock()
	}()
	done := make(chan struct{})
	go func() { watchPlaybackAuthorization(ctx, generation, ticket, 10*time.Millisecond); close(done) }()
	revoked.Store(true)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("stale watcher did not stop")
	}
	if liveCtx.Err() != nil {
		t.Fatal("stale watcher canceled the live generation")
	}
	if ctx.Err() != nil {
		t.Fatal("stale watcher canceled its own playback context")
	}
}

func TestAuthorizationWatchDoesNotDeadlockShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	preparePlaybackMu.Lock()
	defer preparePlaybackMu.Unlock()
	done := make(chan struct{})
	go func() { watchPlaybackAuthorization(ctx, 0, "missing", time.Millisecond); close(done) }()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("shutdown waits forever for authorization monitor")
	}
}

func TestRevokedPlaybackDropsOnlyItsTorrents(t *testing.T) {
	cfg := torrent.NewDefaultClientConfig()
	// This fixture checks client ownership, not transport. Avoid binding uTP to
	// the TCP-selected ephemeral port, which Windows may reserve for UDP.
	cfg.DisableUTP = true
	cfg.DataDir = t.TempDir()
	cfg.NoDHT, cfg.DisableTrackers, cfg.DisablePEX = true, true, true
	cfg.NoDefaultPortForwarding = true
	cfg.ListenPort = 0
	client, closeClient, err := newManagedTorrentClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer closeClient()
	one := "magnet:?xt=urn:btih:" + strings.Repeat("ab", 20)
	two := "magnet:?xt=urn:btih:" + strings.Repeat("cd", 20)
	for _, magnet := range []string{one, two} {
		if _, err := client.AddMagnet(magnet); err != nil {
			t.Fatal(err)
		}
	}
	// Retirement owns both torrents, but the next episode still needs two.
	// Exercise the actual client drop path, not just the hash-list helper.
	swarmMu.Lock()
	oldClient, oldMagnets, oldLinks, oldRetiring := torrentClient, playbackMagnets, activeLinks, retiringPlaybacks
	torrentClient, playbackMagnets = client, []string{one, two}
	activeLinks = []string{two + "&dn=selected-batch-file"}
	retiringPlaybacks = map[uint64]*retiringPlayback{999: {magnets: []string{one}}}
	releaseExcludedSourceTorrentsLocked()
	if len(client.Torrents()) != 2 {
		torrentClient, playbackMagnets, activeLinks, retiringPlaybacks = oldClient, oldMagnets, oldLinks, oldRetiring
		swarmMu.Unlock()
		t.Fatal("excluded swarm dropped while retiring reader still owned it")
	}
	retiringPlaybacks = map[uint64]*retiringPlayback{}
	releaseExcludedSourceTorrentsLocked()
	torrentClient, playbackMagnets, activeLinks, retiringPlaybacks = oldClient, oldMagnets, oldLinks, oldRetiring
	swarmMu.Unlock()
	remaining := client.Torrents()
	if len(remaining) != 1 || remaining[0].InfoHash().HexString() != strings.Repeat("cd", 20) {
		t.Fatal("revocation removed unrelated torrent or retained revoked one")
	}
}

func TestRetiredPlaybackPreservesSharedTorrentIdentity(t *testing.T) {
	one := "magnet:?xt=urn:btih:" + strings.Repeat("ab", 20)
	two := "magnet:?xt=urn:btih:" + strings.Repeat("cd", 20)
	result := unretainedMagnets([]string{one, two}, []string{one + "&dn=another-episode"})
	if len(result) != 1 || result[0] != two {
		t.Fatalf("shared swarm retired or unrelated swarm retained: %v", result)
	}
}
