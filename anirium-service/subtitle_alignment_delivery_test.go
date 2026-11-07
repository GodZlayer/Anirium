package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

func TestAlignmentDeliveryRequiresCurrentVideoSourceAndOwnedReference(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, nil)
	swarmMu.Lock()
	oldContext, oldInputs := playbackContext, playbackInputs
	oldCurrent, oldNext, oldRetained := currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows
	oldLinks, oldStreams, oldSidecars, oldExternal := activeLinks, probedStreams, probedSidecars, externalSubtitles
	playbackContext, playbackInputs = ctx, cache
	currentPlaybackWindow = &playbackWindow{ID: "alignment-owned", Status: "ready", ctx: ctx, cancel: cancel}
	prefetchedPlaybackWindow, retainedPlaybackWindows = nil, nil
	activeLinks = []string{"actual-video", "other-video"}
	stream := ffprobeStream{Index: 2, CodecType: "subtitle", CodecName: "subrip"}
	stream.Tags.Language = "eng"
	probedStreams = map[string][]ffprobeStream{"actual-video": {stream}, "other-video": {stream}}
	probedSidecars, externalSubtitles = nil, nil
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{"alignment-owned-video": {MixVariant: MixVariant{Status: "ready", ProcessingComplete: true, BufferedSeconds: 24}, videoSource: "actual-video"}}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		playbackContext, playbackInputs = oldContext, oldInputs
		currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows = oldCurrent, oldNext, oldRetained
		activeLinks, probedStreams, probedSidecars, externalSubtitles = oldLinks, oldStreams, oldSidecars, oldExternal
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	candidate := alignmentFixture(3.5, 0, false)
	reference := alignmentFixture(0, 0, false)
	if embeddedSubtitleAlignment(cache, "actual-video") != "verified" || embeddedSubtitleAlignment(cache, "other-video") != "unverified" || embeddedSubtitleAlignment(cache, "") != "unverified" {
		t.Fatal("embedded manual controls do not reflect actual container ownership")
	}
	swarmMu.RLock()
	selectedTrack := ""
	for _, track := range subtitleTracksLocked() {
		if track.Source == "actual-video" && track.StreamIndex == 2 {
			selectedTrack = track.ID
			break
		}
	}
	swarmMu.RUnlock()
	if selectedTrack == "" {
		t.Fatal("reference track absent")
	}
	beforeFallback, valid := playbackBufferSnapshot(0, "", selectedTrack)
	if !valid || beforeFallback.SubtitleUnverified {
		t.Fatal("same producer snapshot lost alignment")
	}
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "other-video", stream: 2, start: -1}, reference)
	if _, ok := alignExternalSubtitleToVideo(cache, "eng", candidate); ok {
		t.Fatal("another source's subtitle became a timing authority")
	}
	loaded := false
	prepareSubtitleAlignmentReference(ctx, cache, "eng", func(waiter context.Context, owned *mediaInputCache, source string, stream int) (string, error) {
		if owned != cache || source != "actual-video" || stream != 2 {
			t.Fatal("reference acquisition used another producer or language")
		}
		if _, ok := waiter.Deadline(); !ok {
			t.Fatal("reference acquisition has no delivery deadline")
		}
		loaded = true
		owned.rememberSubtitleWindow(subtitleWindowKey{source: source, stream: stream, start: -1}, reference)
		return reference, nil
	})
	if !loaded {
		t.Fatal("missing reference was never requested")
	}
	for _, language := range []string{"por", "und", ""} {
		prepareSubtitleAlignmentReference(ctx, cache, language, func(context.Context, *mediaInputCache, string, int) (string, error) {
			t.Fatal("a missing or unknown language started an unrelated reference extraction")
			return "", nil
		})
	}
	// Exercise the actual shared-input/FFmpeg path rather than supplying the
	// reference text directly to the alignment code.
	root := t.TempDir()
	referencePath := filepath.Join(root, "reference.vtt")
	containerPath := filepath.Join(root, "reference.mkv")
	if err := os.WriteFile(referencePath, []byte(reference), 0600); err != nil {
		t.Fatal(err)
	}
	command := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", referencePath,
		"-map", "0:s:0", "-map", "0:s:0", "-map", "0:s:0", "-c:s", "srt", containerPath)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("embedded reference fixture: %v %s", err, output)
	}
	cache.mu.Lock()
	delete(cache.subtitleWindows, subtitleWindowKey{source: "actual-video", stream: 2, start: -1})
	cache.load = func(context.Context, string, int) (string, error) { return containerPath, nil }
	cache.mu.Unlock()
	prepareSubtitleAlignmentReference(ctx, cache, "eng", extractCachedSubtitle)
	if adjusted, verified := alignExternalSubtitleToVideo(cache, "eng", candidate); !verified || !reflect.DeepEqual(subtitleAlignmentAnchors(adjusted), subtitleAlignmentAnchors(reference)) {
		t.Fatal("real embedded reference was not acquired and applied")
	}
	swarmMu.RLock()
	failedTrack := ""
	for _, track := range subtitleTracksLocked() {
		if track.Source == "other-video" && track.StreamIndex == 2 {
			failedTrack = track.ID
		}
	}
	swarmMu.RUnlock()
	cache.mu.Lock()
	delete(cache.subtitleWindows, subtitleWindowKey{source: "actual-video", stream: 2, start: -1})
	cache.mu.Unlock()
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "actual-video", stream: 2, start: 0}, reference)
	if _, _, ok := recoverCompleteEmbeddedSubtitle(cache, failedTrack); ok {
		t.Fatal("partial subtitle window was accepted as a complete alternative")
	}
	cache.rememberSubtitleWindow(subtitleWindowKey{source: "actual-video", stream: 2, start: -1}, reference)
	recovered, producer, recoveredOK := recoverCompleteEmbeddedSubtitle(cache, failedTrack)
	if !recoveredOK || recovered != reference || producer != "actual-video" || !cache.hasCompleteSubtitle(failedTrack) {
		t.Fatal("complete same-language alternative was not recovered")
	}
	recoveredSnapshot, valid := playbackBufferSnapshot(0, "", failedTrack)
	if !valid || recoveredSnapshot.SubtitleUnverified {
		t.Fatal("recovered subtitle did not use its actual producer for confidence")
	}
	if _, _, ok := recoverCompleteEmbeddedSubtitle(cache, "missing-track"); ok {
		t.Fatal("unknown selection recovered an arbitrary language")
	}
	swarmMu.Lock()
	otherStream := probedStreams["other-video"][0]
	otherStream.Tags.Language = "por"
	probedStreams["other-video"] = []ffprobeStream{otherStream}
	swarmMu.Unlock()
	if _, _, ok := recoverCompleteEmbeddedSubtitle(cache, failedTrack); ok {
		t.Fatal("recovery replaced Portuguese selection with English content")
	}
	swarmMu.Lock()
	otherStream.Tags.Language = "und"
	probedStreams["other-video"] = []ffprobeStream{otherStream}
	swarmMu.Unlock()
	if _, _, ok := recoverCompleteEmbeddedSubtitle(cache, failedTrack); ok {
		t.Fatal("recovery guessed the language of an unknown-language selection")
	}
	swarmMu.Lock()
	probedStreams["other-video"] = []ffprobeStream{stream}
	swarmMu.Unlock()
	adjusted, ok := alignExternalSubtitleToVideo(cache, "eng", candidate)
	if !ok || !reflect.DeepEqual(subtitleAlignmentAnchors(adjusted), subtitleAlignmentAnchors(reference)) {
		t.Fatal("current source reference not applied")
	}
	if _, ok := alignExternalSubtitleToVideo(cache, "por", candidate); ok {
		t.Fatal("different language auto-aligned")
	}
	swarmMu.Lock()
	externalSubtitles = []ProviderSubtitle{{Language: "eng"}}
	externalTrack := fmt.Sprintf("external-%d-0", playbackGeneration)
	swarmMu.Unlock()
	cache.rememberCompleteSubtitle(externalTrack)
	if _, ok := alignExternalSubtitleToVideo(cache, "eng", candidate, externalTrack); !ok {
		t.Fatal("external delivery did not establish alignment")
	}
	externalBefore, valid := playbackBufferSnapshot(0, "", externalTrack)
	if !valid || externalBefore.SubtitleUnverified {
		t.Fatal("aligned external subtitle was not verified")
	}
	swarmMu.Lock()
	prefetchedPlaybackWindow = &playbackWindow{ID: "alignment-fallback", Status: "ready", ctx: ctx, cancel: cancel}
	variantMu.Lock()
	variantRuntimes["alignment-fallback-video"] = &variantRuntime{MixVariant: MixVariant{Status: "ready", ProcessingComplete: true, BufferedSeconds: 24}, videoSource: "other-video"}
	variantMu.Unlock()
	swarmMu.Unlock()
	if _, ok := alignExternalSubtitleToVideo(cache, "eng", candidate); ok {
		t.Fatal("mixed video sources retained one reference's verified status")
	}
	if embeddedSubtitleAlignment(cache, "actual-video") != "unverified" {
		t.Fatal("mixed producer kept embedded subtitle verification")
	}
	afterFallback, valid := playbackBufferSnapshot(0, "", selectedTrack)
	if !valid || !afterFallback.SubtitleUnverified {
		t.Fatal("Player snapshot did not invalidate loaded subtitle after fallback")
	}
	externalAfter, valid := playbackBufferSnapshot(0, "", externalTrack)
	if !valid || !externalAfter.SubtitleUnverified || !cache.hasCompleteSubtitle(externalTrack) {
		t.Fatal("fallback must invalidate external timing while preserving complete content")
	}
	cancel()
	if _, _, ok := recoverCompleteEmbeddedSubtitle(cache, failedTrack); ok {
		t.Fatal("retired session recovered subtitle content")
	}
	if _, ok := alignExternalSubtitleToVideo(cache, "eng", candidate); ok {
		t.Fatal("retired session still aligned")
	}
	if embeddedSubtitleAlignment(cache, "actual-video") != "unverified" {
		t.Fatal("retired session retained subtitle verification")
	}
}
