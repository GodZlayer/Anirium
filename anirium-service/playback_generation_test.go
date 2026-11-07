package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestShutdownWaitsForRetiringPlaybackReaders(t *testing.T) {
	stopPlaybackWorkers()
	swarmMu.Lock()
	oldContext, oldCancel := playbackContext, cancelPlayback
	oldWorkers, oldInputs, oldRetiring := playbackWorkers, playbackInputs, retiringPlaybacks
	ctx, cancel := context.WithCancel(context.Background())
	playbackContext, cancelPlayback = ctx, cancel
	playbackWorkers = &sync.WaitGroup{}
	playbackInputs = nil
	workers := &sync.WaitGroup{}
	workers.Add(1)
	readerStarted, readerReleased := make(chan struct{}), make(chan struct{})
	retiringPlaybacks = map[uint64]*retiringPlayback{999: {
		workers: workers,
		inputs: &mediaInputCache{waitRetired: func() {
			close(readerStarted)
			<-readerReleased
		}},
	}}
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		playbackContext, cancelPlayback = oldContext, oldCancel
		playbackWorkers, playbackInputs, retiringPlaybacks = oldWorkers, oldInputs, oldRetiring
		swarmMu.Unlock()
	}()
	done := make(chan struct{})
	go func() { stopPlaybackWorkers(); close(done) }()
	select {
	case <-ctx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("shutdown did not cancel current playback")
	}
	workers.Done()
	select {
	case <-readerStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("shutdown did not join retired input readers")
	}
	select {
	case <-done:
		t.Fatal("shutdown returned while a retired reader still owned storage")
	default:
	}
	close(readerReleased)
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("shutdown did not complete after reader retirement")
	}
}

func TestSwitchEpisodeCancelsPreviousWorkers(t *testing.T) {
	swarmMu.Lock()
	resetPlaybackLocked()
	previous := playbackContext
	resetPlaybackLocked()
	current := playbackContext
	swarmMu.Unlock()
	if !errors.Is(previous.Err(), context.Canceled) {
		t.Fatal("previous work was not canceled")
	}
	if current.Err() != nil {
		t.Fatal("new work was canceled")
	}
	dir := filepath.Join(t.TempDir(), "should-not-be-created")
	_, err := transcodeSourceToHLS("missing.mp4", dir, "720p", previous)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled transcode returned %v", err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatal("canceled job started disk processing")
	}
}

func TestNewPlaybackDoesNotReuseOldMedia(t *testing.T) {
	swarmMu.Lock()
	old := playbackGeneration
	activeLinks = []string{"old-source"}
	probedStreams["old-source"] = []ffprobeStream{{Index: 1}}
	variantMu.Lock()
	variantRuntimes[playbackVariantID(old, "720p")] = &variantRuntime{MixVariant: MixVariant{Status: "ready"}}
	variantMu.Unlock()
	grantMu.Lock()
	grants["old-ticket"] = playbackGrant{}
	grantMu.Unlock()
	next := resetPlaybackLocked()
	if next <= old || len(activeLinks) != 0 || len(probedStreams) != 0 {
		t.Fatal("old source metadata survived")
	}
	swarmMu.Unlock()
	variantMu.RLock()
	count := len(variantRuntimes)
	variantMu.RUnlock()
	if count != 0 {
		t.Fatal("old variants survived")
	}
	if playbackVariantID(old, "720p") == playbackVariantID(next, "720p") {
		t.Fatal("episode media paths collide")
	}
	if validatePlaybackGrant("old-ticket") {
		t.Fatal("previous episode ticket survived")
	}
	buildVariant(nil, "720p", old)
	variantMu.RLock()
	defer variantMu.RUnlock()
	if len(variantRuntimes) != 0 {
		t.Fatal("old worker published a variant")
	}
}
