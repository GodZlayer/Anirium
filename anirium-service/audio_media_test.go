package main

import (
	"context"
	"encoding/binary"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestAudioPlaylistPreservesDelayedTrackStart(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "delayed-audio.mkv")
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=24:duration=4", "-itsoffset", "1", "-f", "lavfi", "-i", "sine=frequency=800:duration=3", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "flac", input}
	if output, err := exec.Command("ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("delayed fixture: %v %s", err, output)
	}
	dir := filepath.Join(root, "audio")
	if err := transcodeAudioToHLS(context.Background(), input, dir, 1); err != nil {
		t.Fatal(err)
	}
	decoded, err := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-i", filepath.Join(dir, "index.m3u8"), "-t", "2", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
	if err != nil || len(decoded) < 2*48000*2 {
		t.Fatalf("delayed decode failed: samples=%d err=%v", len(decoded)/2, err)
	}
	meanAmplitude := func(first, last int) float64 {
		var total int64
		for sample := first; sample < last; sample++ {
			value := int64(int16(binary.LittleEndian.Uint16(decoded[2*sample:])))
			if value < 0 {
				value = -value
			}
			total += value
		}
		return float64(total) / float64(last-first)
	}
	if early, late := meanAmplitude(0, 24000), meanAmplitude(60000, 84000); early > 16 || late < 500 {
		t.Fatalf("original one-second audio delay lost: early amplitude=%.2f late=%.2f", early, late)
	}
}

func TestAudioPlaylistContainsRequestedTrack(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "multi-audio.mkv")
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=400:duration=8", "-f", "lavfi", "-i", "sine=frequency=800:duration=8", "-map", "0:a", "-map", "1:a", "-c:a", "flac", input}
	if output, err := exec.Command("ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	dir := filepath.Join(root, "audio")
	if err := transcodeAudioToHLS(context.Background(), input, dir, 1); err != nil {
		t.Fatal(err)
	}
	decoded, err := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-i", filepath.Join(dir, "index.m3u8"), "-t", "1", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
	if err != nil {
		t.Fatal(err)
	}
	crossings := 0
	for offset := 2; offset+1 < len(decoded); offset += 2 {
		previous := int16(binary.LittleEndian.Uint16(decoded[offset-2 : offset]))
		current := int16(binary.LittleEndian.Uint16(decoded[offset : offset+2]))
		if previous < 0 && current >= 0 {
			crossings++
		}
	}
	if crossings < 750 || crossings > 850 {
		t.Fatalf("expected 800Hz second track, counted %d crossings", crossings)
	}
}
