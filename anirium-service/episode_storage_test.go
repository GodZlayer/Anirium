package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEpisodeStorageLRUAndSubtitles(t *testing.T) {
	base := t.TempDir()
	mgr := &episodeStorageManager{entries: map[string]*episodeIndexEntry{}}
	mgr.init(base)

	dir1, _ := mgr.ensureEpisodeDir("ep:1", "Quanzhi Gaoshou", "w1", 1, 1, "e1")
	time.Sleep(5 * time.Millisecond)
	mgr.recordMagnets("ep:1", "Quanzhi Gaoshou", "w1", 1, 1, "e1", []string{"magnet:?xt=urn:btih:111"})
	mgr.saveSubtitle("ep:1", persistedSubtitleBlock{TrackID: "sub-1", Language: "por", Start: 0, End: 60, VTT: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOi\n"})

	dir2, _ := mgr.ensureEpisodeDir("ep:2", "Quanzhi Gaoshou", "w1", 1, 2, "e2")
	time.Sleep(5 * time.Millisecond)
	dir3, _ := mgr.ensureEpisodeDir("ep:3", "Returners Magic", "w2", 2, 8, "e3")
	time.Sleep(5 * time.Millisecond)

	if _, entry, ok := mgr.lookup("ep:1"); !ok || len(entry.Magnets) != 1 || entry.SubtitleCount != 1 {
		t.Fatalf("expected ep:1 cached with 1 magnet and 1 sub, got ok=%t entry=%+v", ok, entry)
	}
	if subs := mgr.loadSubtitles("ep:1"); len(subs) != 1 {
		t.Fatalf("expected 1 persisted subtitle for ep:1, got %d", len(subs))
	}

	// 4th episode must evict ep:1 (oldest) and remove its physical folder.
	dir4, _ := mgr.ensureEpisodeDir("ep:4", "Bleach", "w3", 1, 1, "e4")
	if _, err := os.Stat(dir1); !os.IsNotExist(err) {
		t.Fatalf("expected evicted ep:1 dir %s to be removed", dir1)
	}
	for _, kept := range []string{dir2, dir3, dir4} {
		if _, err := os.Stat(filepath.Join(kept, "episode.json")); err != nil {
			t.Fatalf("expected kept episode.json in %s: %v", kept, err)
		}
	}
}

func TestFixedPieceResourceCacheReusesExistingPieces(t *testing.T) {
	root := filepath.Join(t.TempDir(), "pieces")
	completedDir := filepath.Join(root, "completed")
	if err := os.MkdirAll(completedDir, 0o700); err != nil {
		t.Fatal(err)
	}
	pieceFile := filepath.Join(completedDir, "0123456789abcdef0123456789abcdef01234567")
	if err := os.WriteFile(pieceFile, []byte("cached-piece-data"), 0o600); err != nil {
		t.Fatal(err)
	}

	cache, err := newFixedPieceResourceCache(root, 64<<20)
	if err != nil {
		t.Fatalf("newFixedPieceResourceCache failed: %v", err)
	}
	if cache.used != int64(len("cached-piece-data")) {
		t.Fatalf("expected existing piece indexed (used=%d), got %d", len("cached-piece-data"), cache.used)
	}
}

func TestEpisodeStorageLocalHLSWindowHitAndEviction(t *testing.T) {
	base := t.TempDir()
	mgr := &episodeStorageManager{entries: map[string]*episodeIndexEntry{}}
	mgr.init(base)

	mgr.ensureEpisodeDir("ep:hls1", "Returners Magic", "w1", 2, 8, "e1")
	winDir := mgr.hlsWindowDir("ep:hls1", "1080p", 0)
	if winDir == "" {
		t.Fatalf("expected non-empty hlsWindowDir")
	}
	if _, ok := mgr.hasLocalHLSWindow("ep:hls1", "1080p", 0); ok {
		t.Fatalf("expected no local HLS hit before playlist/segments exist")
	}
	_ = os.WriteFile(filepath.Join(winDir, "index.m3u8"), []byte("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nseg0.ts\n"), 0o600)
	_ = os.WriteFile(filepath.Join(winDir, "seg0.ts"), []byte("fake-ts-bytes"), 0o600)

	gotDir, ok := mgr.hasLocalHLSWindow("ep:hls1", "1080p", 0)
	if !ok || gotDir != winDir {
		t.Fatalf("expected local HLS hit at %s, got ok=%t dir=%s", winDir, ok, gotDir)
	}
	mgr.recordLocalHLSWindow("ep:hls1", "1080p", 0, 1440)
	if _, entry, ok := mgr.lookup("ep:hls1"); !ok || len(entry.HLSRanges) != 1 || entry.Duration != 1440 {
		t.Fatalf("expected recorded HLS range and duration, got ok=%t entry=%+v", ok, entry)
	}
}
