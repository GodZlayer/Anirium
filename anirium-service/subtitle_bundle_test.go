package main

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func testSubtitleBundle(t *testing.T) (*subtitleBundle, context.Context, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	b := newMediaInputCache(ctx, nil).bundle()
	t.Cleanup(func() { cancel(); b.wait() })
	b.configure("private-source", []SubtitleTrack{{ID: "english", Source: "private-source", StreamIndex: 1, Language: "eng"}, {ID: "portuguese", Source: "private-source", StreamIndex: 2, Language: "por"}}, 180)
	return b, ctx, cancel
}

func TestSubtitleBundleDeduplicatesBatchAndReportsSilence(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	var calls atomic.Int32
	b.extract = func(context.Context, *mediaInputCache, string, []SubtitleTrack, float64) map[int]string {
		calls.Add(1)
		return map[int]string{1: "WEBVTT\n\n", 2: "WEBVTT\n\n00:01.000 --> 00:02.000\nOlá\n"}
	}
	first := b.schedule(0, false)
	if b.schedule(0, false) != first {
		t.Fatal("duplicate extraction")
	}
	<-first.done
	snapshot := b.snapshot(0, 0)
	if len(snapshot.Tracks) != 2 || strings.Contains(snapshot.Source, "private-source") {
		t.Fatalf("invalid catalog: %+v", snapshot)
	}
	for _, track := range snapshot.Tracks {
		if track.Status != "ready" || len(track.Parts) != 1 || track.Parts[0].End != 60 {
			t.Fatalf("silence not covered: %+v", track)
		}
	}
	if ahead, required := b.ahead(10); !required || ahead != 50 {
		t.Fatal("joint coverage did not include silence")
	}
	if len(b.snapshot(snapshot.Epoch, snapshot.Revision).Tracks) != 0 {
		t.Fatal("unchanged payload repeated")
	}
	if b.schedule(0, false) != first || calls.Load() != 1 {
		t.Fatal("selection/poll restarted preparation")
	}
}

func TestSubtitleBundleDeadlineIsTerminalWithoutBlockingOtherTracks(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	b.budget = 10 * time.Millisecond
	var calls atomic.Int32
	b.extract = func(ctx context.Context, _ *mediaInputCache, _ string, _ []SubtitleTrack, _ float64) map[int]string {
		calls.Add(1)
		<-ctx.Done()
		return map[int]string{1: "WEBVTT\n\n"}
	}
	job := b.schedule(0, false)
	<-job.done
	for _, track := range b.snapshot(0, 0).Tracks {
		if track.Status != "failed" || !track.Parts[0].Failed {
			t.Fatal("timeout accepted partial media")
		}
	}
	b.schedule(0, false)
	if calls.Load() != 1 {
		t.Fatal("failed interval retried indefinitely")
	}
	if ahead, _ := b.ahead(0); ahead != 60 {
		t.Fatal("terminal failure kept video waiting")
	}
}

func TestSubtitleBundleSourceChangeDiscardsLateResults(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	started := make(chan struct{})
	b.extract = func(ctx context.Context, _ *mediaInputCache, _ string, _ []SubtitleTrack, _ float64) map[int]string {
		close(started)
		<-ctx.Done()
		return map[int]string{1: "WEBVTT\n\n00:01.000 --> 00:02.000\nOLD\n"}
	}
	job := b.schedule(0, false)
	<-started
	previous := b.snapshot(0, 0)
	b.configure("replacement", []SubtitleTrack{{ID: "new", Source: "replacement", StreamIndex: 1, Language: "eng"}}, 180)
	<-job.done
	next := b.snapshot(previous.Epoch, previous.Revision)
	if !next.Reset || len(next.Tracks) != 1 || next.Tracks[0].ID != "new" || len(next.Tracks[0].Parts) != 0 {
		t.Fatalf("stale source leaked: %+v", next)
	}
}

func TestSubtitleBundleLegacyReadsCacheAndEndpointRequiresTicket(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	b.extract = func(context.Context, *mediaInputCache, string, []SubtitleTrack, float64) map[int]string {
		return map[int]string{1: "WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n", 2: "WEBVTT\n\n"}
	}
	<-b.schedule(0, false).done
	response := httptest.NewRecorder()
	request := httptest.NewRequest("GET", "/subtitles?trackId=english&start=0", nil)
	if !serveBundledSubtitle(response, request, b.cache, "english") || response.Code != 200 || !strings.Contains(response.Body.String(), "Hello") {
		t.Fatalf("legacy cache not reused: %d %s", response.Code, response.Body.String())
	}
	denied := httptest.NewRecorder()
	newServiceHTTPHandler(4004).ServeHTTP(denied, httptest.NewRequest("GET", "/playback/subtitles", nil))
	if denied.Code != 401 {
		t.Fatalf("unprotected bundle: %d", denied.Code)
	}
}

func TestSubtitleBundleFailedTrackPreservesOtherLanguages(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	b.extract = func(context.Context, *mediaInputCache, string, []SubtitleTrack, float64) map[int]string {
		return map[int]string{1: "WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n"}
	}
	<-b.schedule(0, false).done
	states := map[string]string{}
	for _, track := range b.snapshot(0, 0).Tracks {
		states[track.ID] = track.Status
	}
	if states["english"] != "ready" || states["portuguese"] != "failed" {
		t.Fatalf("one failure hid available language: %+v", states)
	}
}

func TestSubtitleFastHeadServesPartialImmediatelyAndUpgradesToFullBatch(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	releaseFull := make(chan struct{})
	fullStarted := make(chan struct{})
	fastTracks := []SubtitleTrack{
		{ID: "english", Source: "private-source", StreamIndex: 1, Language: "eng"},
		{ID: "portuguese", Source: "private-source", StreamIndex: 2, Language: "por"},
	}
	b.extractSpan = func(ctx context.Context, _ *mediaInputCache, _ string, _ []SubtitleTrack, start, span float64) map[int]string {
		if span < 60 {
			return map[int]string{
				1: "WEBVTT\n\n00:01.000 --> 00:03.000\nQuick cue\n",
				2: "WEBVTT\n\n",
			}
		}
		select {
		case <-fullStarted:
		default:
			close(fullStarted)
		}
		select {
		case <-releaseFull:
		case <-ctx.Done():
			return nil
		}
		return map[int]string{
			1: "WEBVTT\n\n00:01.000 --> 00:03.000\nQuick cue\n\n00:25.000 --> 00:28.000\nFull cue\n",
			2: "WEBVTT\n\n",
		}
	}
	b.extract = func(ctx context.Context, cache *mediaInputCache, source string, tracks []SubtitleTrack, start float64) map[int]string {
		return b.extractSpan(ctx, cache, source, tracks, start, 60)
	}

	if !b.prepareFastHead(context.Background(), "private-source", fastTracks, 0, 16) {
		t.Fatal("fast head extraction failed")
	}

	fastResp := httptest.NewRecorder()
	fastReq := httptest.NewRequest("GET", "/subtitles?trackId=english&start=0&fast=1", nil)
	if !serveBundledSubtitle(fastResp, fastReq, b.cache, "english") || fastResp.Code != 200 || fastResp.Header().Get("X-Anirium-Subtitle-Partial") != "1" || !strings.Contains(fastResp.Body.String(), "Quick cue") {
		t.Fatalf("fast head not served immediately: code=%d partial=%s body=%s", fastResp.Code, fastResp.Header().Get("X-Anirium-Subtitle-Partial"), fastResp.Body.String())
	}

	// Non-fast request preserves full 60s pending 202 contract while batch runs.
	<-fullStarted
	nonFastResp := httptest.NewRecorder()
	nonFastReq := httptest.NewRequest("GET", "/subtitles?trackId=english&start=0", nil)
	if !serveBundledSubtitle(nonFastResp, nonFastReq, b.cache, "english") || nonFastResp.Code != 202 {
		t.Fatalf("expected 202 while full 60s batch is still running: code=%d", nonFastResp.Code)
	}

	close(releaseFull)
	job := b.schedule(0, false)
	<-job.done

	upgradedResp := httptest.NewRecorder()
	if !serveBundledSubtitle(upgradedResp, httptest.NewRequest("GET", "/subtitles?trackId=english&start=0&fast=1", nil), b.cache, "english") || upgradedResp.Code != 200 || upgradedResp.Header().Get("X-Anirium-Subtitle-Partial") != "0" || !strings.Contains(upgradedResp.Body.String(), "Full cue") {
		t.Fatalf("upgraded full block missing: code=%d partial=%s body=%s", upgradedResp.Code, upgradedResp.Header().Get("X-Anirium-Subtitle-Partial"), upgradedResp.Body.String())
	}
}

func TestPrewarmPrioritySubtitlesPrioritizesFullPorAndEngOverForced(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	oldLinks, oldStreams, oldFormats, oldSidecars := activeLinks, probedStreams, probedFormats, probedSidecars
	oldQualities, oldSubs, oldExternal, oldInputs := currentMixQualities, currentMixSubs, externalSubtitles, playbackInputs
	gen := playbackGeneration
	src := fmt.Sprintf("media-%d-0", gen)
	mkStream := func(index int, lang, title string) ffprobeStream {
		s := ffprobeStream{Index: index, CodecType: "subtitle", CodecName: "subrip"}
		s.Tags.Language = lang
		s.Tags.Title = title
		return s
	}
	streams := []ffprobeStream{
		{Index: 0, CodecType: "video", Height: 1080},
		mkStream(1, "jpn", ""),
		mkStream(2, "eng", "Forced"),
		mkStream(3, "eng", "SDH"),
		mkStream(4, "eng", ""),
		mkStream(5, "por", "Portugal"),
		mkStream(6, "por", "Brazil"),
	}
	cache := newMediaInputCache(ctx, nil)
	playbackInputs = cache
	activeLinks = []string{src}
	probedStreams = map[string][]ffprobeStream{src: streams}
	fmtProbe := ffprobeOutput{Streams: streams}
	fmtProbe.Format.Duration = "180"
	probedFormats = map[string]ffprobeOutput{src: fmtProbe}
	probedSidecars = map[string][]string{}
	externalSubtitles = nil
	swarmMu.Unlock()

	t.Cleanup(func() {
		cancel()
		cache.bundle().wait()
		swarmMu.Lock()
		activeLinks, probedStreams, probedFormats, probedSidecars = oldLinks, oldStreams, oldFormats, oldSidecars
		currentMixQualities, currentMixSubs, externalSubtitles, playbackInputs = oldQualities, oldSubs, oldExternal, oldInputs
		swarmMu.Unlock()
	})

	b := cache.bundle()
	var callsMu sync.Mutex
	var batches [][]int
	secondBatchDone := make(chan struct{})
	b.extractSpan = func(_ context.Context, _ *mediaInputCache, _ string, tracks []SubtitleTrack, _, _ float64) map[int]string {
		out := map[int]string{}
		indices := make([]int, 0, len(tracks))
		for _, tr := range tracks {
			indices = append(indices, tr.StreamIndex)
			out[tr.StreamIndex] = "WEBVTT\n\n00:01.000 --> 00:02.000\nCue\n"
		}
		callsMu.Lock()
		batches = append(batches, indices)
		count := len(batches)
		callsMu.Unlock()
		if count == 2 {
			close(secondBatchDone)
		}
		return out
	}

	prewarmPrioritySubtitles(ctx, cache, src, 0)
	select {
	case <-secondBatchDone:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for secondary primary tracks fast-head")
	}

	callsMu.Lock()
	defer callsMu.Unlock()
	if len(batches) < 2 {
		t.Fatalf("expected 2 batches, got %v", batches)
	}
	first := batches[0]
	wantFirst := []int{6, 5, 4, 3}
	if len(first) != len(wantFirst) {
		t.Fatalf("first priority batch = %v, want %v", first, wantFirst)
	}
	for i := range wantFirst {
		if first[i] != wantFirst[i] {
			t.Fatalf("first priority batch order = %v, want %v (por Brazil -> por Portugal -> eng -> eng SDH)", first, wantFirst)
		}
	}
}

func TestFastHeadForRequiresLookaheadAndAdvancesToNextSlice(t *testing.T) {
	b, ctx, _ := testSubtitleBundle(t)
	type call struct{ start, span float64 }
	var calls []call
	var callsMu sync.Mutex
	b.extractSpan = func(_ context.Context, _ *mediaInputCache, _ string, tracks []SubtitleTrack, start, span float64) map[int]string {
		callsMu.Lock()
		calls = append(calls, call{start: start, span: span})
		callsMu.Unlock()
		out := map[int]string{}
		for _, tr := range tracks {
			out[tr.StreamIndex] = "WEBVTT\n\n00:01.000 --> 00:03.000\nLine\n"
		}
		return out
	}
	tracks := []SubtitleTrack{{ID: "english", Source: "private-source", StreamIndex: 1, Language: "eng"}}
	if !b.prepareFastHead(ctx, "private-source", tracks, 0, 16) {
		t.Fatal("initial prepareFastHead failed")
	}
	part0, ok := b.fastHeadFor("english", 0)
	if !ok || part0.Start != 0 || part0.End != 16 {
		t.Fatalf("unexpected initial fast-head part: ok=%v part=%+v", ok, part0)
	}
	if _, ok := b.fastHeadFor("english", 12); ok {
		t.Fatal("fastHeadFor(12) must not reuse [0,16) slice lacking 8s lookahead")
	}
	if !b.prepareFastHead(ctx, "private-source", tracks, 12, 16) {
		t.Fatal("second prepareFastHead failed")
	}
	part12, ok := b.fastHeadFor("english", 12)
	if !ok || part12.Start != 12 || part12.End != 28 {
		t.Fatalf("expected [12,28) fast-head slice, got ok=%v part=%+v", ok, part12)
	}
	callsMu.Lock()
	defer callsMu.Unlock()
	if len(calls) != 2 || calls[1].start != 12 || calls[1].span != 16 {
		t.Fatalf("expected second extraction at 12:16, got %+v", calls)
	}
}

func TestSpeculativePrefetchDoesNotCancelActiveSubtitleBatch(t *testing.T) {
	b, _, _ := testSubtitleBundle(t)
	block0Started := make(chan struct{})
	releaseBlock0 := make(chan struct{})
	var block0Canceled atomic.Bool
	b.extract = func(ctx context.Context, _ *mediaInputCache, _ string, _ []SubtitleTrack, start float64) map[int]string {
		if start == 0 {
			close(block0Started)
			select {
			case <-releaseBlock0:
			case <-ctx.Done():
				block0Canceled.Store(true)
				return nil
			}
			return map[int]string{1: "WEBVTT\n\n00:01.000 --> 00:02.000\nBlock0\n", 2: "WEBVTT\n\n"}
		}
		return map[int]string{1: "WEBVTT\n\n00:01.000 --> 00:02.000\nBlock60\n", 2: "WEBVTT\n\n"}
	}
	job0 := b.schedule(0, false)
	<-block0Started
	job60 := b.schedule(60, true)
	time.Sleep(25 * time.Millisecond)
	if block0Canceled.Load() {
		t.Fatal("speculative prefetch canceled active block 0 subtitle extraction")
	}
	close(releaseBlock0)
	<-job0.done
	<-job60.done
	if job0.err != nil || job60.err != nil {
		t.Fatalf("unexpected job errors: job0=%v job60=%v", job0.err, job60.err)
	}
	snap := b.snapshot(0, 0)
	for _, tr := range snap.Tracks {
		if tr.ID == "english" && len(tr.Parts) != 2 {
			t.Fatalf("expected 2 ready parts for english, got %+v", tr.Parts)
		}
	}
}

func TestSubtitleBundleSnapshotExposesFastHeadImmediately(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	b := cache.bundle()
	track := SubtitleTrack{ID: "ptbr", Language: "por", Title: "PT-BR", StreamIndex: 2, Source: "test.mkv"}
	b.configure("test.mkv", []SubtitleTrack{track}, 1440)
	b.extractSpan = func(ctx context.Context, cache *mediaInputCache, source string, tracks []SubtitleTrack, start, span float64) map[int]string {
		return map[int]string{
			2: "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nOlá mundo!\n",
		}
	}

	initial := b.snapshot(0, 0)
	if !b.prepareFastHead(ctx, "test.mkv", []SubtitleTrack{track}, 0, 16) {
		t.Fatalf("expected prepareFastHead to succeed")
	}

	snap := b.snapshot(initial.Epoch, initial.Revision)
	if len(snap.Tracks) != 1 {
		t.Fatalf("expected 1 updated track in incremental snapshot, got %d", len(snap.Tracks))
	}
	if snap.Tracks[0].Status != "ready" {
		t.Fatalf("expected fast-head track status ready, got %q", snap.Tracks[0].Status)
	}
	if len(snap.Tracks[0].Parts) != 1 || len(snap.Tracks[0].Parts[0].Cues) != 1 {
		t.Fatalf("expected 1 fast-head part with 1 cue, got %+v", snap.Tracks[0].Parts)
	}
}
