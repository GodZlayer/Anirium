package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMediaCleanupWaitsForPlaybackAndWorker(t *testing.T) {
	dir, err := os.MkdirTemp("", "anirium-cleanup-test-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	if err := os.WriteFile(filepath.Join(dir, "segment.ts"), []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	finish := retireMediaDirectory(ctx, dir)
	cancel()
	if _, err := os.Stat(dir); err != nil {
		t.Fatal("removed while worker still active")
	}
	finish()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("retired segments were not cleaned up")
}
