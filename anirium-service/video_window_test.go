package main

import (
	"context"
	"math"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestVideoWindowSeeksWithoutPublishingEarlierSegments(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	input := filepath.Join(root, "episode.mp4")
	output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=16", "-c:v", "libx264", "-threads", "1", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	dir := filepath.Join(root, "window")
	if err := transcodeVideoWindow(ctx, input, dir, "120p", 8, 8); err != nil {
		t.Fatal(err)
	}
	segments, complete, err := readGeneratedHLS(filepath.Join(dir, "index.m3u8"))
	if err != nil || !complete || len(segments) != 2 || filepath.Base(segments[0].path) != "segment-000002.ts" {
		t.Fatalf("incorrect demand window: %+v complete=%t err=%v", segments, complete, err)
	}
	first, err := segmentPacketPTS(ctx, segments[0].path, "v:0")
	if err != nil || first < 8 {
		t.Fatalf("window lost episode timestamp: %v %v", first, err)
	}
	second, err := segmentPacketPTS(ctx, segments[1].path, "v:0")
	if err != nil || math.Abs(second-first-4) > 0.05 {
		t.Fatalf("window clock discontinuity: %v %v %v", first, second, err)
	}
	if output, err := exec.Command(mediaTool("ffmpeg"), "-v", "error", "-i", segments[0].path, "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("seek segment not independently decodable: %v %s", err, output)
	}
}

func TestVideoWindowRejectsInvalidDemandBeforeCreatingOutput(t *testing.T) {
	for _, start := range []float64{-4, 3, math.NaN(), math.Inf(1)} {
		if err := transcodeVideoWindow(context.Background(), "unused", filepath.Join(t.TempDir(), "unused"), "720p", start, 8); err == nil {
			t.Fatal("invalid demand accepted")
		}
	}
}
