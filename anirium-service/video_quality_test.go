package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

func TestActual360pVariantEncodesAtAdvertisedHeight(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "authorized-generated-video.mp4")
	if output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=480x360:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-c:a", "aac", input).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	dir := filepath.Join(root, "360p")
	if _, err := transcodeSourceToHLS(input, dir, "360p", context.Background()); err != nil {
		t.Fatal(err)
	}
	output, err := exec.Command(mediaTool("ffprobe"), "-v", "error", "-show_streams", "-of", "json", filepath.Join(dir, "source.m3u8")).Output()
	if err != nil {
		t.Fatal(err)
	}
	var probe ffprobeOutput
	if json.Unmarshal(output, &probe) != nil || len(probe.Streams) != 1 || probe.Streams[0].CodecType != "video" || probe.Streams[0].Height != 360 {
		t.Fatalf("advertised height differs from media: %s", output)
	}
	invalidDir := filepath.Join(root, "invalid")
	if _, err := transcodeSourceToHLS(input, invalidDir, "invalid"); err == nil {
		t.Fatal("invalid quality silently encoded")
	}
	if _, err := os.Stat(invalidDir); !os.IsNotExist(err) {
		t.Fatal("invalid quality created output")
	}
}

func TestQualityInventoryPreservesActualHeightsAndDeduplicates(t *testing.T) {
	got := selectVariantQualities([]string{"360p", "1440p", "1080p", "720p", "480p", "240p", "4k", "2160p", "unknown", "-2p"})
	want := []string{"4k", "1440p", "1080p", "720p", "480p", "360p", "240p"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("invented or hidden qualities: %v", got)
	}
	if qualityForHeight(1440) != "1440p" || qualityHeight("360p") != "360" {
		t.Fatal("actual resolution lost")
	}
	if videoSupportsQuality([]ffprobeStream{{CodecType: "video", Height: 360}}, "480p") {
		t.Fatal("lower-resolution input upscaled")
	}
}
