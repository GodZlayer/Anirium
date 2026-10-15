package main

import (
	"context"
	"testing"
)

func TestWindowBackBufferBoundedAndCancelledOnSeek(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	previous := retainedPlaybackWindows
	retainedPlaybackWindows = nil
	defer func() { retainedPlaybackWindows = previous }()
	windows := make([]*playbackWindow, 3)
	for index := range windows {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		windows[index] = &playbackWindow{ctx: ctx, cancel: cancel}
		retainPlaybackWindowLocked(windows[index])
	}
	if len(retainedPlaybackWindows) != 2 || windows[0].ctx.Err() == nil || windows[1].ctx.Err() != nil || windows[2].ctx.Err() != nil {
		t.Fatal("retention not bounded or active back buffer cancelled")
	}
	// Preserve unrelated globals used by other tests.
	current, prefetched := currentPlaybackWindow, prefetchedPlaybackWindow
	currentPlaybackWindow, prefetchedPlaybackWindow = nil, nil
	cancelPlaybackWindowLocked()
	currentPlaybackWindow, prefetchedPlaybackWindow = current, prefetched
	if len(retainedPlaybackWindows) != 0 || windows[1].ctx.Err() == nil || windows[2].ctx.Err() == nil {
		t.Fatal("seek retained old media")
	}
}
