package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestFilesFromOneTorrentHaveSeparateSharedCacheEntries(t *testing.T) {
	mediaSourceMu.Lock()
	old := mediaSources
	mediaSources = map[string]mediaSource{"version-a": {Magnet: "same-torrent", FilePath: "Show S01E03 720p.mkv"}, "version-b": {Magnet: "same-torrent", FilePath: "Show S01E03 1080p.mp4"}}
	mediaSourceMu.Unlock()
	defer func() { mediaSourceMu.Lock(); mediaSources = old; mediaSourceMu.Unlock() }()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	root := t.TempDir()
	loads := 0
	cache := newMediaInputCache(ctx, func(_ context.Context, id string, _ int) (string, error) {
		loads++
		source := resolveMediaSource(id)
		if source.Magnet != "same-torrent" {
			t.Error("torrent identity changed")
		}
		path := filepath.Join(root, source.FilePath)
		return path, os.WriteFile(path, []byte(id), 0600)
	})
	paths := map[string]string{}
	for _, id := range []string{"version-a", "version-b", "version-a", "version-b"} {
		path, release, err := cache.acquire(ctx, id, 0)
		if err != nil {
			t.Fatal(err)
		}
		paths[id] = path
		release()
	}
	if loads != 2 || paths["version-a"] == paths["version-b"] {
		t.Fatal("different files incorrectly deduplicated")
	}
}
