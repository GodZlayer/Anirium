package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
)

// Only successfully cached bounded extractions count; an in-flight job or the
// last dialogue timestamp does not prove coverage. Source/stream stay private.
func (cache *mediaInputCache) preparedSubtitleAhead(source string, stream int, position float64) float64 {
	if cache == nil {
		return 0
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.ctx.Err() != nil {
		return 0
	}
	if !isFiniteWindowPosition(position) {
		return 0
	}
	if _, complete := cache.subtitleWindows[subtitleWindowKey{source: source, stream: stream, start: -1}]; complete {
		return 86400 - position
	}
	intervals := []preparedPlaybackInterval{}
	for key := range cache.subtitleWindows {
		if key.source == source && key.stream == stream && key.start >= 0 && key.start <= 86340 {
			intervals = append(intervals, preparedPlaybackInterval{Start: key.start, End: key.start + 60})
		}
	}
	sort.Slice(intervals, func(i, j int) bool { return intervals[i].Start < intervals[j].Start })
	return preparedPlaybackAhead(intervals, position)
}

type subtitleWindowFlight struct {
	done  chan struct{}
	value string
	err   error
}

func (cache *mediaInputCache) subtitlePreparationPending(key subtitleWindowKey) bool {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	return cache.ctx.Err() == nil && cache.subtitleFlights[key] != nil
}

// The playback owns extraction, while each HTTP request owns only its wait.
// Leaving a window must not cancel an identical extraction another caller needs.
func (cache *mediaInputCache) sharedSubtitleWindow(waiter context.Context, key subtitleWindowKey, load func(context.Context) (string, error)) (string, error) {
	if err := waiter.Err(); err != nil {
		return "", err
	}
	cache.mu.Lock()
	if err := cache.ctx.Err(); err != nil {
		cache.mu.Unlock()
		return "", err
	}
	if value, ok := cache.subtitleWindows[key]; ok {
		cache.mu.Unlock()
		if err := waiter.Err(); err != nil {
			return "", err
		}
		if err := cache.ctx.Err(); err != nil {
			return "", err
		}
		appendLog(fmt.Sprintf("Subtitle window outcome=cached stream=%d window_start=%.3f", key.stream, key.start))
		return value, nil
	}
	flight := cache.subtitleFlights[key]
	if failure := cache.subtitleDeadlineFailures[key]; failure != nil {
		cache.mu.Unlock()
		return "", failure
	}
	if flight == nil {
		var err error
		flight, err = cache.startSubtitleWindowLocked(key, load)
		if err != nil {
			cache.mu.Unlock()
			return "", err
		}
	} else {
		appendLog(fmt.Sprintf("Subtitle window outcome=joined stream=%d window_start=%.3f", key.stream, key.start))
	}
	cache.mu.Unlock()
	select {
	case <-waiter.Done():
		return "", waiter.Err()
	case <-cache.ctx.Done():
		return "", cache.ctx.Err()
	case <-flight.done:
		if err := waiter.Err(); err != nil {
			return "", err
		}
		if err := cache.ctx.Err(); err != nil {
			return "", err
		}
		return flight.value, flight.err
	}
}

// Caller holds cache.mu. One bounded worker owns each source/stream/window.
func (cache *mediaInputCache) startSubtitleWindowLocked(key subtitleWindowKey, load func(context.Context) (string, error)) (*subtitleWindowFlight, error) {
	if len(cache.subtitleFlights) >= 8 {
		return nil, fmt.Errorf("subtitle extraction capacity reached")
	}
	if cache.subtitleFlights == nil {
		cache.subtitleFlights = make(map[subtitleWindowKey]*subtitleWindowFlight)
	}
	flight := &subtitleWindowFlight{done: make(chan struct{})}
	cache.subtitleFlights[key] = flight
	go func() {
		value, err := load(cache.ctx)
		if err == nil {
			cache.rememberSubtitleWindow(key, value)
		}
		cache.mu.Lock()
		flight.value, flight.err = value, err
		if key.start == -1 && errors.Is(err, context.DeadlineExceeded) && cache.ctx.Err() == nil {
			if cache.subtitleDeadlineFailures == nil {
				cache.subtitleDeadlineFailures = make(map[subtitleWindowKey]error)
			}
			if len(cache.subtitleDeadlineFailures) < 64 {
				cache.subtitleDeadlineFailures[key] = err
			}
		}
		delete(cache.subtitleFlights, key)
		close(flight.done)
		cache.mu.Unlock()
	}()
	return flight, nil
}

// Speculation never spawns waiter goroutines and never evicts active work.
func (cache *mediaInputCache) prefetchSubtitleWindow(key subtitleWindowKey, load func(context.Context) (string, error)) bool {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.ctx.Err() != nil {
		return false
	}
	if _, exists := cache.subtitleWindows[key]; exists {
		return false
	}
	if cache.subtitleFlights[key] != nil {
		return false
	}
	if cache.subtitleDeadlineFailures[key] != nil {
		return false
	}
	_, err := cache.startSubtitleWindowLocked(key, load)
	return err == nil
}

// The official bounded-client cadence overlaps windows by three seconds.
// Other clients may request arbitrary positions; do not guess their cadence.
func nextSubtitleWindow(start float64) (float64, bool) {
	if start == 0 {
		return 42, true
	}
	if start < 0 || start > 86355 || math.IsNaN(start) || math.IsInf(start, 0) {
		return 0, false
	}
	step := (start + 3) / 45
	if math.Abs(step-math.Round(step)) > 0.000001 {
		return 0, false
	}
	return start + 45, true
}

// Cached conversions belong to one playback input cache, never a global account
// cache. Only successful, complete bounded responses are eligible.
type subtitleWindowKey struct {
	source string
	stream int
	start  float64
}

func (cache *mediaInputCache) cachedSubtitleWindow(key subtitleWindowKey) (string, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.ctx.Err() != nil {
		return "", false
	}
	value, exists := cache.subtitleWindows[key]
	return value, exists
}

func (cache *mediaInputCache) rememberSubtitleWindow(key subtitleWindowKey, value string) {
	// -1 identifies a complete track. Keep a shared byte budget so complete
	// tracks can be cached without multiplying a large payload by 64 entries.
	const maxBytes = 16 << 20
	if key.start < -1 || len(value) > maxBytes || (key.start >= 0 && len(value) > 512<<10) {
		return
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.ctx.Err() != nil {
		return
	}
	if cache.subtitleWindows == nil {
		cache.subtitleWindows = make(map[subtitleWindowKey]string)
	}
	if _, exists := cache.subtitleWindows[key]; exists {
		return
	}
	const maxWindows = 64
	bytes := len(value)
	for _, content := range cache.subtitleWindows {
		bytes += len(content)
	}
	for len(cache.subtitleWindowOrder) > 0 && (len(cache.subtitleWindowOrder) >= maxWindows || bytes > maxBytes) {
		bytes -= len(cache.subtitleWindows[cache.subtitleWindowOrder[0]])
		delete(cache.subtitleWindows, cache.subtitleWindowOrder[0])
		cache.subtitleWindowOrder = cache.subtitleWindowOrder[1:]
	}
	cache.subtitleWindows[key] = value
	cache.subtitleWindowOrder = append(cache.subtitleWindowOrder, key)
}
