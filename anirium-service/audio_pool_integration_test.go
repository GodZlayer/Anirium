package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestRealAudioWorkerUsesAlternativeWhenPreferredInputFails(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	input := filepath.Join(t.TempDir(), "alternative.flac")
	if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=8", "-ac", "2", "-c:a", "flac", input).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	var failedLoads, alternativeLoads atomic.Int32
	cache := newMediaInputCache(ctx, func(_ context.Context, source string, _ int) (string, error) {
		if source == "preferred" {
			failedLoads.Add(1)
			return "", fmt.Errorf("injected unavailable preferred input")
		}
		if source != "alternative" {
			return "", fmt.Errorf("unexpected source")
		}
		alternativeLoads.Add(1)
		return input, nil
	}, func(string) {})
	preferred := AudioCandidate{Language: "jpn", Source: "preferred", StreamIndex: 0, Channels: 2, Codec: "flac", SampleRate: 48000}
	stream := ffprobeStream{Index: 0, CodecType: "audio", CodecName: "flac", Channels: 2, SampleRate: "48000"}
	stream.Tags.Language = "jpn"
	swarmMu.Lock()
	oldContext, oldInputs, oldLinks, oldStreams, oldCandidates := playbackContext, playbackInputs, activeLinks, probedStreams, selectedAudioCandidates
	playbackContext, playbackInputs = ctx, cache
	activeLinks = []string{"preferred", "alternative"}
	probedStreams = map[string][]ffprobeStream{"preferred": {stream}, "alternative": {stream}}
	selectedAudioCandidates = []AudioCandidate{preferred}
	generation := playbackGeneration
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		cancel()
		swarmMu.Lock()
		playbackContext, playbackInputs, activeLinks, probedStreams, selectedAudioCandidates = oldContext, oldInputs, oldLinks, oldStreams, oldCandidates
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	buildAudioTrack(preferred, 0, generation)
	runtime, ready := readyVariantSnapshot(audioTrackID(generation, 0))
	if !ready || !runtime.ProcessingComplete || alternativeLoads.Load() != 1 || failedLoads.Load() != 2 {
		t.Fatalf("worker fallback failed: ready=%t complete=%t preferred loads=%d alternative loads=%d error=%v", ready, runtime.ProcessingComplete, failedLoads.Load(), alternativeLoads.Load(), runtime.processingError)
	}
	if len(runtime.provenance) == 0 {
		t.Fatal("real audio output lost source provenance")
	}
	for _, span := range runtime.provenance {
		if span.source != "alternative" || span.inputStream != "0:0" || span.duration <= 0 {
			t.Fatalf("incorrect audio source interval: %+v", span)
		}
	}
	swarmMu.RLock()
	tracks := audioTracksLocked()
	swarmMu.RUnlock()
	if len(tracks) != 1 || tracks[0].Language != "jpn" || tracks[0].Status != "ready" || tracks[0].PlaylistURL == "" {
		t.Fatalf("worker created duplicate or unready language outputs: %+v", tracks)
	}
	if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", filepath.Join(runtime.Dir, "index.m3u8"), "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("worker output decode: %v %s", err, output)
	}
}

func TestRealAudioPoolRecoversAfterPreferredPrefixFails(t *testing.T) {
	t.Run("matching-content", func(t *testing.T) { verifyAudioPoolRecovery(t, false) })
	t.Run("different-content", func(t *testing.T) { verifyAudioPoolRecovery(t, true) })
}

func verifyAudioPoolRecovery(t *testing.T, differentContent bool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	preferred := filepath.Join(root, "preferred.flac")
	alternative := filepath.Join(root, "alternative.m4a")
	alternativeArgs := []string{"-i", preferred, "-c:a", "aac", "-b:a", "160k", alternative}
	if differentContent {
		alternativeArgs = []string{"-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=8", "-ac", "2", "-c:a", "aac", "-b:a", "160k", alternative}
	}
	for _, args := range [][]string{
		{"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=8", "-ac", "2", "-c:a", "flac", preferred},
		alternativeArgs,
	} {
		if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), append([]string{"-hide_banner", "-loglevel", "error"}, args...)...).CombinedOutput(); err != nil {
			t.Fatalf("audio fixture: %v %s", err, output)
		}
	}
	firstPublished := make(chan struct{})
	var release sync.Once
	producers := []hlsProducer{
		{playlist: "available.m3u8", clockStream: "a:0", preference: 0, run: func(job context.Context, dir string) error {
			if err := transcodeAudioToHLS(job, preferred, dir, 0); err != nil {
				return err
			}
			segments, complete, err := readGeneratedHLS(filepath.Join(dir, "index.m3u8"))
			if err != nil || !complete || len(segments) < 2 {
				return fmt.Errorf("invalid preferred fixture: %v", err)
			}
			if err := publishEventPlaylist(job, dir, segments[:1], false); err != nil {
				return err
			}
			if err := os.Rename(filepath.Join(dir, "index.m3u8"), filepath.Join(dir, "available.m3u8")); err != nil {
				return err
			}
			return fmt.Errorf("injected preferred-source interruption")
		}},
		{playlist: "index.m3u8", clockStream: "a:0", preference: 1, run: func(job context.Context, dir string) error {
			select {
			case <-firstPublished:
			case <-job.Done():
				return job.Err()
			}
			return transcodeAudioToHLS(job, alternative, dir, 0)
		}},
	}
	outputDir := filepath.Join(root, "mixed")
	var final hlsProgress
	publishErr := publishIncrementalHLS(ctx, outputDir, producers, func(progress hlsProgress) {
		final = progress
		if progress.bufferedSeconds > 0 {
			release.Do(func() { close(firstPublished) })
		}
	})
	if differentContent {
		segments, complete, err := readGeneratedHLS(filepath.Join(outputDir, "index.m3u8"))
		if publishErr == nil || err != nil || complete || len(segments) != 1 || final.sources != 1 {
			t.Fatalf("incompatible audio recovery accepted: progress=%+v segments=%d complete=%t error=%v", final, len(segments), complete, publishErr)
		}
		return
	}
	if publishErr != nil {
		t.Fatal(publishErr)
	}
	if !final.complete || final.sources != 2 || final.bufferedSeconds < 7.9 || final.bufferedSeconds > 8.2 {
		t.Fatalf("audio recovery coverage invalid: %+v", final)
	}
	decoded, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", filepath.Join(outputDir, "index.m3u8"), "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
	if err != nil || len(decoded) < 7.9*48000*2 {
		t.Fatalf("mixed audio decode incomplete: bytes=%d err=%v", len(decoded), err)
	}
	for _, first := range []int{24000, 6 * 48000} {
		crossings := 0
		for sample := first + 1; sample < first+48000; sample++ {
			previous := int16(binary.LittleEndian.Uint16(decoded[2*(sample-1):]))
			current := int16(binary.LittleEndian.Uint16(decoded[2*sample:]))
			if previous < 0 && current >= 0 {
				crossings++
			}
		}
		if crossings < 420 || crossings > 460 {
			t.Fatalf("440Hz content lost around sample %d: crossings=%d", first, crossings)
		}
	}
}
