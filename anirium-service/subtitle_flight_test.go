package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type subtitleWaitProbe struct {
	context.Context
	entered chan struct{}
	once    sync.Once
}

func (ctx *subtitleWaitProbe) Done() <-chan struct{} {
	ctx.once.Do(func() { close(ctx.entered) })
	return ctx.Context.Done()
}

func TestSubtitleFlightSurvivesCallerCancellationAndDeduplicates(t *testing.T) {
	parent, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(parent, nil, func(string) {})
	waiter, leave := context.WithCancel(parent)
	entered, finish := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	load := func(ctx context.Context) (string, error) {
		calls.Add(1)
		close(entered)
		select {
		case <-finish:
			return "WEBVTT\n", nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	key := subtitleWindowKey{"fixture", 1, 42}
	first := make(chan error, 1)
	go func() { _, err := cache.sharedSubtitleWindow(waiter, key, load); first <- err }()
	<-entered
	leave()
	if err := <-first; err != context.Canceled {
		t.Fatalf("caller cancellation: %v", err)
	}
	second := make(chan error, 1)
	probe := &subtitleWaitProbe{Context: parent, entered: make(chan struct{})}
	go func() {
		value, err := cache.sharedSubtitleWindow(probe, key, load)
		if err == nil && value != "WEBVTT\n" {
			err = errors.New("wrong result")
		}
		second <- err
	}()
	select {
	case <-probe.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("second caller did not join ongoing work")
	}
	close(finish)
	select {
	case err := <-second:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("joined extraction stuck")
	}
	if calls.Load() != 1 {
		t.Fatalf("duplicate work: %d", calls.Load())
	}
	cancel()
	if _, err := cache.sharedSubtitleWindow(context.Background(), key, load); err != context.Canceled {
		t.Fatal("revoked playback served result")
	}
}

func TestSubtitlePrefetchIsBoundedDeduplicatedAndRevoked(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil, func(string) {})
	entered := make(chan struct{}, 8)
	load := func(parent context.Context) (string, error) {
		entered <- struct{}{}
		<-parent.Done()
		return "", parent.Err()
	}
	for index := 0; index < 8; index++ {
		key := subtitleWindowKey{"fixture", 1, float64(index * 45)}
		if !cache.prefetchSubtitleWindow(key, load) {
			t.Fatal("prefetch not scheduled")
		}
		if cache.prefetchSubtitleWindow(key, load) {
			t.Fatal("duplicate prefetch scheduled")
		}
	}
	for index := 0; index < 8; index++ {
		select {
		case <-entered:
		case <-time.After(2 * time.Second):
			t.Fatal("worker not started")
		}
	}
	if cache.prefetchSubtitleWindow(subtitleWindowKey{"fixture", 2, 900}, load) {
		t.Fatal("unbounded pending work")
	}
	key := subtitleWindowKey{"fixture", 1, 0}
	cache.mu.Lock()
	flight := cache.subtitleFlights[key]
	cache.mu.Unlock()
	cancel()
	select {
	case <-flight.done:
	case <-time.After(2 * time.Second):
		t.Fatal("revoked prefetch worker survived")
	}
	if cache.prefetchSubtitleWindow(key, load) {
		t.Fatal("revoked playback scheduled work")
	}
	if _, ok := cache.cachedSubtitleWindow(key); ok {
		t.Fatal("canceled extraction cached")
	}
}

func TestNextSubtitleWindowMatchesBoundedCadence(t *testing.T) {
	for _, start := range []float64{0, 42, 87, 807} {
		next, ok := nextSubtitleWindow(start)
		expected := start + 45
		if start == 0 {
			expected = 42
		}
		if !ok || next != expected {
			t.Fatalf("cadence %v: %v %v", start, next, ok)
		}
	}
	for _, start := range []float64{-1, 8, 45, 86397} {
		if _, ok := nextSubtitleWindow(start); ok {
			t.Fatalf("unsupported cadence %v", start)
		}
	}
}

func TestSubtitleFlightFailureIsNotCachedAndCanRetry(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil, func(string) {})
	key := subtitleWindowKey{"fixture", 2, 87}
	_, err := cache.sharedSubtitleWindow(ctx, key, func(context.Context) (string, error) { return "partial", errors.New("fixture failure") })
	if err == nil {
		t.Fatal("partial failure served")
	}
	if _, ok := cache.cachedSubtitleWindow(key); ok {
		t.Fatal("failure cached")
	}
	value, err := cache.sharedSubtitleWindow(ctx, key, func(context.Context) (string, error) { return "WEBVTT\n", nil })
	if err != nil || value != "WEBVTT\n" {
		t.Fatalf("retry: %q %v", value, err)
	}
}
