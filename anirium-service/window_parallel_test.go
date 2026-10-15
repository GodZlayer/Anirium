package main

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPlaybackWindowAudioStartsBeforeVideoInputCompletes(t *testing.T) {
	input := filepath.Join(t.TempDir(), "parallel-fixture.mp4")
	output, err := exec.Command(mediaTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=8", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=8", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	window := &playbackWindow{ID: "window-77-1", Quality: "120p", Audio: "eng", Duration: 24, Status: "preparing", ctx: ctx, cancel: cancel}
	swarmMu.Lock()
	previous, previousPrefetch := currentPlaybackWindow, prefetchedPlaybackWindow
	currentPlaybackWindow, prefetchedPlaybackWindow = window, nil
	variantMu.Lock()
	previousRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlaybackWindowLocked()
		currentPlaybackWindow, prefetchedPlaybackWindow = previous, previousPrefetch
		variantMu.Lock()
		variantRuntimes = previousRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	audioStarted := make(chan struct{})
	inputs := newMediaInputCache(ctx, func(loadContext context.Context, source string, _ int) (string, error) {
		if source == "audio-fixture" {
			close(audioStarted)
		} else {
			// The former sequential pipeline cannot reach audio while video waits.
			select {
			case <-audioStarted:
			case <-loadContext.Done():
				return "", loadContext.Err()
			}
		}
		return input, nil
	}, func(string) {})
	buildPlaybackWindow(window, inputs, []string{"video-fixture"}, []AudioCandidate{{Source: "audio-fixture", StreamIndex: 1, Language: "eng", Channels: 1, SampleRate: 48000}}, AudioPolicy{})
	snapshot, exists := playbackWindowSnapshot()
	if !exists || snapshot.Status != "ready" || len(snapshot.AudioTracks) != 1 || snapshot.AudioTracks[0].Status != "ready" {
		t.Fatalf("parallel joined window unavailable: %+v", snapshot)
	}
	if _, ok := readyVariantSnapshot(window.ID + "-video"); !ok {
		t.Fatal("video not published after join")
	}
	if !snapshot.MuxedAudio {
		t.Fatal("session audio was not joined into video delivery")
	}
	master, err := preparedWindowMasterPlaylist(window.ID+"-video", "fixture")
	if err != nil || strings.Contains(master, "#EXT-X-MEDIA:TYPE=AUDIO") || strings.Contains(master, "audio-0") {
		t.Fatalf("muxed session still delivers separate audio: %v %s", err, master)
	}
}
