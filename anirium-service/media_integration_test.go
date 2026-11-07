package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// Container continuity only: deliberately different colors do not establish
// release compatibility. Production content guards are exercised separately.
func TestHLSContainerDecodesAcrossSyntheticSourceTransition(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Fatal("FFmpeg is required to validate the media build")
	}
	root := t.TempDir()
	sources := make([][]hlsSegment, 2)
	for index, color := range []string{"red", "blue"} {
		input := filepath.Join(root, fmt.Sprintf("input-%d.mp4", index))
		cmd := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c="+color+":s=320x240:r=24", "-t", "8", "-c:v", "libx264", "-pix_fmt", "yuv420p", input)
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("fixture: %v %s", err, output)
		}
		segments, err := transcodeSourceToHLS(input, filepath.Join(root, fmt.Sprintf("source-%d", index)), "480p")
		if err != nil {
			t.Fatal(err)
		}
		if len(segments) != 2 {
			t.Fatalf("source %d produced %d segments instead of two", index, len(segments))
		}
		sources[index] = segments
	}
	playlist := "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n"
	for position := 0; position < 2; position++ {
		if sources[0][position].duration != sources[1][position].duration {
			t.Fatal("source segment boundaries differ")
		}
		// Use one segment from each real input to exercise a source transition.
		chosen := sources[position][position]
		name := fmt.Sprintf("mixed-%d.ts", position)
		if err := copyFile(chosen.path, filepath.Join(root, name)); err != nil {
			t.Fatal(err)
		}
		playlist += fmt.Sprintf("#EXTINF:%s,\n%s\n", chosen.duration, name)
	}
	playlist += "#EXT-X-ENDLIST\n"
	output := filepath.Join(root, "mixed.m3u8")
	if err := os.WriteFile(output, []byte(playlist), 0600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-i", output, "-f", "null", "-")
	if data, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("mixed playback decode: %v %s", err, data)
	}
}

func TestRealVideoSegmentSelectionPrefersSmallerCompatibleOutput(t *testing.T) {
	root := t.TempDir()
	sources := make([][]hlsSegment, 2)
	for index, crf := range []string{"18", "32"} {
		dir := filepath.Join(root, fmt.Sprintf("compression-%d", index))
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=24:duration=4", "-an", "-c:v", "libx264", "-crf", crf, "-g", "96", "-f", "hls", "-hls_time", "4", "-hls_segment_filename", filepath.Join(dir, "video-%06d.ts"), filepath.Join(dir, "source.m3u8"))
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("fixture: %v %s", err, output)
		}
		segments, _, err := readGeneratedHLS(filepath.Join(dir, "source.m3u8"))
		if err != nil || len(segments) != 1 {
			t.Fatalf("invalid compressed fixture: %+v %v", segments, err)
		}
		sources[index] = segments
	}
	if sources[1][0].size >= sources[0][0].size {
		t.Fatal("fixture did not produce smaller output")
	}
	chosen, ok := chooseProducerSegment(sources, []hlsProducer{{}, {}}, 0)
	if !ok || chosen.path != sources[1][0].path {
		t.Fatal("larger encoded segment selected")
	}
	if output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", chosen.path, "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("selected output cannot decode: %v %s", err, output)
	}
}
