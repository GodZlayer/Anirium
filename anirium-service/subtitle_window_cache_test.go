package main

import (
	"context"
	"strings"
	"testing"
)

func TestSubtitleWindowCacheIsBoundedAndPlaybackScoped(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) {
		t.Fatal("cached window must not open source again")
		return "", nil
	}, func(string) {})
	key := subtitleWindowKey{source: "fixture", stream: 1, start: 45}
	const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\nfixture\n"
	cache.rememberSubtitleWindow(key, vtt)
	actual, err := extractCachedSubtitleWindow(ctx, cache, key.source, key.stream, key.start)
	if err != nil || actual != vtt {
		t.Fatalf("cached extraction: %q %v", actual, err)
	}
	for _, other := range []subtitleWindowKey{{"other", 1, 45}, {"fixture", 2, 45}, {"fixture", 1, 90}} {
		if _, exists := cache.cachedSubtitleWindow(other); exists {
			t.Fatal("track/source/window collision")
		}
	}
	cache.rememberSubtitleWindow(subtitleWindowKey{"full", 1, -1}, vtt)
	cache.rememberSubtitleWindow(subtitleWindowKey{"large", 1, 0}, strings.Repeat("x", (512<<10)+1))
	if len(cache.subtitleWindows) != 2 {
		t.Fatal("complete track must be cached; oversized partial response must not")
	}
	full, err := extractCachedSubtitle(ctx, cache, "full", 1)
	if err != nil || full != vtt {
		t.Fatalf("complete track reopened input: %v", err)
	}
	for i := 0; i < 64; i++ {
		cache.rememberSubtitleWindow(subtitleWindowKey{"fixture", 1, float64(100 + i)}, vtt)
	}
	if len(cache.subtitleWindows) != 64 {
		t.Fatal("cache capacity exceeded")
	}
	if _, exists := cache.cachedSubtitleWindow(key); exists {
		t.Fatal("old window not evicted")
	}
	cancel()
	if _, exists := cache.cachedSubtitleWindow(subtitleWindowKey{"fixture", 1, 163}); exists {
		t.Fatal("retired playback must not serve cached results")
	}
	if _, err := extractCachedSubtitleWindow(ctx, cache, "fixture", 1, 163); err != context.Canceled {
		t.Fatalf("revoked parent accepted: %v", err)
	}
}

func TestCompleteSubtitleCacheHasSharedByteBudget(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := &mediaInputCache{ctx: ctx}
	cache.rememberSubtitleWindow(subtitleWindowKey{"first", 1, -1}, strings.Repeat("a", 9<<20))
	cache.rememberSubtitleWindow(subtitleWindowKey{"second", 1, -1}, strings.Repeat("b", 9<<20))
	if len(cache.subtitleWindows) != 1 {
		t.Fatal("whole-track cache exceeded shared16MiB budget")
	}
	if _, exists := cache.cachedSubtitleWindow(subtitleWindowKey{"first", 1, -1}); exists {
		t.Fatal("old whole track not evicted")
	}
	cache.rememberSubtitleWindow(subtitleWindowKey{"oversized", 1, -1}, strings.Repeat("x", (16<<20)+1))
	if len(cache.subtitleWindows) != 1 {
		t.Fatal("oversized whole track accepted")
	}
}
