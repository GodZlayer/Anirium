package main

import (
	"context"
	"os"
	"sync"
	"time"
)

type sharedInput struct {
	done  chan struct{}
	path  string
	err   error
	users int
}

type mediaInputCache struct {
	mu                               sync.Mutex
	ctx                              context.Context
	entries                          map[string]*sharedInput
	load                             func(context.Context, string, int) (string, error)
	remove                           func(string)
	waitRetired                      func()
	subtitleWindows                  map[subtitleWindowKey]string
	subtitleFlights                  map[subtitleWindowKey]*subtitleWindowFlight
	subtitleDeadlineFailures         map[subtitleWindowKey]error
	subtitleWindowOrder              []subtitleWindowKey
	completeSubtitleTracks           map[string]bool
	completeSubtitleOrder            []string
	externalSubtitleAlignmentSources map[string]string
}

// Explicit playback demand can retry terminal failures. Never evict a pending
// load or a usable shared input still owned by another media worker.
func (cache *mediaInputCache) retryFailed(sources []string) {
	if cache == nil {
		return
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	for _, source := range sources {
		entry := cache.entries[source]
		if entry == nil {
			continue
		}
		select {
		case <-entry.done:
			if entry.err != nil && entry.users == 0 && entry.path == "" {
				delete(cache.entries, source)
			}
		default:
		}
	}
}

func newMediaInputCache(ctx context.Context, load func(context.Context, string, int) (string, error), cleanup ...func(string)) *mediaInputCache {
	remove := func(path string) { _ = os.Remove(path) }
	if len(cleanup) > 0 {
		remove = cleanup[0]
	}
	cache := &mediaInputCache{ctx: ctx, entries: map[string]*sharedInput{}, load: load, remove: remove}
	context.AfterFunc(ctx, func() {
		cache.mu.Lock()
		defer cache.mu.Unlock()
		for _, entry := range cache.entries {
			if entry.users == 0 && entry.path != "" {
				cache.remove(entry.path)
			}
		}
	})
	return cache
}

func (cache *mediaInputCache) acquire(waiter context.Context, source string, index int) (string, func(), error) {
	cache.mu.Lock()
	entry, exists := cache.entries[source]
	if !exists {
		entry = &sharedInput{done: make(chan struct{})}
		cache.entries[source] = entry
		go func() {
			loadContext, cancel := context.WithTimeout(cache.ctx, 30*time.Minute)
			defer cancel()
			path, err := cache.load(loadContext, source, index)
			if err != nil && loadContext.Err() == nil {
				// Keep the retry inside the same shared entry: all consumers wait
				// for one recovery attempt instead of creating duplicate downloads.
				timer := time.NewTimer(time.Second)
				select {
				case <-loadContext.Done():
					timer.Stop()
					err = loadContext.Err()
				case <-timer.C:
					path, err = cache.load(loadContext, source, index)
				}
			}
			cache.mu.Lock()
			entry.path, entry.err = path, err
			if cache.ctx.Err() != nil && path != "" {
				cache.remove(path)
			}
			close(entry.done)
			cache.mu.Unlock()
		}()
	}
	cache.mu.Unlock()
	select {
	case <-waiter.Done():
		return "", nil, waiter.Err()
	case <-cache.ctx.Done():
		return "", nil, cache.ctx.Err()
	case <-entry.done:
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.ctx.Err() != nil {
		return "", nil, cache.ctx.Err()
	}
	if entry.err != nil {
		return "", nil, entry.err
	}
	entry.users++
	var once sync.Once
	release := func() {
		once.Do(func() {
			cache.mu.Lock()
			defer cache.mu.Unlock()
			entry.users--
			if cache.ctx.Err() != nil && entry.users == 0 && entry.path != "" {
				cache.remove(entry.path)
			}
		})
	}
	return entry.path, release, nil
}
