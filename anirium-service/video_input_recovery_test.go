package main

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestVideoVariantPublishesWhileAnotherInputIsBlocked(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	input := filepath.Join(t.TempDir(), "healthy.mp4")
	if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=black:size=320x240:rate=24:duration=8", "-c:v", "libx264", "-threads", "1", input).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	cache := newMediaInputCache(ctx, func(loadCtx context.Context, source string, _ int) (string, error) {
		if source == "blocked" {
			<-loadCtx.Done()
			return "", loadCtx.Err()
		}
		return input, nil
	}, func(string) {})
	swarmMu.Lock()
	oldCtx, oldInputs, oldStreams := playbackContext, playbackInputs, probedStreams
	playbackContext, playbackInputs = ctx, cache
	probedStreams = map[string][]ffprobeStream{
		"blocked": {{CodecType: "video", Height: 240}},
		"healthy": {{CodecType: "video", Height: 240}},
	}
	generation := playbackGeneration
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{}
	variantMu.Unlock()
	swarmMu.Unlock()
	done := make(chan struct{})
	go func() { defer close(done); buildVariant([]string{"blocked", "healthy"}, "240p", generation) }()
	defer func() {
		cancel()
		<-done
		swarmMu.Lock()
		playbackContext, playbackInputs, probedStreams = oldCtx, oldInputs, oldStreams
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	for {
		if runtime, ready := readyVariantSnapshot(playbackVariantID(generation, "240p")); ready && runtime.BufferedSeconds > 0 {
			return
		}
		select {
		case <-ticker.C:
		case <-timer.C:
			t.Fatal("healthy video was blocked behind unavailable source")
		}
	}
}
