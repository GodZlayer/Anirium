package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestSubtitleBatchReadsAllTextTracksWithAbsoluteEpisodeClock(t *testing.T) {
	dir := t.TempDir()
	srt := filepath.Join(dir, "en.srt")
	ass := filepath.Join(dir, "pt.ass")
	media := filepath.Join(dir, "multi.mkv")
	if err := os.WriteFile(srt, []byte("1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:01:05,000 --> 00:01:08,000\nLater\n"), 0600); err != nil {
		t.Fatal(err)
	}
	content := "[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Olá\nDialogue: 0,0:01:05.00,0:01:08.00,Default,,0,0,0,,Depois\n"
	if err := os.WriteFile(ass, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	output, err := exec.Command(mediaTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=1:d=125", "-i", srt, "-i", ass, "-map", "0:v", "-map", "1:s", "-map", "2:s", "-c:v", "libx264", "-threads", "1", "-c:s:0", "srt", "-c:s:1", "ass", "-t", "125", media).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) { return media, nil }, func(string) {})
	tracks := []SubtitleTrack{{ID: "en", Source: "fixture", StreamIndex: 1, Language: "eng"}, {ID: "pt", Source: "fixture", StreamIndex: 2, Language: "por"}}
	for _, start := range []float64{0, 60, 120} {
		result := extractSubtitleBatch(ctx, cache, "fixture", tracks, start)
		if len(result) != 2 {
			t.Fatalf("batch %.0f delivered %d tracks", start, len(result))
		}
		for _, track := range tracks {
			cues, err := parseBundleCues(result[track.StreamIndex], start)
			if err != nil {
				t.Fatal(err)
			}
			if start == 120 {
				if len(cues) != 0 {
					t.Fatal("silence invented cues")
				}
			} else if len(cues) != 1 || cues[0].Start != start+map[bool]float64{true: 5, false: 1}[start == 60] {
				t.Fatalf("wrong absolute clock: start=%v cues=%+v", start, cues)
			}
		}
	}
}
