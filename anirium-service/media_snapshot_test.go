package main

import "testing"

func TestFailedProducerRetainsPublishedPrefixWithoutClaimingCompletion(t *testing.T) {
	variantMu.Lock()
	old := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{
		"prefix": {MixVariant: MixVariant{Status: "ready", BufferedSeconds: 4, PlaylistURL: "/hls/prefix/index.m3u8"}},
		"empty":  {MixVariant: MixVariant{Status: "preparing"}},
	}
	variantMu.Unlock()
	defer func() { variantMu.Lock(); variantRuntimes = old; variantMu.Unlock() }()
	markVariantStalled("prefix")
	markVariantStalled("empty")
	snapshot, ok := readyVariantSnapshot("prefix")
	if !ok || !snapshot.ProcessingFailed || snapshot.ProcessingComplete || snapshot.BufferedSeconds != 4 {
		t.Fatalf("published prefix lost or falsely completed: %+v", snapshot)
	}
	if _, ok := readyVariantSnapshot("empty"); ok {
		t.Fatal("failed empty producer became playable")
	}
}

func TestMediaHTTPOnlyReceivesImmutableReadySnapshot(t *testing.T) {
	variantMu.Lock()
	old := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{
		"ready":   {MixVariant: MixVariant{Status: "ready", AudioLanguages: []string{"jpn"}}, Dir: "owned-cache"},
		"pending": {MixVariant: MixVariant{Status: "preparing"}},
		"failed":  {MixVariant: MixVariant{Status: "stalled"}},
	}
	variantMu.Unlock()
	defer func() { variantMu.Lock(); variantRuntimes = old; variantMu.Unlock() }()
	for _, id := range []string{"pending", "failed", "missing"} {
		if _, ok := readyVariantSnapshot(id); ok {
			t.Fatalf("unready HTTP output: %s", id)
		}
	}
	snapshot, ok := readyVariantSnapshot("ready")
	if !ok {
		t.Fatal("ready variant unavailable")
	}
	variantMu.Lock()
	variantRuntimes["ready"].Status = "stalled"
	variantRuntimes["ready"].AudioLanguages[0] = "por"
	variantMu.Unlock()
	if snapshot.Status != "ready" || snapshot.AudioLanguages[0] != "jpn" {
		t.Fatal("worker mutated HTTP snapshot")
	}
}
