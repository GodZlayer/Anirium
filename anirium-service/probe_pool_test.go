package main

import (
	"context"
	"fmt"
	"sync"
	"testing"
)

func TestProbePoolProcessesEverySourceWithinWorkerLimit(t *testing.T) {
	sources := []string{}
	for index := 0; index < 70; index++ {
		sources = append(sources, fmt.Sprint(index))
	}
	var mu sync.Mutex
	seen := map[string]int{}
	active, maxActive := 0, 0
	probeSources(context.Background(), sources, func(source string) {
		mu.Lock()
		active++
		if active > maxActive {
			maxActive = active
		}
		seen[source]++
		mu.Unlock()
		mu.Lock()
		active--
		mu.Unlock()
	})
	if maxActive > 4 || len(seen) != 70 {
		t.Fatalf("workers=%d sources=%d", maxActive, len(seen))
	}
	for source, count := range seen {
		if count != 1 {
			t.Fatalf("source %s probed %d times", source, count)
		}
	}
}

func TestProbePoolSkipsCancelledPlayback(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	probeSources(ctx, []string{"old"}, func(string) { t.Error("cancelled playback was probed") })
}
