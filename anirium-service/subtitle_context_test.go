package main

import (
	"context"
	"testing"
	"time"
)

func TestSubtitleRequestStopsWithEitherOwner(t *testing.T) {
	for _, owner := range []string{"request", "playback"} {
		t.Run(owner, func(t *testing.T) {
			request, cancelRequest := context.WithCancel(context.Background())
			defer cancelRequest()
			playback, cancelPlayback := context.WithCancel(context.Background())
			defer cancelPlayback()
			ctx, release := subtitleRequestContext(request, playback)
			defer release()
			if owner == "request" {
				cancelRequest()
			} else {
				cancelPlayback()
			}
			select {
			case <-ctx.Done():
			case <-time.After(time.Second):
				t.Fatal("subtitle outlived its owner")
			}
		})
	}
}

func TestSubtitleRequestRejectsRetiredGeneration(t *testing.T) {
	playback, cancel := context.WithCancel(context.Background())
	cancel()
	ctx, release := subtitleRequestContext(context.Background(), playback)
	defer release()
	if ctx.Err() != context.Canceled {
		t.Fatal("retired generation accepted")
	}
}
