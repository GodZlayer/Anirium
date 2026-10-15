package main

import (
	"context"
	"testing"
)

func TestWindowDemandStopsBackgroundWithoutRevokingPlayback(t *testing.T) {
	parent, cancelParent := context.WithCancel(context.Background())
	defer cancelParent()
	background, cancelBackground := context.WithCancel(parent)
	defer cancelBackground()
	window, cancelWindow := context.WithCancel(parent)
	defer cancelWindow()
	swarmMu.Lock()
	previousContext, previousCancel := continuousPlaybackContext, cancelContinuousPlayback
	previousParent, previousPlayback := continuousPlaybackParent, playbackContext
	continuousPlaybackParent, playbackContext = parent, parent
	continuousPlaybackContext, cancelContinuousPlayback = background, cancelBackground
	stopContinuousPlaybackLocked()
	continuousPlaybackContext, cancelContinuousPlayback = previousContext, previousCancel
	continuousPlaybackParent, playbackContext = previousParent, previousPlayback
	swarmMu.Unlock()
	if background.Err() == nil || parent.Err() != nil || window.Err() != nil {
		t.Fatal("window priority must stop background encoders without revoking playback or demand")
	}
}
