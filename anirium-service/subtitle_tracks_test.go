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

func TestSubtitleTrackIDsStayStableAcrossActiveLinksReorderAndFreeze(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	oldLinks, oldStreams, oldFormats, oldSidecars := activeLinks, probedStreams, probedFormats, probedSidecars
	oldQualities, oldSubs, oldExternal, oldInputs := currentMixQualities, currentMixSubs, externalSubtitles, playbackInputs
	gen := playbackGeneration
	defer func() {
		activeLinks, probedStreams, probedFormats, probedSidecars = oldLinks, oldStreams, oldFormats, oldSidecars
		currentMixQualities, currentMixSubs, externalSubtitles, playbackInputs = oldQualities, oldSubs, oldExternal, oldInputs
		swarmMu.Unlock()
	}()

	playbackInputs = newMediaInputCache(ctx, nil)
	src0 := fmt.Sprintf("media-%d-0", gen)
	src1 := fmt.Sprintf("media-%d-1", gen)
	cut := fmt.Sprintf("media-%d-2", gen)

	engSub := ffprobeStream{Index: 2, CodecType: "subtitle", CodecName: "subrip"}
	engSub.Tags.Language = "eng"
	porSub := ffprobeStream{Index: 3, CodecType: "subtitle", CodecName: "ass"}
	porSub.Tags.Language = "pt-BR"

	probe0 := ffprobeOutput{Streams: []ffprobeStream{{Index: 0, CodecType: "video", Height: 1080}, engSub}}
	probe0.Format.Duration = "1440"
	probe1 := ffprobeOutput{Streams: []ffprobeStream{{Index: 0, CodecType: "video", Height: 720}, porSub}}
	probe1.Format.Duration = "1440"
	probeCut := ffprobeOutput{Streams: []ffprobeStream{{Index: 0, CodecType: "video", Height: 1080}}}
	probeCut.Format.Duration = "1400"

	probedFormats = map[string]ffprobeOutput{src0: probe0, src1: probe1, cut: probeCut}
	probedStreams = map[string][]ffprobeStream{src0: probe0.Streams, src1: probe1.Streams, cut: probeCut.Streams}
	probedSidecars = map[string][]string{}
	externalSubtitles = nil

	activeLinks = []string{cut, src0, src1}
	before := subtitleTracksLocked()

	activeLinks = []string{src1, cut, src0}
	reordered := subtitleTracksLocked()

	playbackInputs.rememberVideoProducer("720p", src1)
	freezeCompatibleSourceSetLocked()
	afterFreeze := manifestSubtitleTracksLocked()

	wantEngID := fmt.Sprintf("subtitle-%d-0-2", gen)
	wantPorID := fmt.Sprintf("subtitle-%d-1-3", gen)
	checkPair := func(label string, list []SubtitleTrack) {
		foundEng, foundPor := false, false
		for _, track := range list {
			if track.ID == wantEngID && track.Language == "eng" {
				foundEng = true
			}
			if track.ID == wantPorID && track.Language == "por" {
				foundPor = true
			}
		}
		if !foundEng || !foundPor {
			t.Fatalf("%s lost stable IDs: got %+v (want %s and %s)", label, list, wantEngID, wantPorID)
		}
	}
	checkPair("before", before)
	checkPair("reordered", reordered)
	checkPair("afterFreeze", afterFreeze)
	if len(activeLinks) != 2 || activeLinks[0] != src1 || activeLinks[1] != src0 {
		t.Fatalf("pinned video producer not retained during freeze: %v", activeLinks)
	}
	for _, track := range afterFreeze {
		if track.Kind != "embedded" {
			t.Fatalf("missing track kind: %+v", track)
		}
		if track.ID == wantPorID && !track.Primary {
			t.Fatalf("expected active video producer subtitle to be marked Primary: %+v", track)
		}
	}
}

func TestSelectPriorityMagnetsIncludesMultiSubUpToLimit(t *testing.T) {
	magnets := []string{
		"magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=Seed1",
		"magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&dn=Seed2",
		"magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=PlainReleaseA",
		"magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=PlainReleaseB",
		"magnet:?xt=urn:btih:3333333333333333333333333333333333333333&dn=Erai-raws.Ep21",
		"magnet:?xt=urn:btih:4444444444444444444444444444444444444444&dn=PlainReleaseC",
		"magnet:?xt=urn:btih:5555555555555555555555555555555555555555&dn=Fansub.PT-BR.Ep21",
		"magnet:?xt=urn:btih:6666666666666666666666666666666666666666&dn=MultiSub.Ep21",
		"magnet:?xt=urn:btih:7777777777777777777777777777777777777777&dn=PlainReleaseD",
		"magnet:?xt=urn:btih:8888888888888888888888888888888888888888&dn=ToonsHub.Multi.Ep21",
	}
	got := selectPriorityMagnets(magnets, 8)
	if len(got) != 8 {
		t.Fatalf("expected 8 magnets, got %d", len(got))
	}
	for idx, wantSub := range []string{"Seed1", "Seed2", "Erai-raws", "PT-BR", "MultiSub", "ToonsHub"} {
		if !strings.Contains(got[idx], wantSub) {
			t.Fatalf("slot %d missing %s: %v", idx, wantSub, got)
		}
	}
}

func TestManifestSubtitlesDeduplicateNonPrimaryAndPrioritizePrimary(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	swarmMu.Lock()
	oldLinks, oldStreams, oldFormats, oldSidecars := activeLinks, probedStreams, probedFormats, probedSidecars
	oldQualities, oldSubs, oldExternal, oldInputs := currentMixQualities, currentMixSubs, externalSubtitles, playbackInputs
	gen := playbackGeneration
	mediaSourceMu.Lock()
	oldSources := mediaSources
	src0 := fmt.Sprintf("media-%d-0", gen)
	src1 := fmt.Sprintf("media-%d-1", gen)
	src2 := fmt.Sprintf("media-%d-2", gen)
	mediaSources = map[string]mediaSource{
		src0: {FileBytes: 900},
		src1: {FileBytes: 200},
		src2: {FileBytes: 400},
	}
	mediaSourceMu.Unlock()
	defer func() {
		activeLinks, probedStreams, probedFormats, probedSidecars = oldLinks, oldStreams, oldFormats, oldSidecars
		currentMixQualities, currentMixSubs, externalSubtitles, playbackInputs = oldQualities, oldSubs, oldExternal, oldInputs
		swarmMu.Unlock()
		mediaSourceMu.Lock()
		mediaSources = oldSources
		mediaSourceMu.Unlock()
	}()

	mkStream := func(index int, lang, title string) ffprobeStream {
		s := ffprobeStream{Index: index, CodecType: "subtitle", CodecName: "subrip"}
		s.Tags.Language = lang
		s.Tags.Title = title
		return s
	}

	playbackInputs = newMediaInputCache(ctx, nil)
	playbackInputs.rememberVideoProducer("1080p", src0)

	probedStreams = map[string][]ffprobeStream{
		src0: {
			{Index: 0, CodecType: "video", Height: 1080},
			mkStream(3, "eng", ""),
			mkStream(4, "eng", "Forced"),
			mkStream(26, "por", "Brazil"),
			mkStream(27, "por", "Portugal"),
		},
		src1: {
			{Index: 0, CodecType: "video", Height: 720},
			mkStream(2, "eng", "AMZN_English"),
			mkStream(3, "por", "AMZN_Portuguese(Brazil)"),
			mkStream(11, "por", "AMZN_Portuguese"),
			mkStream(12, "por", "Brazilian (Forced)"),
			mkStream(14, "spa", "AMZN_Spanish(Latin_America)"),
		},
		src2: {
			{Index: 0, CodecType: "video", Height: 720},
			mkStream(3, "por", "Brazil"),
			mkStream(4, "eng", ""),
			mkStream(5, "spa", "Latin America"),
			mkStream(6, "fra", ""),
		},
	}
	probedFormats = map[string]ffprobeOutput{
		src0: {Streams: probedStreams[src0]},
		src1: {Streams: probedStreams[src1]},
		src2: {Streams: probedStreams[src2]},
	}
	probedSidecars = map[string][]string{}
	externalSubtitles = []ProviderSubtitle{{Language: "ara", Title: "Arabic Ext", URL: "https://example.invalid/ar.srt"}}
	activeLinks = []string{src0, src1, src2}

	got := manifestSubtitleTracksLocked()
	if len(got) != 7 {
		t.Fatalf("expected 7 deduplicated tracks (4 primary + 1 external + 2 missing secondary), got %d: %+v", len(got), got)
	}
	for i := 0; i < 4; i++ {
		if !got[i].Primary || got[i].Source != src0 {
			t.Fatalf("track %d should be primary from %s: %+v", i, src0, got[i])
		}
	}
	if got[4].Kind != "external" || got[4].Language != "ara" {
		t.Fatalf("expected external ara track at index 4: %+v", got[4])
	}
	wantSecondary := map[string]string{
		fmt.Sprintf("subtitle-%d-1-14", gen): "spa",
		fmt.Sprintf("subtitle-%d-2-6", gen):  "fra",
	}
	for _, tr := range got[5:] {
		if tr.Primary {
			t.Fatalf("secondary track marked Primary: %+v", tr)
		}
		if wantSecondary[tr.ID] != tr.Language {
			t.Fatalf("unexpected secondary track %+v (want one of %v)", tr, wantSecondary)
		}
		delete(wantSecondary, tr.ID)
	}
	if len(wantSecondary) != 0 {
		t.Fatalf("missing expected secondary tracks: %v", wantSecondary)
	}
}
