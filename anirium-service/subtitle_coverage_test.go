package main

import (
	"context"
	"testing"
)

func TestSubtitleCoverageCountsSuccessfulSilenceNotOtherTracks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := &mediaInputCache{ctx: ctx}
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "selected", stream: 2, start: 0}, "WEBVTT\n")
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "selected", stream: 2, start: 42}, "WEBVTT\n")
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "other", stream: 2, start: 87}, "WEBVTT\n")
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "selected", stream: 3, start: 87}, "WEBVTT\n")
	if got := cache.preparedSubtitleAhead("selected", 2, 45); got != 57 {
		t.Fatalf("quiet coverage: %v", got)
	}
	if got := cache.preparedSubtitleAhead("selected", 2, 102); got != 0 {
		t.Fatal("other track inflated coverage")
	}
	cancel()
	if cache.preparedSubtitleAhead("selected", 2, 0) != 0 {
		t.Fatal("revoked coverage accepted")
	}
}

func TestCompleteSubtitleCoverageSurvivesSeekAndRemainsTrackOwned(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := &mediaInputCache{ctx: ctx}
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "selected", stream: 2, start: -1}, "WEBVTT\n")
	for _, position := range []float64{0, 600, 1800} {
		if got := cache.preparedSubtitleAhead("selected", 2, position); got != 86400-position {
			t.Fatalf("complete quiet subtitle not available after seek: %v", got)
		}
	}
	if cache.preparedSubtitleAhead("other", 2, 600) != 0 || cache.preparedSubtitleAhead("selected", 3, 600) != 0 {
		t.Fatal("complete coverage leaked to another source or stream")
	}
	cancel()
	if cache.preparedSubtitleAhead("selected", 2, 600) != 0 {
		t.Fatal("complete subtitle survived revocation")
	}
}
