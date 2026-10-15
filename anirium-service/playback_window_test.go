package main

import (
	"context"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
)

func TestWindowRequestOnlyAcceptsPositionAndExistingQualitySyntax(t *testing.T) {
	for _, query := range []string{"", "quality=720p", "quality=720p&position=NaN", "quality=720p&position=Inf", "quality=720p&position=-1", "quality=720p&position=90000", "quality=720p&position=4&position=8", "quality=720p&position=8&provider=x", "quality=720p&position=8&magnet=x"} {
		values, _ := url.ParseQuery(query)
		if _, _, err := decodeWindowRequest(values); err == nil {
			t.Fatalf("accepted %s", query)
		}
	}
	values, _ := url.ParseQuery("quality=720p&position=11.5&playbackTicket=opaque")
	if quality, start, err := decodeWindowRequest(values); err != nil || quality != "720p" || start != 8 {
		t.Fatalf("invalid normalized demand: %s %v %v", quality, start, err)
	}
}

func TestWindowEndpointRequiresPlaybackAuthorization(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		response := httptest.NewRecorder()
		newServiceHTTPHandler(0).ServeHTTP(response, httptest.NewRequest(method, "/playback/window?quality=720p&position=8", nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("unauthorized window accessible: %d", response.Code)
		}
	}
}

func TestRetiredWindowCannotPublishIntoReplacement(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	retired := &playbackWindow{ID: "retired", ctx: ctx, cancel: cancel}
	replacement := &playbackWindow{ID: "replacement", Status: "preparing", ctx: ctx, cancel: cancel}
	swarmMu.Lock()
	previous := currentPlaybackWindow
	currentPlaybackWindow = replacement
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		currentPlaybackWindow = previous
		swarmMu.Unlock()
	}()
	finishPlaybackWindow(retired, map[string]*variantRuntime{"retired-video": {MixVariant: MixVariant{Status: "ready"}}}, nil, nil)
	snapshot, _ := playbackWindowSnapshot()
	if snapshot.ID != "replacement" || snapshot.Status != "preparing" || snapshot.PlaylistURL != "" {
		t.Fatalf("retired worker changed replacement: %+v", snapshot)
	}
	if _, exists := readyVariantSnapshot("retired-video"); exists {
		t.Fatal("retired worker published media")
	}
}

func TestPlaybackWindowPublishesSeparateVideoAndAudioAfterEmptySource(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "episode.mp4")
	output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=16", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=16", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	window := &playbackWindow{ID: "window-fixture", Quality: "120p", Start: 8, Duration: 24, Status: "preparing", ctx: ctx, cancel: cancel}
	swarmMu.Lock()
	oldWindow := currentPlaybackWindow
	currentPlaybackWindow = window
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlaybackWindowLocked()
		currentPlaybackWindow = oldWindow
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	// Inject a failed/early-EOF input at the loader boundary. Discovery/source-set
	// selection is separate; this fixture must not make incompatible cuts eligible.
	shortInput := filepath.Join(root, "early-eof.mp4")
	if output, err := exec.Command(mediaTool("ffmpeg"), "-v", "error", "-i", input, "-t", "4", "-c", "copy", shortInput).CombinedOutput(); err != nil {
		t.Fatalf("early EOF fixture: %v %s", err, output)
	}
	inputs := newMediaInputCache(ctx, func(_ context.Context, source string, _ int) (string, error) {
		if source == "early-eof-source" {
			return shortInput, nil
		}
		return input, nil
	}, func(string) {})
	buildPlaybackWindow(window, inputs, []string{"early-eof-source", "selected-source"}, []AudioCandidate{{Source: "early-eof-source", StreamIndex: 1, Language: "eng", Channels: 1, SampleRate: 48000}}, AudioPolicy{}, []AudioCandidate{{Source: "selected-source", StreamIndex: 1, Language: "eng", Channels: 1, SampleRate: 48000}})
	snapshot, exists := playbackWindowSnapshot()
	if !exists || snapshot.Status != "ready" || len(snapshot.AudioTracks) != 1 || snapshot.AudioTracks[0].Status != "ready" || snapshot.PlaylistURL == "" {
		t.Fatalf("window not ready: %+v", snapshot)
	}
	if math.Abs(snapshot.DeliveredDuration-8) > 0.05 || !snapshot.EndOfEpisode {
		t.Fatalf("episode tail incorrectly reported: %+v", snapshot)
	}
	video, ok := readyVariantSnapshot(window.ID + "-video")
	if !ok {
		t.Fatal("window video missing")
	}
	if filepath.Base(video.Dir) != "video-1" {
		t.Fatal("empty source prevented recovery using the eligible alternative")
	}
	audio, ok := readyVariantSnapshot(snapshot.AudioTracks[0].ID)
	if !ok || audio.Dir == video.Dir {
		t.Fatal("audio window missing or not separated")
	}
	if filepath.Base(audio.Dir) != "audio-0-1" {
		t.Fatal("audio did not recover using its compatible same-language alternative")
	}
	swarmMu.Lock()
	cancelPlaybackWindowLocked()
	swarmMu.Unlock()
	if _, exists := playbackWindowSnapshot(); exists {
		t.Fatal("cancelled window remains available")
	}
	if _, exists := readyVariantSnapshot(window.ID + "-video"); exists {
		t.Fatal("cancelled video remains routable")
	}
}

func TestWindowDurationRejectsInvalidSegments(t *testing.T) {
	for _, segments := range [][]hlsSegment{nil, {{duration: "NaN"}}, {{duration: "Inf"}}, {{duration: "0"}}, {{duration: "-4"}}, {{duration: "invalid"}}} {
		if _, err := windowSegmentDuration(segments); err == nil {
			t.Fatalf("invalid duration accepted: %+v", segments)
		}
	}
	if duration, err := windowSegmentDuration([]hlsSegment{{duration: "4"}, {duration: "1.5"}}); err != nil || duration != 5.5 {
		t.Fatalf("incorrect delivered duration: %v %v", duration, err)
	}
}

func TestWindowRecognizesEpisodeEndAtExactBoundary(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	window := &playbackWindow{ID: "exact-end-fixture", Start: 24, Duration: 24, EpisodeDuration: 48, ctx: ctx, cancel: cancel}
	swarmMu.Lock()
	previous := currentPlaybackWindow
	currentPlaybackWindow = window
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlaybackWindowLocked()
		currentPlaybackWindow = previous
		swarmMu.Unlock()
	}()
	finishPlaybackWindow(window, map[string]*variantRuntime{window.ID + "-video": {MixVariant: MixVariant{Status: "ready", BufferedSeconds: 24}}}, nil, nil)
	snapshot, _ := playbackWindowSnapshot()
	if !snapshot.EndOfEpisode || snapshot.DeliveredDuration != 24 {
		t.Fatalf("exact end boundary lost: %+v", snapshot)
	}
}

func TestWindowEndUsesDeliveredFinalTailDespiteMetadataOverestimate(t *testing.T) {
	for _, sample := range []struct {
		name                                 string
		start, requested, delivered, episode float64
		final                                bool
	}{
		{"short-final", 1200, 20, 19.6, 1220, true},
		{"short-interior", 24, 24, 23.6, 1220, false},
	} {
		t.Run(sample.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			window := &playbackWindow{ID: "metadata-tail-fixture", Start: sample.start, Duration: sample.requested, EpisodeDuration: sample.episode, ctx: ctx, cancel: cancel}
			swarmMu.Lock()
			previous := currentPlaybackWindow
			currentPlaybackWindow = window
			swarmMu.Unlock()
			defer func() {
				swarmMu.Lock()
				cancelPlaybackWindowLocked()
				currentPlaybackWindow = previous
				swarmMu.Unlock()
			}()
			finishPlaybackWindow(window, map[string]*variantRuntime{window.ID + "-video": {MixVariant: MixVariant{Status: "ready", BufferedSeconds: sample.delivered}}}, nil, nil)
			snapshot, _ := playbackWindowSnapshot()
			if snapshot.EndOfEpisode != sample.final {
				t.Fatalf("final=%v want=%v", snapshot.EndOfEpisode, sample.final)
			}
		})
	}
}

func TestPrefetchedWindowPreservesCurrentUntilPromotion(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	currentContext, cancelCurrent := context.WithCancel(ctx)
	nextContext, cancelNext := context.WithCancel(ctx)
	defer cancelCurrent()
	defer cancelNext()
	current := &playbackWindow{ID: "prefetch-current-fixture", Quality: "720p", Start: 0, DeliveredDuration: 24, Status: "ready", ctx: currentContext, cancel: cancelCurrent}
	next := &playbackWindow{ID: "prefetch-next-fixture", Quality: "720p", Start: 24, Duration: 24, Status: "preparing", ctx: nextContext, cancel: cancelNext}
	swarmMu.Lock()
	oldCurrent, oldNext := currentPlaybackWindow, prefetchedPlaybackWindow
	oldContext, oldInputs, oldDiscovery, oldQualities := playbackContext, playbackInputs, playbackDiscoveryComplete, currentMixQualities
	currentPlaybackWindow, prefetchedPlaybackWindow = current, next
	playbackContext, playbackInputs, playbackDiscoveryComplete, currentMixQualities = ctx, &mediaInputCache{}, true, []string{"720p"}
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlaybackWindowLocked()
		currentPlaybackWindow, prefetchedPlaybackWindow = oldCurrent, oldNext
		playbackContext, playbackInputs, playbackDiscoveryComplete, currentMixQualities = oldContext, oldInputs, oldDiscovery, oldQualities
		swarmMu.Unlock()
	}()
	finishPlaybackWindow(next, map[string]*variantRuntime{next.ID + "-video": {MixVariant: MixVariant{Status: "ready", BufferedSeconds: 24}}}, nil, nil)
	snapshot, _ := playbackWindowSnapshot()
	if snapshot.ID != current.ID || currentContext.Err() != nil {
		t.Fatal("prefetch interrupted current playback")
	}
	pending, exists := playbackWindowSnapshot(true)
	if !exists || pending.ID != next.ID || pending.Status != "ready" {
		t.Fatal("prefetch result was not retained separately")
	}
	if !requestPlaybackWindow("720p", 24) {
		t.Fatal("ready prefetch was not promoted")
	}
	snapshot, _ = playbackWindowSnapshot()
	if snapshot.ID != next.ID || currentContext.Err() != nil || nextContext.Err() != nil {
		t.Fatal("promotion did not preserve next media and bounded back buffer")
	}
	if _, exists := playbackWindowSnapshot(true); exists {
		t.Fatal("promoted window remained duplicated in prefetch slot")
	}
	swarmMu.Lock()
	cancelPlaybackWindowLocked()
	swarmMu.Unlock()
	if currentContext.Err() == nil || nextContext.Err() == nil {
		t.Fatal("seek/shutdown did not retire retained and current media")
	}
}

func TestWindowSnapshotsRemainConsistentDuringPublication(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	window := &playbackWindow{ID: "concurrent-window-fixture", Start: 24, Duration: 24, EpisodeDuration: 48, Status: "preparing", ctx: ctx, cancel: cancel}
	swarmMu.Lock()
	previous := currentPlaybackWindow
	currentPlaybackWindow = window
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlaybackWindowLocked()
		currentPlaybackWindow = previous
		swarmMu.Unlock()
	}()
	var readers sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		readers.Add(1)
		go func() {
			defer readers.Done()
			for iteration := 0; iteration < 100; iteration++ {
				snapshot, exists := playbackWindowSnapshot()
				if exists && snapshot.Status == "ready" && (snapshot.DeliveredDuration != 24 || !snapshot.EndOfEpisode || snapshot.PlaylistURL == "") {
					t.Error("HTTP snapshot exposed partially published window state")
				}
			}
		}()
	}
	finishPlaybackWindow(window, map[string]*variantRuntime{window.ID + "-video": {MixVariant: MixVariant{Status: "ready", BufferedSeconds: 24}}}, nil, nil)
	readers.Wait()
}
