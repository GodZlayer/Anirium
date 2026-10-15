package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestSubtitleDeadlineStopsWaitingForUnavailableInput(t *testing.T) {
	generation, retire := context.WithCancel(context.Background())
	defer retire()
	cache := newMediaInputCache(generation, func(ctx context.Context, _ string, _ int) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	deadline, cancel := context.WithTimeout(generation, 20*time.Millisecond)
	defer cancel()
	_, err := extractCachedSubtitle(deadline, cache, "unavailable", 1)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("subtitle deadline not propagated: %v", err)
	}
}

func TestProbeDeadlineStopsWaitingForUnavailableInput(t *testing.T) {
	generation, cancelGeneration := context.WithCancel(context.Background())
	defer cancelGeneration()
	started := make(chan struct{})
	retired := make(chan struct{})
	cache := newMediaInputCache(generation, func(ctx context.Context, _ string, _ int) (string, error) {
		close(started)
		<-ctx.Done()
		close(retired)
		return "", ctx.Err()
	})
	deadline, cancelDeadline := context.WithTimeout(generation, 50*time.Millisecond)
	defer cancelDeadline()
	done := make(chan error, 1)
	go func() { _, err := probeCachedInput(deadline, cache, "unavailable"); done <- err }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("input acquisition did not begin")
	}
	select {
	case err := <-done:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("deadline not propagated: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("probe worker ignored deadline")
	}
	// A shared input may still serve other consumers; retirement cancels its
	// generation-owned loader rather than abandoning a goroutine.
	cancelGeneration()
	select {
	case <-retired:
	case <-time.After(time.Second):
		t.Fatal("input loader survived generation cancellation")
	}
}
