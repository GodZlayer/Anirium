package main

import (
	"context"
	"fmt"
	"math"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestConsecutiveWindowsKeepAudioVideoEpisodeClock(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	input := filepath.Join(root, "episode.mp4")
	output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=24", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	var previousVideo, previousAudio float64
	for index, start := range []float64{0, 8, 16} {
		videoDir := filepath.Join(root, fmt.Sprintf("video-%d", index))
		audioDir := filepath.Join(root, fmt.Sprintf("audio-%d", index))
		if err := transcodeVideoWindow(ctx, input, videoDir, "120p", start, 8); err != nil {
			t.Fatal(err)
		}
		if err := transcodeAudioWindow(ctx, input, audioDir, 1, audioOutputConfig{BitRate: 128000, SampleRate: 48000, Channels: 1}, start, 8); err != nil {
			t.Fatal(err)
		}
		video, complete, err := readGeneratedHLS(filepath.Join(videoDir, "index.m3u8"))
		if err != nil || !complete || len(video) != 2 {
			t.Fatalf("video window: %v %v", complete, err)
		}
		audio, complete, err := readGeneratedHLS(filepath.Join(audioDir, "index.m3u8"))
		if err != nil || !complete || len(audio) < 2 {
			t.Fatalf("audio window: %v %v", complete, err)
		}
		v, err := segmentPacketPTS(ctx, video[0].path, "v:0")
		if err != nil {
			t.Fatal(err)
		}
		a, err := segmentPacketPTS(ctx, audio[0].path, "a:0")
		if err != nil || math.Abs(v-a) > 0.05 {
			t.Fatalf("window %d audio/video mismatch: %v %v %v", index, v, a, err)
		}
		if index > 0 && (math.Abs(v-previousVideo-8) > 0.05 || math.Abs(a-previousAudio-8) > 0.05) {
			t.Fatalf("window boundary reset episode clock: video %v -> %v audio %v -> %v", previousVideo, v, previousAudio, a)
		}
		previousVideo, previousAudio = v, a
	}
}
