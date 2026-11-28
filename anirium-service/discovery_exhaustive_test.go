package main

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"

	"golang.org/x/time/rate"
)

func TestBuildRSSSearchQueriesExhaustive(t *testing.T) {
	q := PlaybackPrepareRequest{
		Title:           "Tank Chair",
		TitleEnglish:    "Tank Chair EN",
		TitleRomaji:     "Sensha Isu",
		TitleNative:     "戦車椅子",
		Aliases:         []string{"Alias One", "Alias Two", "Alias Three"},
		Season:          2,
		Episode:         3,
		AbsoluteEpisode: 15,
	}

	got := buildRSSSearchQueries(q)
	// 7 unique titles * 3 numbering formats ("03", "S02E03", "15") = 21 queries
	if len(got) != 21 {
		t.Fatalf("expected 21 exhaustive queries, got %d: %v", len(got), got)
	}

	wantSamples := []string{
		"Tank Chair 03",
		"Tank Chair S02E03",
		"Tank Chair 15",
		"戦車椅子 S02E03",
		"Alias Three 15",
	}
	set := make(map[string]bool, len(got))
	for _, s := range got {
		set[s] = true
	}
	for _, w := range wantSamples {
		if !set[w] {
			t.Errorf("expected query %q in exhaustive list, got %v", w, got)
		}
	}
}

func TestUploadRateLimitScaling(t *testing.T) {
	defer updateUploadRateLimit(1)

	updateUploadRateLimit(0)
	if torrentUploadRateLimiter.Limit() != rate.Limit(100*1024) {
		t.Fatalf("expected 0 players to floor at 100KB/s, got %v", torrentUploadRateLimiter.Limit())
	}

	updateUploadRateLimit(3)
	if torrentUploadRateLimiter.Limit() != rate.Limit(300*1024) {
		t.Fatalf("expected 3 players to scale to 300KB/s, got %v", torrentUploadRateLimiter.Limit())
	}
	if torrentUploadRateLimiter.Burst() != 3*32*1024 {
		t.Fatalf("expected 3 players burst to be 96KB, got %d", torrentUploadRateLimiter.Burst())
	}
}

func TestProbeSourcesNoCap(t *testing.T) {
	sources := make([]string, 15)
	for i := range sources {
		sources[i] = fmt.Sprintf("magnet:?xt=urn:btih:%040d", i+1)
	}
	var probed atomic.Int32
	probeSources(context.Background(), sources, func(string) {
		probed.Add(1)
	})
	if probed.Load() != 15 {
		t.Fatalf("expected all 15 sources to be probed without 8-source cap, got %d", probed.Load())
	}
}
