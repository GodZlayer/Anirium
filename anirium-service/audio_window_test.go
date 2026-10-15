package main

import (
	"context"
	"encoding/binary"
	"math"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestAudioWindowPreservesDelayRelativeToSeekPosition(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "delayed.mkv")
	output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=24:duration=16", "-itsoffset", "6", "-f", "lavfi", "-i", "sine=frequency=800:sample_rate=48000:duration=10", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-threads", "1", "-c:a", "flac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	dir := filepath.Join(root, "window")
	if err := transcodeAudioWindow(context.Background(), input, dir, 1, audioOutputConfig{BitRate: 128000, SampleRate: 48000, Channels: 1}, 4, 8); err != nil {
		t.Fatal(err)
	}
	decoded, err := exec.Command(mediaTool("ffmpeg"), "-v", "error", "-i", filepath.Join(dir, "index.m3u8"), "-t", "4", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
	if err != nil || len(decoded) < 4*48000*2 {
		t.Fatalf("decode: %v samples=%d", err, len(decoded)/2)
	}
	amplitude := func(first, last int) float64 {
		var sum float64
		for sample := first; sample < last; sample++ {
			sum += math.Abs(float64(int16(binary.LittleEndian.Uint16(decoded[2*sample:]))))
		}
		return sum / float64(last-first)
	}
	if early, late := amplitude(0, 48000), amplitude(120000, 168000); early > 16 || late < 500 {
		t.Fatalf("two-second remaining delay lost after seek: early=%v late=%v", early, late)
	}
}

func TestAudioWindowSeeksAndPreservesEpisodeClock(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	input := filepath.Join(root, "episode.m4a")
	output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=16", "-c:a", "aac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	dir := filepath.Join(root, "window")
	if err := transcodeAudioWindow(ctx, input, dir, 0, audioOutputConfig{BitRate: 128000, SampleRate: 48000, Channels: 1}, 8, 8); err != nil {
		t.Fatal(err)
	}
	segments, complete, err := readGeneratedHLS(filepath.Join(dir, "index.m3u8"))
	if err != nil || !complete || len(segments) < 2 || filepath.Base(segments[0].path) != "audio-000002.ts" {
		t.Fatalf("invalid audio window: %+v %t %v", segments, complete, err)
	}
	first, err := segmentPacketPTS(ctx, segments[0].path, "a:0")
	if err != nil || first < 8 {
		t.Fatalf("lost episode clock: %v %v", first, err)
	}
	second, err := segmentPacketPTS(ctx, segments[1].path, "a:0")
	if err != nil || math.Abs(second-first-4) > 0.05 {
		t.Fatalf("discontinuous audio window: %v %v %v", first, second, err)
	}
	if output, err := exec.Command(mediaTool("ffmpeg"), "-v", "error", "-i", filepath.Join(dir, "index.m3u8"), "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("audio decode: %v %s", err, output)
	}
}

func TestAudioVideoWindowsShareEpisodeClock(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	input := filepath.Join(root, "episode.mp4")
	output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=16", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=16", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	videoDir := filepath.Join(root, "video")
	audioDir := filepath.Join(root, "audio")
	if err := transcodeVideoWindow(ctx, input, videoDir, "120p", 8, 8); err != nil {
		t.Fatal(err)
	}
	if err := transcodeAudioWindow(ctx, input, audioDir, 1, audioOutputConfig{BitRate: 128000, SampleRate: 48000, Channels: 1}, 8, 8); err != nil {
		t.Fatal(err)
	}
	video, _, err := readGeneratedHLS(filepath.Join(videoDir, "index.m3u8"))
	if err != nil || len(video) < 2 {
		t.Fatalf("video segments: %v %v", video, err)
	}
	audio, _, err := readGeneratedHLS(filepath.Join(audioDir, "index.m3u8"))
	if err != nil || len(audio) < 2 {
		t.Fatalf("audio segments: %v %v", audio, err)
	}
	for i := 0; i < 2; i++ {
		v, err := segmentPacketPTS(ctx, video[i].path, "v:0")
		if err != nil {
			t.Fatal(err)
		}
		a, err := segmentPacketPTS(ctx, audio[i].path, "a:0")
		if err != nil || math.Abs(v-a) > 0.05 {
			t.Fatalf("window %d audio/video clock mismatch: video=%v audio=%v err=%v", i, v, a, err)
		}
	}
}
