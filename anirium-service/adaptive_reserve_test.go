package main

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestCompletedWindowUsesMeasuredPreparationForSessionReserve(t *testing.T) {
	for _, sample := range []struct {
		name               string
		elapsed, delivered float64
		final              bool
		want               float64
	}{
		{"fast", 4, 24, false, 30}, {"small-margin", 14, 24, false, 60}, {"tail", 14, 8, true, 30},
	} {
		t.Run(sample.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			window := &playbackWindow{ID: "adaptive-test", Duration: 24, EpisodeDuration: 300, ctx: ctx, cancel: cancel, preparationStarted: time.Now().Add(-time.Duration(sample.elapsed * float64(time.Second)))}
			if sample.final {
				window.EpisodeDuration = sample.delivered
			}
			swarmMu.Lock()
			oldCurrent, oldNext, oldSession := currentPlaybackWindow, prefetchedPlaybackWindow, currentPlaybackSession
			currentPlaybackWindow, prefetchedPlaybackWindow = window, nil
			currentPlaybackSession = playbackSessionState{Generation: playbackGeneration, Revision: 1, BufferSeconds: 30}
			swarmMu.Unlock()
			variantMu.Lock()
			oldRuntime := variantRuntimes[window.ID+"-video"]
			variantMu.Unlock()
			defer func() {
				swarmMu.Lock()
				currentPlaybackWindow, prefetchedPlaybackWindow, currentPlaybackSession = oldCurrent, oldNext, oldSession
				swarmMu.Unlock()
				variantMu.Lock()
				if oldRuntime == nil {
					delete(variantRuntimes, window.ID+"-video")
				} else {
					variantRuntimes[window.ID+"-video"] = oldRuntime
				}
				variantMu.Unlock()
			}()
			finishPlaybackWindow(window, map[string]*variantRuntime{window.ID + "-video": {MixVariant: MixVariant{BufferedSeconds: sample.delivered}, Dir: filepath.Join(t.TempDir(), "video")}}, nil, nil)
			swarmMu.RLock()
			got := currentPlaybackSession.BufferSeconds
			swarmMu.RUnlock()
			if got != sample.want {
				t.Fatalf("measured preparation reserve got%v want%v", got, sample.want)
			}
		})
	}
}
