package main

import (
	"context"
	"path/filepath"
	"testing"
)

func TestAudioDirectoryFailureIsReportedInsteadOfPreparingForever(t *testing.T) {
	// os.TempDir on Windows uses TMP/TEMP. Neither location exists.
	missing := filepath.Join(t.TempDir(), "missing", "temp")
	t.Setenv("TMP", missing)
	t.Setenv("TEMP", missing)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	candidate := AudioCandidate{Language: "eng", Source: "fixture", Channels: 2}
	swarmMu.Lock()
	oldContext, oldCandidates := playbackContext, selectedAudioCandidates
	playbackContext, selectedAudioCandidates = ctx, []AudioCandidate{candidate}
	generation := playbackGeneration
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		playbackContext, selectedAudioCandidates = oldContext, oldCandidates
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	buildAudioTrack(candidate, 0, generation)
	swarmMu.RLock()
	tracks := audioTracksLocked()
	swarmMu.RUnlock()
	if len(tracks) != 1 || tracks[0].Status != "stalled" || !tracks[0].ProcessingFailed || tracks[0].PlaylistURL != "" {
		t.Fatalf("failed directory advertised as pending/ready: %+v", tracks)
	}
}
