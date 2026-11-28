package main

import (
	"context"
	"crypto/sha256"
	"fmt"
	"sync"
	"time"
)

type subtitleCue struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}
type subtitlePart struct {
	Start    float64       `json:"start"`
	End      float64       `json:"end"`
	Cues     []subtitleCue `json:"cues"`
	Revision uint64        `json:"-"`
	Failed   bool          `json:"failed,omitempty"`
}
type bundledSubtitle struct {
	ID        string         `json:"id"`
	Language  string         `json:"language"`
	Title     string         `json:"title,omitempty"`
	Status    string         `json:"status"`
	Alignment string         `json:"alignment"`
	Complete  bool           `json:"complete"`
	Embedded  bool           `json:"embedded"`
	Parts     []subtitlePart `json:"parts"`
	track     SubtitleTrack
	revision  uint64
}
type subtitleBundleSnapshot struct {
	Version  int               `json:"version"`
	Epoch    uint64            `json:"epoch"`
	Revision uint64            `json:"revision"`
	Source   string            `json:"source"`
	Reset    bool              `json:"reset"`
	Tracks   []bundledSubtitle `json:"tracks"`
}
type subtitleBatchJob struct {
	done        chan struct{}
	start       float64
	epoch       uint64
	source      string
	tracks      []SubtitleTrack
	speculative bool
	err         error
}
type subtitleBundle struct {
	mu            sync.Mutex
	work          sync.Mutex
	cache         *mediaInputCache
	source        string
	epoch         uint64
	revision      uint64
	duration      float64
	tracks        map[string]*bundledSubtitle
	fastHeads     map[string][]subtitlePart
	fastFlights   map[string]chan struct{}
	extraPending  []*bundledSubtitle
	extraActive   int
	jobs          map[float64]*subtitleBatchJob
	running       *subtitleBatchJob
	cancel        context.CancelFunc
	externalSlots chan struct{}
	bytes         int
	legacyEpoch   uint64
	workers       sync.WaitGroup
	fastWorkers   sync.WaitGroup
	closed        bool
	budget        time.Duration
	history       map[string][]bundledSubtitle
	historyOrder  []string
	extract       func(context.Context, *mediaInputCache, string, []SubtitleTrack, float64) map[int]string
	extractSpan   func(context.Context, *mediaInputCache, string, []SubtitleTrack, float64, float64) map[int]string
}

func (cache *mediaInputCache) bundle() *subtitleBundle {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.subtitleBundle == nil {
		cache.subtitleBundle = &subtitleBundle{
			cache:         cache,
			tracks:        map[string]*bundledSubtitle{},
			fastHeads:     map[string][]subtitlePart{},
			fastFlights:   map[string]chan struct{}{},
			jobs:          map[float64]*subtitleBatchJob{},
			externalSlots: make(chan struct{}, 6),
			extract:       extractSubtitleBatch,
			extractSpan:   extractSubtitleSpan,
			budget:        90 * time.Second,
		}
	}
	return cache.subtitleBundle
}

func publicSubtitleSource(source string) string {
	if source == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(source))
	return fmt.Sprintf("subtitle-source-%x", sum[:12])
}

func (cache *mediaInputCache) existingBundle() *subtitleBundle {
	if cache == nil {
		return nil
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	return cache.subtitleBundle
}

func (b *subtitleBundle) wait() {
	b.mu.Lock()
	b.closed = true
	if b.cancel != nil {
		b.cancel()
	}
	b.mu.Unlock()
	b.workers.Wait()
	b.fastWorkers.Wait()
}
