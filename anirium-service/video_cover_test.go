package main

import (
	"context"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestAttachedCoverDoesNotDeclareVideoQuality(t *testing.T) {
	var probe ffprobeOutput
	if err := json.Unmarshal([]byte(`{"streams":[{"codec_type":"video","height":2160,"disposition":{"attached_pic":1}},{"codec_type":"video","height":480}]}`), &probe); err != nil {
		t.Fatal(err)
	}
	if videoSupportsQuality(probe.Streams, "4k") || !videoSupportsQuality(probe.Streams, "480p") || videoSupportsQuality(probe.Streams[:1], "480p") {
		t.Fatal("attached cover treated as episode video")
	}
}

func TestRealAttachedCoverDoesNotBecomeHLSVideo(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "episode-with-cover.mp4")
	data, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "color=c=red:s=640x480:r=1:duration=1",
		"-f", "lavfi", "-i", "testsrc2=s=160x120:r=24:duration=2",
		"-map", "0:v", "-map", "1:v", "-c:v:0", "mjpeg", "-frames:v:0", "1", "-disposition:v:0", "attached_pic",
		"-c:v:1", "libx264", "-pix_fmt:v:1", "yuv420p", input).CombinedOutput()
	if err != nil {
		t.Fatalf("cover fixture failed: %v %s", err, data)
	}
	data, err = exec.Command(mediaTool("ffprobe"), "-v", "error", "-show_streams", "-of", "json", input).Output()
	var probe ffprobeOutput
	if err != nil || json.Unmarshal(data, &probe) != nil {
		t.Fatalf("fixture probe failed: %v", err)
	}
	cover := false
	for _, stream := range probe.Streams {
		cover = cover || stream.Disposition.AttachedPic != 0
	}
	if !cover || videoSupportsQuality(probe.Streams, "480p") || !videoSupportsQuality(probe.Streams, "120p") {
		t.Fatalf("invalid real cover inventory: %+v", probe)
	}
	dir := filepath.Join(root, "hls")
	if _, err := transcodeSourceToHLS(input, dir, "120p", context.Background()); err != nil {
		t.Fatal(err)
	}
	data, err = exec.Command(mediaTool("ffprobe"), "-v", "error", "-show_streams", "-of", "json", filepath.Join(dir, "source.m3u8")).Output()
	if err != nil || json.Unmarshal(data, &probe) != nil || len(probe.Streams) != 1 || probe.Streams[0].Height != 120 || probe.Streams[0].Width != 160 {
		t.Fatalf("HLS encoded cover instead of episode: %+v %v", probe, err)
	}
}
