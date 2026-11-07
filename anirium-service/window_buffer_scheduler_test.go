package main

import (
	"context"
	"testing"
)

func TestBufferSchedulerKeepsReplenishmentReserveWithoutPromotion(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	oldCurrent, oldNext, oldRetained := currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows
	current := &playbackWindow{Start: 0, DeliveredDuration: 24, Status: "ready", ctx: ctx, cancel: cancel}
	next := &playbackWindow{Start: 24, DeliveredDuration: 24, Status: "ready", ctx: ctx, cancel: cancel}
	currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows = current, next, nil
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows = oldCurrent, oldNext, oldRetained
		swarmMu.Unlock()
	}()
	if !replenishPlaybackWindowBuffer(0) {
		t.Fatal("48s replenishment reserve not recognized")
	}
	swarmMu.RLock()
	unchanged := currentPlaybackWindow == current && prefetchedPlaybackWindow == next
	swarmMu.RUnlock()
	if !unchanged {
		t.Fatal("unnecessary promotion discarded current")
	}
	if replenishPlaybackWindowBuffer(-1) {
		t.Fatal("invalid playback position scheduled")
	}
}

func TestSessionCachePressurePreservesDecoderBackBuffer(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldCurrent, oldNext, oldRetained, oldSession := currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows, currentPlaybackSession
	defer func() {
		currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows, currentPlaybackSession = oldCurrent, oldNext, oldRetained, oldSession
	}()
	currentPlaybackSession = playbackSessionState{Generation: playbackGeneration, Revision: 1}
	currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows = nil, nil, nil
	for index := 0; index < 3; index++ {
		windowCtx, windowCancel := context.WithCancel(ctx)
		retainPlaybackWindowLocked(&playbackWindow{ID: "cache-test", Start: float64(index * 24), DeliveredDuration: 24, ctx: windowCtx, cancel: windowCancel, cacheBytes: playbackEncodedCacheBudget / 2})
	}
	if len(retainedPlaybackWindows) != 3 {
		t.Fatal("continuous session lost unconsumed media")
	}
	oldest := retainedPlaybackWindows[0]
	trimConsumedWindowCacheLocked(71.99)
	if len(retainedPlaybackWindows) != 3 || oldest.ctx.Err() != nil {
		t.Fatal("decoder back buffer retired early")
	}
	trimConsumedWindowCacheLocked(72)
	if len(retainedPlaybackWindows) != 2 || oldest.ctx.Err() == nil {
		t.Fatal("consumed cache did not retire under pressure")
	}
	if retainedPlaybackWindows[0].ctx.Err() != nil {
		t.Fatal("next decoder window retired early")
	}
}

func TestSessionClockRejectsRetiredTimelineAndWrongAudio(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldWindow, oldSession := currentPlaybackWindow, currentPlaybackSession
	defer func() { currentPlaybackWindow, currentPlaybackSession = oldWindow, oldSession }()
	currentPlaybackSession = playbackSessionState{Generation: playbackGeneration, Revision: 1, Audio: "jpn", Position: 80}
	currentPlaybackWindow = &playbackWindow{timelineID: "window-1-2", EpisodeDuration: 120, ctx: ctx}
	for _, selection := range []struct {
		timeline, audio string
		position        float64
	}{
		{"/hls/window-1-1-video/master.m3u8", "jpn", 12},
		{"/hls/window-1-2-video/master.m3u8", "eng", 12},
		{"/hls/window-1-2-video/master.m3u8", "jpn", 121},
	} {
		if updateSessionPositionLocked(selection.timeline, selection.position, selection.audio) || currentPlaybackSession.Position != 80 {
			t.Fatal("stale or incompatible clock mutated session")
		}
	}
	if !updateSessionPositionLocked("/hls/window-1-2-video/master.m3u8", 85, "jpn") || currentPlaybackSession.Position != 85 {
		t.Fatal("current decoder clock rejected")
	}
	currentPlaybackWindow.Start = 112
	currentPlaybackWindow.DeliveredDuration = 12
	currentPlaybackWindow.Status = "ready"
	currentPlaybackWindow.EndOfEpisode = true
	if !updateSessionPositionLocked("/hls/window-1-2-video/master.m3u8", 122, "jpn") {
		t.Fatal("delivered final media rejected because probe underestimated duration")
	}
	if updateSessionPositionLocked("/hls/window-1-2-video/master.m3u8", 125, "jpn") {
		t.Fatal("clock beyond actual final media accepted")
	}
}
