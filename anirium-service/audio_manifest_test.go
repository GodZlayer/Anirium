package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestAudioManifestExposesPlaylistsOnlyWhenReady(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldCandidates := selectedAudioCandidates
	selectedAudioCandidates = []AudioCandidate{{Language: "jpn", Source: "private-magnet", StreamIndex: 7}, {Language: "por", Source: "private-path", StreamIndex: 8}}
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{
		audioTrackID(playbackGeneration, 0): {MixVariant: MixVariant{Status: "preparing", PlaylistURL: "/hls/not-ready/index.m3u8"}},
		audioTrackID(playbackGeneration, 1): {MixVariant: MixVariant{Status: "ready", PlaylistURL: "/hls/ready/index.m3u8", ProcessingFailed: true, BufferedSeconds: 4}},
	}
	variantMu.Unlock()
	defer func() {
		selectedAudioCandidates = oldCandidates
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
	}()
	tracks := audioTracksLocked()
	if len(tracks) != 2 || tracks[0].PlaylistURL != "" || tracks[1].PlaylistURL != "/hls/ready/index.m3u8" {
		t.Fatalf("invalid audio readiness: %+v", tracks)
	}
	if !tracks[1].ProcessingFailed || tracks[1].ProcessingComplete || tracks[1].BufferedSeconds != 4 {
		t.Fatal("audio processing failure or partial coverage hidden from Player")
	}
	encoded, err := json.Marshal(tracks)
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"private-magnet", "private-path", "StreamIndex", "not-ready"} {
		if strings.Contains(string(encoded), private) {
			t.Fatalf("internal detail exposed: %s", private)
		}
	}
}

func TestAudioManifestUsesActiveWindowInsteadOfStoppedBackground(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	defer swarmMu.Unlock()
	previousWindow, previousCandidates := currentPlaybackWindow, selectedAudioCandidates
	defer func() {
		currentPlaybackWindow, selectedAudioCandidates = previousWindow, previousCandidates
	}()
	selectedAudioCandidates = []AudioCandidate{{Language: "jpn"}}
	window := &playbackWindow{Status: "ready", ctx: ctx, cancel: cancel, AudioTracks: []AudioTrack{{Language: "eng", Status: "ready", PlaylistURL: "/hls/window-fixture-audio/index.m3u8"}}}
	currentPlaybackWindow = window
	tracks := manifestAudioTracksLocked()
	if len(tracks) != 1 || tracks[0].Language != "eng" || tracks[0].ProcessingFailed {
		t.Fatalf("window inventory replaced by background state: %+v", tracks)
	}
	tracks[0].Language = "changed"
	if window.AudioTracks[0].Language != "eng" {
		t.Fatal("manifest returned a mutable worker inventory")
	}
	cancel()
	tracks = manifestAudioTracksLocked()
	if len(tracks) != 1 || tracks[0].Language != "jpn" {
		t.Fatal("cancelled window still defines manifest audio")
	}
}
