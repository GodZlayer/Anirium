package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHLSBandwidthMeasuresEncodedSegments(t *testing.T) {
	dir := t.TempDir()
	for name, size := range map[string]int{"a.ts": 1000, "b.ts": 3000} {
		if err := os.WriteFile(filepath.Join(dir, name), make([]byte, size), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "index.m3u8"), []byte("#EXTM3U\n#EXTINF:4,\na.ts\n#EXTINF:2,\nb.ts\n"), 0600); err != nil {
		t.Fatal(err)
	}
	rate, err := playlistBandwidth(dir)
	if err != nil || rate != 12000 {
		t.Fatalf("measured rate %d %v", rate, err)
	}
	master := masterPlaylist("video", []AudioTrack{{Status: "ready", PlaylistURL: "/audio", Bandwidth: 320000}}, "ticket", rate)
	if !strings.Contains(master, "BANDWIDTH=332000") {
		t.Fatal(master)
	}
}
