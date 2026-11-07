package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRealFFprobeDiscoversAudioAndEmbeddedSubtitle(t *testing.T) {
	root := t.TempDir()
	subtitles := filepath.Join(root, "fixture.srt")
	if err := os.WriteFile(subtitles, []byte("1\n00:00:00,000 --> 00:00:01,000\nAuthorized test fixture\n"), 0600); err != nil {
		t.Fatal(err)
	}
	input := filepath.Join(root, "fixture.mkv")
	cmd := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "color=c=black:s=160x120:r=24",
		"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
		"-i", subtitles, "-t", "2", "-map", "0:v:0", "-map", "1:a:0", "-map", "2:s:0",
		"-c:v", "libx264", "-c:a", "aac", "-c:s", "srt",
		"-metadata:s:a:0", "language=jpn", "-metadata:s:s:0", "language=por", input)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("media fixture: %v %s", err, output)
	}
	output, err := exec.Command(mediaTool("ffprobe"), "-v", "error", "-show_streams", "-of", "json", input).Output()
	if err != nil {
		t.Fatalf("FFprobe must execute for build validation: %v", err)
	}
	var probe ffprobeOutput
	if err := json.Unmarshal(output, &probe); err != nil {
		t.Fatal(err)
	}
	if len(probe.Streams) != 3 {
		t.Fatalf("unexpected streams: %+v", probe.Streams)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	loads := 0
	cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) { loads++; return input, nil })
	for attempt := 0; attempt < 2; attempt++ {
		cached, err := probeCachedInput(ctx, cache, "fixture")
		if err != nil || len(cached.Streams) != 3 {
			t.Fatalf("seekable cached probe: %+v %v", cached, err)
		}
	}
	if loads != 1 {
		t.Fatalf("duplicate fallback downloads: %d", loads)
	}
	text, err := extractCachedSubtitle(ctx, cache, "fixture", 2)
	if err != nil || !strings.Contains(text, "Authorized test fixture") {
		t.Fatalf("cached embedded subtitle: %q %v", text, err)
	}
	if loads != 1 {
		t.Fatal("subtitle extraction duplicated the cached download")
	}
	window, err := extractCachedSubtitleWindow(ctx, cache, "fixture", 2, 0)
	if err != nil || !strings.Contains(window, "Authorized test fixture") {
		t.Fatalf("window extraction: %q %v", window, err)
	}
	// Removing the synthetic source proves the second request uses the
	// completed VTT result, not another FFmpeg invocation or input read.
	if err := os.Remove(input); err != nil {
		t.Fatal(err)
	}
	repeated, err := extractCachedSubtitleWindow(ctx, cache, "fixture", 2, 0)
	if err != nil || repeated != window {
		t.Fatalf("completed window was not reused: %q %v", repeated, err)
	}
	candidates := audioCandidates([]string{"fixture"}, map[string][]ffprobeStream{"fixture": probe.Streams})
	if len(candidates) != 1 {
		t.Fatalf("audio inventory: %+v", candidates)
	}
	if index, found := subtitleStreamIndex(probe.Streams, "por"); !found || index != 2 {
		t.Fatalf("subtitle stream: index=%d found=%v", index, found)
	}
	for _, stream := range probe.Streams {
		if stream.CodecType == "audio" && (stream.Index != 1 || canonicalLanguage(stream.Tags.Language) != "jpn" || stream.SampleRate != "48000") {
			t.Fatalf("audio probe metadata: %+v", stream)
		}
	}
}
