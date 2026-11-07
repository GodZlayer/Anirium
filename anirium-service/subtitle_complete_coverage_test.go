package main

import (
	"context"
	"fmt"
	"testing"
)

func TestCompleteSubtitleCoverageIsScopedBoundedAndRevoked(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := &mediaInputCache{ctx: ctx}
	if cache.hasCompleteSubtitle("external-1-0") {
		t.Fatal("inventory counted as prepared")
	}
	cache.rememberCompleteSubtitle("external-1-0")
	if !cache.hasCompleteSubtitle("external-1-0") || cache.hasCompleteSubtitle("external-2-0") {
		t.Fatal("coverage identity lost")
	}
	for i := 0; i < 64; i++ {
		cache.rememberCompleteSubtitle(fmt.Sprint("track-", i))
	}
	if cache.hasCompleteSubtitle("external-1-0") || len(cache.completeSubtitleTracks) != 64 {
		t.Fatal("unbounded coverage")
	}
	cancel()
	cache.rememberCompleteSubtitle("after-revocation")
	if cache.hasCompleteSubtitle("track-63") || cache.completeSubtitleTracks["after-revocation"] {
		t.Fatal("revoked coverage survives")
	}
}
