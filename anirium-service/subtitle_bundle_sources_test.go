package main

import (
	"context"
	"reflect"
	"testing"
)

func TestSubtitleBundlePrefetchFallbackPreservesPlayingSourceCoverage(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	b.extract = func(context.Context, *mediaInputCache, string, []SubtitleTrack, float64) map[int]string {
		return map[int]string{1: "WEBVTT\n\n", 2: "WEBVTT\n\n"}
	}
	<-b.schedule(0, false).done
	oldSource := publicSubtitleSource("private-source")
	b.configure("next-source", []SubtitleTrack{{ID: "next", Source: "next-source", StreamIndex: 1, Language: "eng"}}, 180)
	if ahead, required := b.aheadForSource(20, oldSource); !required || ahead != 40 {
		t.Fatal("prefetch invalidated playing window")
	}
	if ahead, required := b.aheadForSource(20, publicSubtitleSource("next-source")); !required || ahead != 0 {
		t.Fatal("new source borrowed old coverage")
	}
	if len(b.snapshot(0, 0).Tracks) != 1 {
		t.Fatal("previous producer leaked into active catalog")
	}
}

func TestSubtitleVideoProducerStaysFirstUntilItBecomesIneligible(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	cache.rememberVideoProducer("1080p", "current")
	if got := cache.preferredVideoSources("1080p", []string{"faster", "current", "last"}); !reflect.DeepEqual(got, []string{"current", "faster", "last"}) {
		t.Fatalf("producer rotated: %v", got)
	}
	if got := cache.preferredVideoSources("720p", []string{"faster", "current"}); got[0] != "faster" {
		t.Fatal("quality-specific identity lost")
	}
	if got := cache.preferredVideoSources("1080p", []string{"compatible-fallback"}); len(got) != 1 || got[0] != "compatible-fallback" {
		t.Fatal("ineligible producer reintroduced")
	}
}

func TestBalancedPrefetchVideoSourcesRotatesCompatibleMagnets(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	sources := []string{"m0", "m1", "m2"}
	expected := map[float64][]string{
		0:  {"m0", "m1", "m2"},
		24: {"m1", "m2", "m0"},
		48: {"m2", "m0", "m1"},
		72: {"m0", "m1", "m2"},
	}
	for start, want := range expected {
		got := cache.balancedPrefetchVideoSources("1080p", sources, start)
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("windowStart=%v: got %v want %v", start, got, want)
		}
	}
}
