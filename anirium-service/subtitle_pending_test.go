package main

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestCompleteSubtitleDeadlineDoesNotRestartOnPolling(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	key := subtitleWindowKey{source: "deadline-source", stream: 1, start: -1}
	var calls atomic.Int32
	load := func(context.Context) (string, error) {
		calls.Add(1)
		return "partial-output", context.DeadlineExceeded
	}
	for i := 0; i < 3; i++ {
		if _, err := cache.sharedSubtitleWindow(ctx, key, load); err != context.DeadlineExceeded {
			t.Fatalf("deadline not preserved: %v", err)
		}
	}
	if calls.Load() != 1 || cache.subtitlePreparationPending(key) || cache.preparedSubtitleAhead(key.source, key.stream, 0) != 0 {
		t.Fatal("terminal extraction restarted or partial output opened the buffer gate")
	}
	if cache.prefetchSubtitleWindow(key, load) {
		t.Fatal("prefetch restarted terminal extraction")
	}
}

func TestCompleteSubtitlePendingSurvivesShortObservation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	key := subtitleWindowKey{source: "slow-owned-source", stream: 1, start: -1}
	release := make(chan struct{})
	var calls atomic.Int32
	load := func(job context.Context) (string, error) {
		calls.Add(1)
		select {
		case <-job.Done():
			return "", job.Err()
		case <-release:
			return "WEBVTT\n\n00:01.000 --> 00:02.000\ncomplete\n", nil
		}
	}
	observation, stop := context.WithTimeout(ctx, 20*time.Millisecond)
	defer stop()
	if _, err := cache.sharedSubtitleWindow(observation, key, load); err != context.DeadlineExceeded {
		t.Fatalf("short observation: %v", err)
	}
	if !cache.subtitlePreparationPending(key) || cache.preparedSubtitleAhead(key.source, key.stream, 0) != 0 {
		t.Fatal("pending job lost ownership or falsely opened the playback gate")
	}
	result := make(chan error, 1)
	go func() {
		_, err := cache.sharedSubtitleWindow(ctx, key, load)
		result <- err
	}()
	close(release)
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("complete subtitle was not delivered")
	}
	if calls.Load() != 1 || cache.subtitlePreparationPending(key) || cache.preparedSubtitleAhead(key.source, key.stream, 0) != 86400 {
		t.Fatal("observation restarted extraction or completion was not published")
	}
	cancel()
	if cache.subtitlePreparationPending(key) || cache.preparedSubtitleAhead(key.source, key.stream, 0) != 0 {
		t.Fatal("retired playback retained subtitle readiness")
	}
}
