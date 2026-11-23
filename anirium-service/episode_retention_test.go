package main

import (
	"testing"
)

func TestEpisodeRetentionEvictsAfterTwoSubsequentEpisodes(t *testing.T) {
	dir := t.TempDir()
	store := newEpisodeRetentionStore(dir)

	// Watch episode 1 and mark it completed (total - 5 min rule).
	if drop := store.recordAccess("anime-1:s1:e1", "hash-ep1"); len(drop) != 0 {
		t.Fatalf("unexpected early eviction: %v", drop)
	}
	store.markCompleted("anime-1:s1:e1")

	// Watch episode 2 (1st subsequent episode) -> ep1 must still be retained.
	if drop := store.recordAccess("anime-1:s1:e2", "hash-ep2"); len(drop) != 0 {
		t.Fatalf("ep1 should still be retained after 1 subsequent episode, got drop=%v", drop)
	}

	// Re-accessing episode 2 must NOT double-count as a 2nd episode.
	if drop := store.recordAccess("anime-1:s1:e2", "hash-ep2"); len(drop) != 0 {
		t.Fatalf("re-accessing ep2 must not evict ep1, got drop=%v", drop)
	}

	// Watch episode 3 (2nd distinct subsequent episode) -> ep1 must still be retained.
	if drop := store.recordAccess("anime-2:s1:e1", "hash-ep3"); len(drop) != 0 {
		t.Fatalf("ep1 should still be retained after 2 subsequent episodes, got drop=%v", drop)
	}

	// Watch episode 4 (3rd distinct subsequent episode) -> ep1 must now be evicted.
	drop := store.recordAccess("anime-2:s1:e2", "hash-ep4")
	if len(drop) != 1 || drop[0] != "hash-ep1" {
		t.Fatalf("expected hash-ep1 to be evicted after 3 subsequent episodes, got %v", drop)
	}

	// Reload from disk and verify ep1 is gone while ep2 and ep3 remain.
	reloaded := newEpisodeRetentionStore(dir)
	if _, exists := reloaded.entries["anime-1:s1:e1"]; exists {
		t.Fatal("evicted episode should not exist after reload")
	}
	if _, exists := reloaded.entries["anime-1:s1:e2"]; !exists {
		t.Fatal("uncompleted episode 2 should remain after reload")
	}
	if _, exists := reloaded.entries["anime-2:s1:e1"]; !exists {
		t.Fatal("active episode 3 should remain after reload")
	}
}
