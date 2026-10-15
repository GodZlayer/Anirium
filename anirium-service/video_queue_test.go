package main

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestQueuedVideoDoesNotAcquireInputBeforeSlot(t *testing.T) {
	oldSlots := videoTranscodeSlots
	videoTranscodeSlots = make(chan struct{}, 1)
	videoTranscodeSlots <- struct{}{}
	defer func() {
		<-videoTranscodeSlots
		wakeVideoQueue()
		deadline := time.Now().Add(3 * time.Second)
		for {
			videoQueue.Lock()
			running := videoQueue.running
			videoQueue.Unlock()
			if !running {
				break
			}
			if time.Now().After(deadline) {
				t.Fatal("queue dispatcher did not retire")
			}
			time.Sleep(time.Millisecond)
		}
		videoTranscodeSlots = oldSlots
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	err := runQueuedVideoInput(ctx, "720p", func() error {
		t.Fatal("queued alternative acquired input before capacity")
		return nil
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("queued input ignored cancellation: %v", err)
	}
}

func TestSelectedVideoQualityGetsNextAvailableSlot(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	oldSlots := videoTranscodeSlots
	videoTranscodeSlots = make(chan struct{}, 1)
	videoTranscodeSlots <- struct{}{}
	var workers sync.WaitGroup
	defer func() { cancel(); workers.Wait(); videoTranscodeSlots = oldSlots }()
	acquired := make(chan string, 2)
	release := make(chan struct{})
	for _, quality := range []string{"480p", "1080p"} {
		workers.Add(1)
		go func() {
			defer workers.Done()
			free, err := acquireVideoSlot(ctx, quality)
			if err != nil {
				return
			}
			defer free()
			acquired <- quality
			select {
			case <-release:
			case <-ctx.Done():
			}
		}()
	}
	for {
		videoQueue.Lock()
		queued := len(videoQueue.jobs)
		videoQueue.Unlock()
		if queued == 2 {
			break
		}
		if ctx.Err() != nil {
			t.Fatal("jobs were not queued")
		}
		time.Sleep(time.Millisecond)
	}
	preferVideoQuality("1080p")
	<-videoTranscodeSlots
	select {
	case quality := <-acquired:
		if quality != "1080p" {
			t.Fatalf("selected quality did not get priority: %s", quality)
		}
	case <-ctx.Done():
		t.Fatal("selected quality remained blocked")
	}
	close(release)
	select {
	case quality := <-acquired:
		if quality != "480p" {
			t.Fatal("remaining job lost")
		}
	case <-ctx.Done():
		t.Fatal("remaining job did not resume")
	}
	workers.Wait()
}

func TestCanceledPreferredVideoDoesNotBlockLiveQuality(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	oldSlots := videoTranscodeSlots
	videoTranscodeSlots = make(chan struct{}, 1)
	videoTranscodeSlots <- struct{}{}
	var workers sync.WaitGroup
	defer func() { cancel(); workers.Wait(); videoTranscodeSlots = oldSlots }()
	preferred, stopPreferred := context.WithCancel(ctx)
	defer stopPreferred()
	preferVideoQuality("1080p")
	results := make(chan string, 2)
	for _, job := range []struct {
		ctx     context.Context
		quality string
	}{{preferred, "1080p"}, {ctx, "480p"}} {
		workers.Add(1)
		go func() {
			defer workers.Done()
			free, err := acquireVideoSlot(job.ctx, job.quality)
			if err != nil {
				results <- "canceled"
				return
			}
			defer free()
			results <- job.quality
		}()
	}
	for {
		videoQueue.Lock()
		queued := len(videoQueue.jobs)
		videoQueue.Unlock()
		if queued == 2 {
			break
		}
		if ctx.Err() != nil {
			t.Fatal("workers did not enter queue")
		}
		time.Sleep(time.Millisecond)
	}
	stopPreferred()
	select {
	case result := <-results:
		if result != "canceled" {
			t.Fatalf("canceled job started: %s", result)
		}
	case <-ctx.Done():
		t.Fatal("cancellation blocked")
	}
	<-videoTranscodeSlots
	select {
	case result := <-results:
		if result != "480p" {
			t.Fatalf("live quality lost: %s", result)
		}
	case <-ctx.Done():
		t.Fatal("live quality blocked by canceled preference")
	}
}
