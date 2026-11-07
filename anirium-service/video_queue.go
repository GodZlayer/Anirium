package main

import (
	"context"
	"sync"
)

type queuedVideo struct {
	ctx     context.Context
	quality string
	done    chan struct{}
	granted bool
}

var videoQueue = struct {
	sync.Mutex
	jobs      []*queuedVideo
	preferred string
	running   bool
	wake      chan struct{}
}{wake: make(chan struct{}, 1)}

func wakeVideoQueue() {
	select {
	case videoQueue.wake <- struct{}{}:
	default:
	}
}

func preferVideoQuality(quality string) {
	videoQueue.Lock()
	videoQueue.preferred = quality
	videoQueue.Unlock()
	wakeVideoQueue()
}

func runQueuedVideoInput(ctx context.Context, quality string, work func() error) error {
	release, err := acquireVideoSlot(ctx, quality)
	if err != nil {
		return err
	}
	defer release()
	if err := ctx.Err(); err != nil {
		return err
	}
	return work()
}

func acquireVideoSlot(ctx context.Context, quality string) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	job := &queuedVideo{ctx: ctx, quality: quality, done: make(chan struct{})}
	videoQueue.Lock()
	videoQueue.jobs = append(videoQueue.jobs, job)
	if !videoQueue.running {
		videoQueue.running = true
		go dispatchVideoQueue()
	}
	videoQueue.Unlock()
	stop := context.AfterFunc(ctx, wakeVideoQueue)
	defer stop()
	select {
	case <-job.done:
	case <-ctx.Done():
	}
	videoQueue.Lock()
	granted := job.granted
	err := ctx.Err()
	videoQueue.Unlock()
	if err != nil {
		if granted {
			<-videoTranscodeSlots
		}
		wakeVideoQueue()
		return nil, err
	}
	var once sync.Once
	return func() { once.Do(func() { <-videoTranscodeSlots; wakeVideoQueue() }) }, nil
}

func dispatchVideoQueue() {
	for {
		videoQueue.Lock()
		live := videoQueue.jobs[:0]
		for _, job := range videoQueue.jobs {
			if job.ctx.Err() == nil {
				live = append(live, job)
			}
		}
		videoQueue.jobs = live
		if len(live) == 0 {
			videoQueue.running = false
			videoQueue.Unlock()
			return
		}
		videoQueue.Unlock()
		select {
		case videoTranscodeSlots <- struct{}{}:
		case <-videoQueue.wake:
			continue
		}
		videoQueue.Lock()
		index := -1
		for i, job := range videoQueue.jobs {
			if job.ctx.Err() != nil {
				continue
			}
			if index < 0 {
				index = i
			}
			if job.quality == videoQueue.preferred {
				index = i
				break
			}
		}
		if index < 0 {
			videoQueue.Unlock()
			<-videoTranscodeSlots
			continue
		}
		job := videoQueue.jobs[index]
		videoQueue.jobs = append(videoQueue.jobs[:index], videoQueue.jobs[index+1:]...)
		job.granted = true
		close(job.done)
		videoQueue.Unlock()
	}
}
