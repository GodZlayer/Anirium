package main

import (
	"context"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestVideoHLSPreservesRelativeDelayedVideoStart(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	input := filepath.Join(root, "delayed-video.mkv")
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=800:duration=4", "-itsoffset", "1", "-f", "lavfi", "-i", "color=s=160x120:r=24:duration=3", "-map", "1:v", "-map", "0:a", "-fps_mode", "passthrough", "-c:v", "libx264", "-c:a", "flac", input}
	if output, err := exec.CommandContext(ctx, "ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("delayed-video fixture: %v %s", err, output)
	}
	firstPTS := func(path, selector string) float64 {
		output, err := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-select_streams", selector, "-show_entries", "packet=pts_time", "-read_intervals", "%+#1", "-of", "json", path).Output()
		if err != nil {
			t.Fatal(err)
		}
		var probe struct {
			Packets []struct {
				PTS string `json:"pts_time"`
			} `json:"packets"`
		}
		if err := json.Unmarshal(output, &probe); err != nil || len(probe.Packets) != 1 {
			t.Fatalf("packet probe failed: %s", output)
		}
		value, err := strconv.ParseFloat(probe.Packets[0].PTS, 64)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	if delay := firstPTS(input, "v:0") - firstPTS(input, "a:0"); delay < 0.9 || delay > 1.1 {
		t.Fatalf("fixture delay invalid: %.3f", delay)
	}
	dir := filepath.Join(root, "hls")
	_, err := transcodeSourceToHLS(input, dir, "480p", ctx)
	if err != nil {
		t.Fatal(err)
	}
	playlist := filepath.Join(dir, "source.m3u8")
	audioDir := filepath.Join(root, "audio")
	if err := transcodeAudioToHLS(ctx, input, audioDir, 1); err != nil {
		t.Fatal(err)
	}
	delay := firstPTS(playlist, "v:0") - firstPTS(filepath.Join(audioDir, "index.m3u8"), "a:0")
	if delay < 0.9 || delay > 1.1 {
		t.Fatalf("relative one-second video delay lost: delay=%.3f", delay)
	}
}
