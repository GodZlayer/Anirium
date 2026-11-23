package main

import (
	"context"
	"sync/atomic"
	"testing"
)

func TestSubtitleBundleSeekPrioritizesTargetWithoutDiscardingCache(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	started := make(chan struct{})
	var active, max atomic.Int32
	b.extract = func(ctx context.Context, _ *mediaInputCache, _ string, _ []SubtitleTrack, start float64) map[int]string {
		n := active.Add(1)
		defer active.Add(-1)
		if n > max.Load() {
			max.Store(n)
		}
		if start == 60 {
			close(started)
			<-ctx.Done()
			return nil
		}
		return map[int]string{1: "WEBVTT\n\n", 2: "WEBVTT\n\n"}
	}
	first := b.schedule(0, false)
	<-first.done
	speculative := b.schedule(60, true)
	<-started
	target := b.schedule(120, false)
	<-target.done
	<-speculative.done
	if target.err != nil || speculative.err != context.Canceled || max.Load() != 1 {
		t.Fatal("seek did not prioritize within the single worker")
	}
	if b.schedule(0, false) != first {
		t.Fatal("seek discarded completed coverage")
	}
}
