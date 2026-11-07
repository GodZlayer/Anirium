package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestContinuousWindowHTTPPreparedOnlyAndAnonymousDenied(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "segment.ts"), []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.m3u8"), []byte("#EXTM3U\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n"), 0600); err != nil {
		t.Fatal(err)
	}
	swarmMu.Lock()
	oldCurrent, oldPrefetch, oldRetained := currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows
	currentPlaybackWindow = &playbackWindow{ID: "window-77-1", ctx: ctx, cancel: cancel, Start: 0, Status: "ready"}
	prefetchedPlaybackWindow = &playbackWindow{ID: "window-77-2", ctx: ctx, cancel: cancel, Start: 4, Status: "preparing"}
	retainedPlaybackWindows = nil
	swarmMu.Unlock()
	variantMu.Lock()
	variantRuntimes["window-77-1-video"] = &variantRuntime{MixVariant: MixVariant{Status: "ready"}, Dir: dir}
	variantMu.Unlock()
	defer func() {
		swarmMu.Lock()
		currentPlaybackWindow, prefetchedPlaybackWindow, retainedPlaybackWindows = oldCurrent, oldPrefetch, oldRetained
		swarmMu.Unlock()
		variantMu.Lock()
		delete(variantRuntimes, "window-77-1-video")
		variantMu.Unlock()
	}()
	response := httptest.NewRecorder()
	servePreparedWindowSequence(response, httptest.NewRequest("GET", "/hls/window-77-1-video/continuous.m3u8?playbackTicket=fixture", nil), "window-77-1-video")
	if response.Code != 200 || strings.Contains(response.Body.String(), "ENDLIST") || !strings.Contains(response.Body.String(), "playbackTicket=fixture") || strings.Contains(response.Body.String(), "77-2") {
		t.Fatal("pending segments published or authorization lost")
	}
	guard := restrictLegacyPlayback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Fatal("anonymous reached continuous playlist") }))
	denied := httptest.NewRecorder()
	guard.ServeHTTP(denied, httptest.NewRequest("GET", "/hls/window-77-1-video/continuous.m3u8", nil))
	if denied.Code != 401 {
		t.Fatal("anonymous not denied")
	}
	// Root window can leave retention without changing the public video URL.
	swarmMu.Lock()
	currentPlaybackWindow = &playbackWindow{ID: "window-77-2", timelineID: "window-77-1", playlistCursor: slidingPlaylistCursor{MediaSequence: 1, DiscontinuitySequence: 1}, ctx: ctx, cancel: cancel, Start: 4, Status: "ready"}
	prefetchedPlaybackWindow = nil
	variantMu.Lock()
	variantRuntimes["window-77-2-video"] = &variantRuntime{MixVariant: MixVariant{Status: "ready"}, Dir: dir}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() { variantMu.Lock(); delete(variantRuntimes, "window-77-2-video"); variantMu.Unlock() }()
	sliding, err := preparedWindowSequencePlaylist("window-77-1-video")
	if err != nil || !strings.Contains(sliding, "#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-DISCONTINUITY-SEQUENCE:1\n") || !strings.Contains(sliding, "/hls/window-77-2-video/") {
		t.Fatalf("stable root after eviction: %v", err)
	}
	swarmMu.Lock()
	currentPlaybackWindow.AudioTracks = []AudioTrack{{ID: "window-77-2-audio-0", Language: "por", Status: "ready", PlaylistURL: "/hls/window-77-2-audio-0/index.m3u8"}}
	currentPlaybackWindow.audioPlaylistCursors = map[string]slidingPlaylistCursor{"audio-0": {MediaSequence: 2, DiscontinuitySequence: 1}}
	swarmMu.Unlock()
	master, err := preparedWindowMasterPlaylist("window-77-1-video", "fixture")
	if err != nil || !strings.Contains(master, "/hls/window-77-1-audio-0/continuous.m3u8?playbackTicket=fixture") || !strings.Contains(master, "/hls/window-77-1-video/continuous.m3u8?playbackTicket=fixture") || strings.Contains(master, "window-77-2") {
		t.Fatalf("unstable master: %v %s", err, master)
	}
	cancel()
	if _, err := preparedWindowSequencePlaylist("window-77-1-video"); err == nil {
		t.Fatal("cancelled media served")
	}
}
