package main

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestVariantDemandRejectsUnprobedQualityAndOldGeneration(t *testing.T) {
	swarmMu.Lock()
	oldQualities, oldContext := currentMixQualities, playbackContext
	oldDiscovery := playbackDiscoveryComplete
	playbackDiscoveryComplete = false
	currentMixQualities = []string{"720p"}
	playbackContext = context.Background()
	generation := playbackGeneration
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		currentMixQualities, playbackContext = oldQualities, oldContext
		playbackDiscoveryComplete = oldDiscovery
		swarmMu.Unlock()
	}()
	if requestVideoVariant("720p", generation) {
		t.Fatal("variant started before full inventory discovery")
	}
	swarmMu.Lock()
	playbackDiscoveryComplete = true
	swarmMu.Unlock()
	if requestVideoVariant("4k", generation) || requestVideoVariant("720p", generation+1) {
		t.Fatal("unavailable quality or old playback accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	swarmMu.Lock()
	playbackContext = ctx
	swarmMu.Unlock()
	if requestVideoVariant("720p", generation) {
		t.Fatal("canceled playback started a variant")
	}
}

func TestRealVariantDemandDoesNotProcessUnrequestedQuality(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	input := filepath.Join(t.TempDir(), "source.mp4")
	if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=black:size=320x240:rate=24:duration=8", "-c:v", "libx264", "-threads", "1", input).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	var available atomic.Bool
	cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) {
		if !available.Load() {
			return "", fmt.Errorf("temporary input failure")
		}
		return input, nil
	}, func(string) {})
	swarmMu.Lock()
	oldCtx, oldInputs, oldLinks, oldStreams := playbackContext, playbackInputs, activeLinks, probedStreams
	oldQualities, oldRequested, oldWorkers := currentMixQualities, requestedVariants, playbackWorkers
	oldDiscovery := playbackDiscoveryComplete
	playbackDiscoveryComplete = true
	playbackContext, playbackInputs = ctx, cache
	activeLinks = []string{"fixture"}
	probedStreams = map[string][]ffprobeStream{"fixture": {{CodecType: "video", Height: 240}}}
	currentMixQualities = []string{"240p", "120p"}
	requestedVariants = map[string]bool{}
	workers := &sync.WaitGroup{}
	playbackWorkers = workers
	generation := playbackGeneration
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		cancel()
		workers.Wait()
		swarmMu.Lock()
		playbackContext, playbackInputs, activeLinks, probedStreams = oldCtx, oldInputs, oldLinks, oldStreams
		currentMixQualities, requestedVariants, playbackWorkers = oldQualities, oldRequested, oldWorkers
		playbackDiscoveryComplete = oldDiscovery
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	if !requestVideoVariant("240p", generation) || !requestVideoVariant("240p", generation) {
		t.Fatal("valid demand rejected")
	}
	workers.Wait()
	variantMu.RLock()
	failed := *variantRuntimes[playbackVariantID(generation, "240p")]
	variantMu.RUnlock()
	if failed.Status != "stalled" {
		t.Fatalf("unavailable source did not fail honestly: %+v", failed)
	}
	available.Store(true)
	if !requestVideoVariant("240p", generation) {
		t.Fatal("failed quality could not be retried")
	}
	workers.Wait()
	first, ready := readyVariantSnapshot(playbackVariantID(generation, "240p"))
	if !ready || !first.ProcessingComplete {
		t.Fatalf("requested quality did not finish: %+v", first)
	}
	variantMu.RLock()
	_, unrequested := variantRuntimes[playbackVariantID(generation, "120p")]
	count := len(variantRuntimes)
	variantMu.RUnlock()
	if unrequested || count != 1 {
		t.Fatal("unrequested or duplicate variant was started")
	}
	if !requestVideoVariant("120p", generation) {
		t.Fatal("later selection rejected")
	}
	workers.Wait()
	if second, ready := readyVariantSnapshot(playbackVariantID(generation, "120p")); !ready || !second.ProcessingComplete {
		t.Fatal("later selection did not produce media")
	}
}
