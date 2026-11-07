package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// A real loopback torrent peer supplies synthetic media through the production
// progressive input server. This proves transport and window clocks, not WAN peers.
func TestProgressivePeerSubtitleWindows(t *testing.T) {
	root := t.TempDir()
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=8"}
	for _, language := range []string{"eng", "por"} {
		path := filepath.Join(root, language+".srt")
		data := "1\n00:00:00,000 --> 00:00:01,000\n" + language + " early\n\n2\n00:00:10,000 --> 00:00:11,000\n" + language + " middle\n\n3\n00:00:59,000 --> 00:01:01,000\n" + language + " overlap\n\n4\n00:01:05,000 --> 00:01:06,000\n" + language + " late\n"
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		args = append(args, "-i", path)
	}
	input := filepath.Join(root, "fixture.mkv")
	args = append(args, "-t", "70", "-map", "0:v", "-map", "1:s", "-map", "2:s", "-c:v", "libx264", "-c:s", "srt", "-metadata:s:s:0", "language=eng", "-metadata:s:s:1", "language=por", input)
	if out, err := exec.Command(mediaTool("ffmpeg"), args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, out)
	}
	data, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	payloads := map[string][]byte{"Show S01E03 a.mkv": data, "Show S01E03 b.mkv": data, "Show S01E04.mkv": []byte("excluded")}
	testLocalTorrentPeerSources(t, payloads, func(ctx context.Context, cache *mediaInputCache, ids []string) {
		for _, id := range ids {
			for i, lang := range []string{"eng", "por"} {
				complete, err := extractCachedSubtitleWindow(ctx, cache, id, i+1, -1)
				if err != nil || !strings.Contains(complete, lang+" early") || !strings.Contains(complete, lang+" late") {
					t.Fatalf("complete subtitle through bounded torrent storage: %v", err)
				}
				for _, start := range []float64{8, 60} {
					vtt, err := extractCachedSubtitleWindow(ctx, cache, id, i+1, start)
					if err != nil {
						t.Fatal(err)
					}
					want := "00:02.000 --> 00:03.000\n" + lang + " middle"
					if start == 60 {
						want = "00:05.000 --> 00:06.000\n" + lang + " late"
					}
					if !strings.Contains(vtt, want) || strings.Contains(vtt, lang+" early") {
						t.Fatalf("source=%s lang=%s start=%v: %s", id, lang, start, vtt)
					}
					if start == 60 && !strings.Contains(vtt, "00:00.000 --> 00:01.000\n"+lang+" overlap") {
						t.Fatalf("overlap lost: %s", vtt)
					}
				}
			}
		}
	}, newProgressiveMediaInputCache)
}
