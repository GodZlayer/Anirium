package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestWSSeekReusesRetainedContinuousTimelineAndReportsTimelineStart(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	rootCtx, rootCancel := context.WithCancel(ctx)
	curCtx, curCancel := context.WithCancel(ctx)

	swarmMu.Lock()
	oldContext := playbackContext
	oldGeneration := playbackGeneration
	oldDiscovery := playbackDiscoveryComplete
	oldQualities := currentMixQualities
	oldCandidates := selectedAudioCandidates
	oldLinks := activeLinks
	oldFormats := probedFormats
	oldStreams := probedStreams
	oldSidecars := probedSidecars
	oldExternal := externalSubtitles
	oldInputs := playbackInputs
	oldSession := currentPlaybackSession
	oldCurrent := currentPlaybackWindow
	oldPrefetch := prefetchedPlaybackWindow
	oldRetained := retainedPlaybackWindows
	oldPrepStarted := sessionPreparationStarted
	oldShuttingDown := playbackShuttingDown

	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{
		"window-9-2-video": {
			MixVariant: MixVariant{
				ID:          "window-9-2-video",
				Quality:     "1080p",
				Status:      "ready",
				PlaylistURL: "/hls/window-9-2-video/master.m3u8",
			},
		},
	}
	variantMu.Unlock()

	playbackContext = ctx
	playbackGeneration = 9
	playbackDiscoveryComplete = true
	playbackShuttingDown = false
	sessionPreparationStarted = true
	currentMixQualities = []string{"1080p"}
	selectedAudioCandidates = []AudioCandidate{{Language: "jpn"}}
	activeLinks = nil
	probedFormats = map[string]ffprobeOutput{}
	probedStreams = map[string][]ffprobeStream{}
	probedSidecars = map[string][]string{}
	externalSubtitles = nil
	playbackInputs = nil
	currentPlaybackSession = playbackSessionState{
		Generation:    9,
		Revision:      1,
		Quality:       "1080p",
		Audio:         "jpn",
		Position:      120,
		Playing:       true,
		BufferSeconds: 30,
	}

	rootWin := &playbackWindow{
		ID:                    "window-9-1",
		timelineID:            "window-9-1",
		Start:                 0,
		Duration:              24,
		DeliveredDuration:     24,
		TimelineStart:         0,
		Quality:               "1080p",
		Audio:                 "jpn",
		Status:                "ready",
		PlaylistURL:           "/hls/window-9-1-video/master.m3u8",
		ContinuousPlaylistURL: "/hls/window-9-1-video/continuous-master.m3u8",
		ctx:                   rootCtx,
		cancel:                rootCancel,
	}
	curWin := &playbackWindow{
		ID:                    "window-9-2",
		timelineID:            "window-9-1",
		Start:                 120,
		Duration:              24,
		DeliveredDuration:     24,
		TimelineStart:         0,
		Quality:               "1080p",
		Audio:                 "jpn",
		Status:                "ready",
		PlaylistURL:           "/hls/window-9-2-video/master.m3u8",
		ContinuousPlaylistURL: "/hls/window-9-1-video/continuous-master.m3u8",
		AudioTracks: []AudioTrack{
			{ID: "window-9-2-audio-0", Language: "jpn", Status: "ready", PlaylistURL: "/hls/window-9-2-audio-0/index.m3u8"},
		},
		ctx:    curCtx,
		cancel: curCancel,
	}
	retainedPlaybackWindows = []*playbackWindow{rootWin}
	currentPlaybackWindow = curWin
	prefetchedPlaybackWindow = nil
	swarmMu.Unlock()

	defer func() {
		swarmMu.Lock()
		playbackContext = oldContext
		playbackGeneration = oldGeneration
		playbackDiscoveryComplete = oldDiscovery
		currentMixQualities = oldQualities
		selectedAudioCandidates = oldCandidates
		activeLinks = oldLinks
		probedFormats = oldFormats
		probedStreams = oldStreams
		probedSidecars = oldSidecars
		externalSubtitles = oldExternal
		playbackInputs = oldInputs
		currentPlaybackSession = oldSession
		currentPlaybackWindow = oldCurrent
		prefetchedPlaybackWindow = oldPrefetch
		retainedPlaybackWindows = oldRetained
		sessionPreparationStarted = oldPrepStarted
		playbackShuttingDown = oldShuttingDown
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()

	client := &wsClient{send: make(chan []byte, 8)}
	client.handleCommand(map[string]interface{}{
		"action":   "seek",
		"quality":  "1080p",
		"audio":    "jpn",
		"subtitle": "stale-nonexistent-id",
		"position": float64(0),
	})

	swarmMu.RLock()
	rootCanceled := rootWin.ctx.Err() != nil
	curCanceled := curWin.ctx.Err() != nil
	sessionPos := currentPlaybackSession.Position
	sessionSub := currentPlaybackSession.Subtitle
	retainedLen := len(retainedPlaybackWindows)
	swarmMu.RUnlock()

	if rootCanceled || curCanceled || retainedLen != 1 {
		t.Fatalf("retained continuous windows were unexpectedly cancelled/cleared: rootCanceled=%v curCanceled=%v retained=%d", rootCanceled, curCanceled, retainedLen)
	}
	if sessionPos != 0 || sessionSub != "" {
		t.Fatalf("unexpected session state after seek with stale subtitle: pos=%v sub=%q", sessionPos, sessionSub)
	}

	var requestedPayload map[string]interface{}
	var readyPayload map[string]interface{}
	for len(client.send) > 0 {
		raw := <-client.send
		var envelope struct {
			Event   string                 `json:"event"`
			Payload map[string]interface{} `json:"payload"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			t.Fatalf("invalid ws message: %v", err)
		}
		switch envelope.Event {
		case "window_requested":
			requestedPayload = envelope.Payload
		case "window_ready":
			readyPayload = envelope.Payload
		}
	}

	if requestedPayload == nil || requestedPayload["accepted"] != true || requestedPayload["reusedTimeline"] != true {
		t.Fatalf("expected accepted reused window_requested event, got %+v", requestedPayload)
	}
	if readyPayload == nil {
		t.Fatal("expected immediate window_ready event for reused continuous timeline")
	}
	if readyPayload["timelineStart"] != float64(0) || readyPayload["cachedEnd"] != float64(144) || readyPayload["start"] != float64(0) {
		t.Fatalf("unexpected timeline bounds in window_ready: %+v", readyPayload)
	}
	if readyPayload["continuousPlaylistUrl"] != "/hls/window-9-1-video/continuous-master.m3u8" || readyPayload["reusedTimeline"] != true {
		t.Fatalf("unexpected playlist or reuse flag in window_ready: %+v", readyPayload)
	}

	manifest := buildCurrentManifest()
	if len(manifest.Variants) != 1 {
		t.Fatalf("expected 1 manifest variant, got %d", len(manifest.Variants))
	}
	v := manifest.Variants[0]
	if v.PlaylistURL != "/hls/window-9-2-video/master.m3u8" || v.ContinuousPlaylistURL != "/hls/window-9-1-video/continuous-master.m3u8" || v.TimelineStart != 0 {
		t.Fatalf("manifest variant missing continuous metadata: %+v", v)
	}
}

func TestPartialSubtitleRecoveryNotCachedAndCORSHeadersExposed(t *testing.T) {
	corsResp := httptest.NewRecorder()
	enableCORS(corsResp)
	exposed := corsResp.Header().Get("Access-Control-Expose-Headers")
	for _, header := range []string{
		"X-Anirium-Subtitle-Partial",
		"X-Anirium-Subtitle-Coverage-End",
		"X-Anirium-Subtitle-Complete",
		"X-Anirium-Subtitle-Offset",
		"X-Anirium-Subtitle-Alignment",
	} {
		if !strings.Contains(exposed, header) {
			t.Fatalf("CORS exposed headers %q missing %s", exposed, header)
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	key := subtitleWindowKey{source: "partial-fixture", stream: 1, start: 60}

	var calls atomic.Int32
	partialVTT := "WEBVTT\n\n00:01.000 --> 00:02.000\nPartial cue\n"
	fullVTT := "WEBVTT\n\n00:01.000 --> 00:02.000\nPartial cue\n\n00:40.000 --> 00:42.000\nLate cue\n"

	got, err := cache.sharedSubtitleWindow(ctx, key, func(context.Context) (string, error) {
		calls.Add(1)
		return partialVTT, &partialSubtitleError{content: partialVTT}
	})
	var partialErr *partialSubtitleError
	if !errors.As(err, &partialErr) || got != partialVTT {
		t.Fatalf("expected partialSubtitleError with content, got %q err=%v", got, err)
	}
	if _, cached := cache.cachedSubtitleWindow(key); cached {
		t.Fatal("partial recovered subtitle was wrongly cached as complete 60s block")
	}

	gotFull, fullErr := cache.sharedSubtitleWindow(ctx, key, func(context.Context) (string, error) {
		calls.Add(1)
		return fullVTT, nil
	})
	if fullErr != nil || gotFull != fullVTT {
		t.Fatalf("expected full VTT after non-cached partial, got %q err=%v", gotFull, fullErr)
	}
	if cached, ok := cache.cachedSubtitleWindow(key); !ok || cached != fullVTT {
		t.Fatal("complete full VTT was not cached")
	}
	if calls.Load() != 2 {
		t.Fatalf("expected loader to run twice (partial then full), ran %d times", calls.Load())
	}

	// Ensure serveBundledSubtitle allows on-demand fallback (returns false) for a previously
	// failed embedded block when fast=1 or start>=0 in runtime mode (ANIRIUM_E2E_CHILD != "1"),
	// and serves fastHeadFor when available.
	b := cache.bundle()
	track := SubtitleTrack{ID: "failed-embedded", Source: "private-src", StreamIndex: 2, Language: "por"}
	b.configure("private-src", []SubtitleTrack{track}, 300)
	b.mu.Lock()
	b.tracks[track.ID].Parts = []subtitlePart{{Start: 120, End: 180, Failed: true}}
	b.tracks[track.ID].Status = "failed"
	b.mu.Unlock()

	fallbackResp := httptest.NewRecorder()
	fallbackReq := httptest.NewRequest("GET", "/subtitles?trackId=failed-embedded&start=120", nil)
	if serveBundledSubtitle(fallbackResp, fallbackReq, cache, track.ID) {
		t.Fatalf("expected false fallback on previously failed embedded block, got handled status=%d", fallbackResp.Code)
	}

	b.recordFastHead(track.ID, 120, 136, "WEBVTT\n\n00:02.000 --> 00:04.000\nFast slice\n")
	fastHeadResp := httptest.NewRecorder()
	fastHeadReq := httptest.NewRequest("GET", "/subtitles?trackId=failed-embedded&start=120&fast=1&at=120", nil)
	if !serveBundledSubtitle(fastHeadResp, fastHeadReq, cache, track.ID) || fastHeadResp.Code != 200 || !strings.Contains(fastHeadResp.Body.String(), "Fast slice") {
		t.Fatalf("expected fast head to serve on previously failed block, code=%d body=%s", fastHeadResp.Code, fastHeadResp.Body.String())
	}
}

func TestActiveContinuousWindowBoundsKeepsTimelineStartAfterPrefixEviction(t *testing.T) {
	swarmMu.Lock()
	oldGeneration := playbackGeneration
	oldCurrent := currentPlaybackWindow
	oldPrefetch := prefetchedPlaybackWindow
	oldRetained := retainedPlaybackWindows
	oldSession := currentPlaybackSession

	playbackGeneration = 9
	currentPlaybackSession = playbackSessionState{
		Generation: 9,
		Quality:    "1080p",
		Audio:      "jpn",
		Position:   128,
		Playing:    true,
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Simulates rootWin (0..120) evicted by trimConsumedWindowCacheLocked after reaching 512MB,
	// leaving curWin (Start: 120, TimelineStart: 0) as the only active window.
	curWin := &playbackWindow{
		ID:                    "window-9-9",
		timelineID:            "window-9-1",
		Start:                 120,
		Duration:              24,
		DeliveredDuration:     24,
		TimelineStart:         0,
		Quality:               "1080p",
		Audio:                 "jpn",
		Status:                "ready",
		PlaylistURL:           "/hls/window-9-9-video/master.m3u8",
		ContinuousPlaylistURL: "/hls/window-9-1-video/continuous-master.m3u8",
		ctx:                   ctx,
		cancel:                cancel,
	}
	retainedPlaybackWindows = nil
	currentPlaybackWindow = curWin
	prefetchedPlaybackWindow = nil

	timelineStart, minRetained, cachedEnd, ok := activeContinuousWindowRangeLocked()
	bStart, bEnd, bOk := activeContinuousWindowBoundsLocked()
	swarmMu.Unlock()

	defer func() {
		swarmMu.Lock()
		playbackGeneration = oldGeneration
		currentPlaybackWindow = oldCurrent
		prefetchedPlaybackWindow = oldPrefetch
		retainedPlaybackWindows = oldRetained
		currentPlaybackSession = oldSession
		swarmMu.Unlock()
	}()

	if !ok || !bOk {
		t.Fatalf("expected activeContinuousWindowRangeLocked/BoundsLocked ok=true, got ok=%v bOk=%v", ok, bOk)
	}
	if timelineStart != 0 || bStart != 0 {
		t.Fatalf("expected timelineStart=0 after prefix eviction so subtitle clock never drifts, got range=%v bounds=%v", timelineStart, bStart)
	}
	if minRetained != 120 {
		t.Fatalf("expected minRetained=120 for evicted prefix boundary, got %v", minRetained)
	}
	if cachedEnd != 144 || bEnd != 144 {
		t.Fatalf("expected cachedEnd=144, got range=%v bounds=%v", cachedEnd, bEnd)
	}

	payload := buildTelemetrySnapshotPayload()
	if payload["timelineStart"] != float64(0) {
		t.Fatalf("expected telemetry timelineStart=0, got %v", payload["timelineStart"])
	}
	if payload["minRetainedStart"] != float64(120) {
		t.Fatalf("expected telemetry minRetainedStart=120, got %v", payload["minRetainedStart"])
	}
}

