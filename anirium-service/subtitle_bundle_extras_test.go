package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSubtitleBundleDownloadsExternalsOnceWithTwoWorkers(t *testing.T) {
	var active, maximum, calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := active.Add(1)
		defer active.Add(-1)
		calls.Add(1)
		for old := maximum.Load(); n > old; old = maximum.Load() {
			if maximum.CompareAndSwap(old, n) {
				break
			}
		}
		select {
		case <-r.Context().Done():
			return
		case <-time.After(25 * time.Millisecond):
		}
		fmt.Fprint(w, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n")
	}))
	defer server.Close()
	allowLocalProviderForTest(t, server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	b := newMediaInputCache(ctx, nil).bundle()
	defer func() { cancel(); b.wait() }()
	swarmMu.Lock()
	old := externalSubtitles
	generation := playbackGeneration
	externalSubtitles = nil
	tracks := []SubtitleTrack{}
	for index := 0; index < 6; index++ {
		externalSubtitles = append(externalSubtitles, ProviderSubtitle{URL: fmt.Sprintf("%s/%d.vtt", server.URL, index), Format: "vtt", Language: "eng"})
		tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("external-%d-%d", generation, index), Language: "eng", StreamIndex: -1})
	}
	swarmMu.Unlock()
	defer func() { swarmMu.Lock(); externalSubtitles = old; swarmMu.Unlock() }()
	b.startExtras(tracks)
	b.startExtras(tracks)
	b.workers.Wait()
	if calls.Load() != 6 || maximum.Load() != 2 {
		t.Fatalf("calls=%d concurrency=%d", calls.Load(), maximum.Load())
	}
	for _, track := range b.snapshot(0, 0).Tracks {
		if !track.Complete || track.Status != "ready" || track.Alignment != "unverified" {
			t.Fatalf("external failed or guessed alignment: %+v", track)
		}
	}
}

func TestSubtitleExtrasPrioritizesPortugueseBeforeOtherLanguages(t *testing.T) {
	var (
		mu       sync.Mutex
		order    []string
		active   atomic.Int32
		maximum  atomic.Int32
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := active.Add(1)
		defer active.Add(-1)
		for old := maximum.Load(); n > old; old = maximum.Load() {
			if maximum.CompareAndSwap(old, n) {
				break
			}
		}
		mu.Lock()
		order = append(order, r.URL.Path)
		mu.Unlock()
		time.Sleep(15 * time.Millisecond)
		fmt.Fprint(w, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nLine\n")
	}))
	defer server.Close()
	allowLocalProviderForTest(t, server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	b := newMediaInputCache(ctx, nil).bundle()
	defer func() { cancel(); b.wait() }()

	langs := []string{"ara", "fra", "deu", "eng", "por", "ita"}
	swarmMu.Lock()
	old := externalSubtitles
	generation := playbackGeneration
	externalSubtitles = nil
	tracks := []SubtitleTrack{}
	for index, lang := range langs {
		externalSubtitles = append(externalSubtitles, ProviderSubtitle{URL: fmt.Sprintf("%s/%d.vtt", server.URL, index), Format: "vtt", Language: lang})
		tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("external-%d-%d", generation, index), Language: lang, StreamIndex: -1})
	}
	swarmMu.Unlock()
	defer func() { swarmMu.Lock(); externalSubtitles = old; swarmMu.Unlock() }()

	b.startExtras(tracks)
	b.workers.Wait()
	if maximum.Load() > 2 || len(order) != len(langs) {
		t.Fatalf("unexpected concurrency or count: max=%d order=%v", maximum.Load(), order)
	}
	firstTwo := map[string]bool{order[0]: true, order[1]: true}
	if !firstTwo["/4.vtt"] || !firstTwo["/3.vtt"] {
		t.Fatalf("expected por (/4.vtt) and eng (/3.vtt) first, got order=%v", order)
	}
}
