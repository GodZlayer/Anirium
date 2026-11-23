package main

import (
	"context"
	"testing"
)

func TestQualitySwitchParksTimelineAndSwitchBackRestoresIt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	swarmMu.Lock()
	oldCurrent, oldPrefetch, oldRetained, oldParked := currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows, parkedPlaybackTimelines
	defer func() {
		swarmMu.Lock()
		currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows, parkedPlaybackTimelines = oldCurrent, oldPrefetch, oldRetained, oldParked
		swarmMu.Unlock()
	}()

	newWindow := func(id, timeline, quality string, start float64, status string) *playbackWindow {
		wctx, wcancel := context.WithCancel(ctx)
		return &playbackWindow{ID: id, timelineID: timeline, Quality: quality, Audio: "jpn", Start: start, Duration: 24, DeliveredDuration: 24, Status: status, ctx: wctx, cancel: wcancel}
	}
	first := newWindow("window-5-1", "window-5-1", "1080p", 0, "ready")
	second := newWindow("window-5-2", "window-5-1", "1080p", 24, "ready")
	pending := newWindow("window-5-3", "window-5-1", "1080p", 48, "preparing")
	retainedPlaybackWindows = []*playbackWindow{first}
	currentPlaybackWindow = second
	prefetchedPlaybackWindow = pending
	parkedPlaybackTimelines = nil

	parkActivePlaybackTimelineLocked()
	if currentPlaybackWindow != nil || len(retainedPlaybackWindows) != 0 || prefetchedPlaybackWindow != nil {
		t.Fatal("active timeline not cleared after parking")
	}
	if first.ctx.Err() != nil || second.ctx.Err() != nil {
		t.Fatal("ready encoded media was discarded on quality switch")
	}
	if pending.ctx.Err() == nil {
		t.Fatal("unfinished prefetch kept running after switch")
	}
	if len(parkedPlaybackTimelines) != 1 || len(parkedPlaybackTimelines[0].windows) != 2 {
		t.Fatalf("expected one parked timeline with 2 windows, got %+v", parkedPlaybackTimelines)
	}

	other := newWindow("window-5-4", "window-5-4", "720p", 30, "ready")
	currentPlaybackWindow = other

	if restoreParkedPlaybackTimelineLocked("1080p", "jpn", 60) {
		t.Fatal("restored a parked timeline that does not cover the position")
	}
	if !restoreParkedPlaybackTimelineLocked("1080p", "jpn", 30) {
		t.Fatal("switch back did not restore the parked 1080p timeline")
	}
	if currentPlaybackWindow != second || len(retainedPlaybackWindows) != 1 || retainedPlaybackWindows[0] != first {
		t.Fatal("restored timeline windows out of order")
	}
	if other.ctx.Err() != nil || len(parkedPlaybackTimelines) != 1 || parkedPlaybackTimelines[0].quality != "720p" {
		t.Fatal("720p timeline was not parked when switching back")
	}
	swarmMu.Unlock()
}
