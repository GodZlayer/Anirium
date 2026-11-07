package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSubtitleInventoryPreservesAlternativesWithoutExposingSources(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldLinks, oldStreams := activeLinks, probedStreams
	defer func() { activeLinks, probedStreams = oldLinks, oldStreams }()
	first := ffprobeStream{Index: 2, CodecType: "subtitle", CodecName: "subrip"}
	first.Tags.Language = "pt-BR"
	second := ffprobeStream{Index: 3, CodecType: "subtitle", CodecName: "ass"}
	second.Tags.Language = "por"
	bitmap := ffprobeStream{Index: 4, CodecType: "subtitle", CodecName: "hdmv_pgs_subtitle"}
	activeLinks = []string{"private-source-one", "private-source-two"}
	probedStreams = map[string][]ffprobeStream{"private-source-one": {first, bitmap}, "private-source-two": {second}}
	tracks := subtitleTracksLocked()
	if len(tracks) != 2 || tracks[0].Language != "por" || tracks[1].Language != "por" || tracks[0].ID == tracks[1].ID {
		t.Fatalf("bad alternatives: %+v", tracks)
	}
	encoded, err := json.Marshal(tracks)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "private-source") || strings.Contains(string(encoded), "StreamIndex") {
		t.Fatal("provider details exposed to Player")
	}
}

func TestSubtitleInventoryPrefersLighterKnownFilesWithoutChangingIDs(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldLinks, oldStreams, oldSidecars := activeLinks, probedStreams, probedSidecars
	mediaSourceMu.Lock()
	oldSources := mediaSources
	mediaSources = map[string]mediaSource{"heavy": {FileBytes: 900}, "light": {FileBytes: 200}}
	mediaSourceMu.Unlock()
	defer func() {
		activeLinks, probedStreams, probedSidecars = oldLinks, oldStreams, oldSidecars
		mediaSourceMu.Lock()
		mediaSources = oldSources
		mediaSourceMu.Unlock()
	}()
	stream := ffprobeStream{Index: 2, CodecType: "subtitle", CodecName: "subrip"}
	stream.Tags.Language = "por"
	activeLinks = []string{"unknown", "heavy", "light"}
	probedStreams = map[string][]ffprobeStream{"unknown": {stream}, "heavy": {stream}, "light": {stream}}
	probedSidecars = map[string][]string{}
	tracks := subtitleTracksLocked()
	if len(tracks) < 3 {
		t.Fatal("alternatives were removed")
	}
	var internal []SubtitleTrack
	for _, track := range tracks {
		if track.Source != "" {
			internal = append(internal, track)
		}
	}
	if len(internal) != 3 || internal[0].Source != "light" || internal[1].Source != "heavy" || internal[2].Source != "unknown" {
		t.Fatalf("incorrect priority: %+v", internal)
	}
	if internal[0].ID != fmt.Sprintf("subtitle-%d-2-2", playbackGeneration) {
		t.Fatal("sorting changed track identity")
	}
	again := subtitleTracksLocked()
	if !reflect.DeepEqual(tracks, again) {
		t.Fatal("manifest polls change inventory order")
	}
}

func TestSidecarLanguageRequiresExplicitToken(t *testing.T) {
	for path, expected := range map[string]string{
		"Example.pt-BR.srt": "por", "Example.eng.ass": "eng",
		"Example [spa].vtt": "spa", "Japanese.jpn.srt": "jpn",
		"Opening.srt": "und", "PortugueseRelease.srt": "und",
	} {
		if actual := sidecarLanguage(path); actual != expected {
			t.Fatalf("%s: got %s want %s", path, actual, expected)
		}
	}
}

func TestSidecarAlternativesHaveStableIndependentIDs(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldLinks, oldStreams, oldSidecars := activeLinks, probedStreams, probedSidecars
	defer func() { activeLinks, probedStreams, probedSidecars = oldLinks, oldStreams, oldSidecars }()
	activeLinks = []string{"source"}
	probedStreams = map[string][]ffprobeStream{}
	probedSidecars = map[string][]string{"source": {"Example.eng.srt", "Example.eng.ass"}}
	tracks := subtitleTracksLocked()
	again := subtitleTracksLocked()
	if len(tracks) != 2 || tracks[0].ID == tracks[1].ID || tracks[0].ID != again[0].ID || tracks[0].Language != "eng" {
		t.Fatalf("bad sidecars: %+v", tracks)
	}
	if tracks[1].FilePath != "Example.eng.ass" || tracks[1].StreamIndex != -1 {
		t.Fatal("sidecar cannot resolve exact file")
	}
	payload, err := json.Marshal(tracks)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "FilePath") || strings.Contains(string(payload), "\"Source\"") {
		t.Fatal("internal source fields leaked")
	}
}

func TestEmbeddedSubtitleExtractionProducesRequestedVTT(t *testing.T) {
	root := t.TempDir()
	english := filepath.Join(root, "en.srt")
	portuguese := filepath.Join(root, "pt.srt")
	for path, text := range map[string]string{english: "English fixture", portuguese: "Legenda portuguesa"} {
		if err := os.WriteFile(path, []byte("1\n00:00:00,000 --> 00:00:01,000\n"+text+"\n\n2\n00:01:05,000 --> 00:01:06,000\n"+text+" late\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	input := filepath.Join(root, "fixture.mkv")
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=24", "-i", english, "-i", portuguese, "-map", "0:v", "-map", "1:s", "-map", "2:s", "-t", "2", "-c:v", "libx264", "-c:s", "srt", "-metadata:s:s:0", "language=eng", "-metadata:s:s:1", "language=por", input}
	for i := range args {
		if args[i] == "-t" {
			args[i+1] = "70"
		}
	}
	if output, err := exec.Command("ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	for _, track := range []struct {
		language string
		index    int
		want     string
		other    string
	}{
		{"eng", 1, "English fixture", "Legenda portuguesa"},
		{"por", 2, "Legenda portuguesa", "English fixture"},
	} {
		t.Run(track.language, func(t *testing.T) {
			output, err := exec.Command("ffmpeg", subtitleExtractionArgs(input, track.index)...).CombinedOutput()
			if err != nil {
				t.Fatalf("extraction: %v %s", err, output)
			}
			if !strings.HasPrefix(string(output), "WEBVTT") || !strings.Contains(string(output), track.want) || strings.Contains(string(output), track.other) {
				t.Fatalf("incorrect extracted track: %s", output)
			}
			window, err := exec.Command("ffmpeg", subtitleWindowExtractionArgs(input, track.index, 60)...).CombinedOutput()
			// FFmpeg preserves absolute timestamps; the Service applies the offset.
			if err != nil || !strings.Contains(string(window), "01:05.000 --> 01:06.000") || !strings.Contains(string(window), track.want+" late") {
				t.Fatalf("raw window must preserve episode timestamps: %v %s", err, window)
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) { return input, nil }, func(string) {})
			cachedWindow, err := extractCachedSubtitleWindow(ctx, cache, "fixture", track.index, 60)
			if err != nil || !strings.Contains(cachedWindow, "00:05.000 --> 00:06.000") || strings.Contains(cachedWindow, track.other) {
				t.Fatalf("Service cached window: %v %s", err, cachedWindow)
			}
		})
	}
}

func TestSubtitleSelectionUsesProbedStreamIndex(t *testing.T) {
	audio := ffprobeStream{Index: 1, CodecType: "audio"}
	audio.Tags.Language = "por"
	english := ffprobeStream{Index: 2, CodecType: "subtitle"}
	english.Tags.Language = "eng"
	portuguese := ffprobeStream{Index: 4, CodecType: "subtitle"}
	portuguese.Tags.Language = "por"
	streams := []ffprobeStream{audio, english, portuguese}
	index, ok := subtitleStreamIndex(streams, "Português (Brasil)")
	if !ok || index != 4 {
		t.Fatalf("selected %d %v", index, ok)
	}
	if _, ok := subtitleStreamIndex(streams, "jpn"); ok {
		t.Fatal("missing language must not fall back to another track")
	}
	if _, ok := subtitleStreamIndex(streams, ""); ok {
		t.Fatal("empty language accepted")
	}
	args := strings.Join(subtitleExtractionArgs("fixture.mkv", index), " ")
	if !strings.Contains(args, "-map 0:4 ") {
		t.Fatal(args)
	}
}
