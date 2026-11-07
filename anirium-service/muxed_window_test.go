package main

import (
	"context"
	"math"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestMuxWindowCarriesVideoAndChosenAudioOnOriginalClock(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	root := t.TempDir()
	input := filepath.Join(root, "episode.mkv")
	output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=16", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=16", "-c:v", "libx264", "-threads", "1", "-c:a", "flac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	video, audio, combined := filepath.Join(root, "video"), filepath.Join(root, "audio"), filepath.Join(root, "combined")
	if err := transcodeVideoWindow(ctx, input, video, "120p", 8, 8); err != nil {
		t.Fatal(err)
	}
	if err := transcodeAudioWindow(ctx, input, audio, 1, audioOutputConfig{BitRate: 128000, SampleRate: 48000, Channels: 1}, 8, 8); err != nil {
		t.Fatal(err)
	}
	if err := muxPlaybackWindow(ctx, video, audio, combined, 8); err != nil {
		t.Fatal(err)
	}
	joined, complete, err := readGeneratedHLS(filepath.Join(combined, "index.m3u8"))
	if err != nil || !complete || len(joined) != 2 {
		t.Fatalf("joined segments: %d %v", len(joined), err)
	}
	videoSegments, _, _ := readGeneratedHLS(filepath.Join(video, "index.m3u8"))
	audioSegments, _, _ := readGeneratedHLS(filepath.Join(audio, "index.m3u8"))
	for _, sample := range []struct{ selector, path string }{{"v:0", videoSegments[0].path}, {"a:0", audioSegments[0].path}} {
		before, err := segmentPacketPTS(ctx, sample.path, sample.selector)
		if err != nil {
			t.Fatal(err)
		}
		after, err := segmentPacketPTS(ctx, joined[0].path, sample.selector)
		if err != nil || math.Abs(after-before) > 0.001 {
			t.Fatalf("mux changed episode clock: %.6f %.6f %v", before, after, err)
		}
	}
	if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-v", "error", "-i", filepath.Join(combined, "index.m3u8"), "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("decode: %v %s", err, output)
	}
}
