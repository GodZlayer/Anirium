package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMixedPlaylistRetriesCompatibleSourceWithoutDeletingTimeline(t *testing.T) {
	root := t.TempDir()
	good := filepath.Join(root, "good.ts")
	if err := os.WriteFile(good, []byte("media"), 0600); err != nil {
		t.Fatal(err)
	}
	sources := [][]hlsSegment{
		{{path: filepath.Join(root, "missing.ts"), size: 1, duration: "4.01"}},
		{{path: good, size: 5, duration: "4.01"}},
	}
	if err := writeMixedPlaylist(context.Background(), root, sources); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "index.m3u8"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "#EXT-X-TARGETDURATION:5") || !strings.Contains(string(data), "#EXTINF:4.01") || !strings.Contains(string(data), "#EXT-X-ENDLIST") {
		t.Fatal(string(data))
	}
	copied, err := os.ReadFile(filepath.Join(root, "segment-000000.ts"))
	if err != nil || string(copied) != "media" {
		t.Fatalf("fallback media: %s %v", copied, err)
	}
}

func TestMissingSegmentDoesNotPublishTruncatedEpisode(t *testing.T) {
	root := t.TempDir()
	good := filepath.Join(root, "good.ts")
	if err := os.WriteFile(good, []byte("media"), 0600); err != nil {
		t.Fatal(err)
	}
	sources := [][]hlsSegment{{{path: good, size: 5, duration: "4"}, {path: filepath.Join(root, "missing.ts"), size: 1, duration: "4"}}}
	if err := writeMixedPlaylist(context.Background(), root, sources); err == nil {
		t.Fatal("missing position silently skipped")
	}
	if _, err := os.Stat(filepath.Join(root, "index.m3u8")); !os.IsNotExist(err) {
		t.Fatal("truncated playlist published")
	}
}
