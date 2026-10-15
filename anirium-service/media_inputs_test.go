package main

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

func TestMediaWorkersShareOneOwnedInput(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	path := filepath.Join(t.TempDir(), "owned-video")
	var calls atomic.Int32
	cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) {
		calls.Add(1)
		return path, os.WriteFile(path, []byte("fixture"), 0600)
	})
	var workers sync.WaitGroup
	releases := make(chan func(), 8)
	for index := 0; index < 8; index++ {
		workers.Add(1)
		go func(index int) {
			defer workers.Done()
			actual, release, err := cache.acquire(ctx, "same-source", index)
			if err != nil || actual != path {
				t.Errorf("input: %s %v", actual, err)
				return
			}
			releases <- release
		}(index)
	}
	workers.Wait()
	if calls.Load() != 1 {
		t.Fatalf("source copied %d times", calls.Load())
	}
	cancel()
	if _, err := os.Stat(path); err != nil {
		t.Fatal("active workers lost their input")
	}
	close(releases)
	for release := range releases {
		release()
		release()
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("canceled unreferenced input was not removed")
	}
}

func TestCanceledWaiterDoesNotCancelSharedDownload(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ready := make(chan struct{})
	path := filepath.Join(t.TempDir(), "fixture-path")
	cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) { <-ready; return path, nil })
	waiter, cancelWaiter := context.WithCancel(ctx)
	cancelWaiter()
	if _, _, err := cache.acquire(waiter, "source", 0); err == nil {
		t.Fatal("canceled waiter accepted")
	}
	close(ready)
	_, release, err := cache.acquire(ctx, "source", 0)
	if err != nil {
		t.Fatal(err)
	}
	release()
}
