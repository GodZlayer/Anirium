package main

import (
	"strings"
	"testing"
)

func TestExternalSubtitleExplicitBindingCannotEscapeSelectedSet(t *testing.T) {
	hash := strings.Repeat("ab", 20)
	tracks := subtitlesForSourceSet([]ProviderSubtitle{
		{Title: "matching", InfoHash: strings.ToUpper(hash)},
		{Title: "different", InfoHash: strings.Repeat("cd", 20)},
		{Title: "malformed", InfoHash: "not-a-hash"},
		{Title: "legacy"},
	}, map[string]bool{hash: true})
	if len(tracks) != 2 || tracks[0].Title != "matching" || tracks[1].Title != "legacy" {
		t.Fatalf("explicit subtitle release mismatch retained: %+v", tracks)
	}
}

func TestRetirementUsesFilteredOwnershipAfterDiscovery(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldMagnets, oldLinks, oldComplete := playbackMagnets, activeLinks, playbackDiscoveryComplete
	defer func() { playbackMagnets, activeLinks, playbackDiscoveryComplete = oldMagnets, oldLinks, oldComplete }()
	one := "magnet:?xt=urn:btih:" + strings.Repeat("ab", 20)
	two := "magnet:?xt=urn:btih:" + strings.Repeat("cd", 20)
	playbackMagnets, activeLinks = []string{one, two}, []string{two}
	playbackDiscoveryComplete = false
	if len(requiredCurrentPlaybackMagnetsLocked()) != 2 {
		t.Fatal("discovery ownership discarded too early")
	}
	playbackDiscoveryComplete = true
	dropped := unretainedMagnets([]string{one, two}, requiredCurrentPlaybackMagnetsLocked())
	if len(dropped) != 1 || dropped[0] != one {
		t.Fatalf("rejected torrent pinned after last old reader retired: %v", dropped)
	}
}

func TestCompatibleSourceSetRetainsReferenceAndExcludesDivergentTiming(t *testing.T) {
	makeProbe := func(duration, start string) ffprobeOutput {
		probe := ffprobeOutput{Streams: []ffprobeStream{{CodecType: "video", Height: 720}}}
		probe.Format.Duration, probe.Format.StartTime = duration, start
		return probe
	}
	probes := map[string]ffprobeOutput{
		"reference": makeProbe("1440", "0"), "compatible": makeProbe("1440.1", "0"),
		"cut": makeProbe("1420", "0"), "offset": makeProbe("1440", "2"), "unknown": makeProbe("N/A", "0"),
	}
	selected := compatibleSourceSet([]string{"reference", "cut", "offset", "unknown", "compatible"}, probes)
	if len(selected) != 2 || selected[0] != "reference" || selected[1] != "compatible" {
		t.Fatalf("divergent source entered reference set: %v", selected)
	}
	selected = compatibleSourceSet([]string{"unknown", "reference"}, probes)
	if len(selected) != 1 || selected[0] != "unknown" {
		t.Fatalf("unknown timing must retain only its own reference: %v", selected)
	}
}

func TestFilteredSourceSetRemovesPhantomManifestOptions(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldLinks, oldProbes, oldStreams, oldSidecars := activeLinks, probedFormats, probedStreams, probedSidecars
	oldQualities, oldSubs, oldExternal := currentMixQualities, currentMixSubs, externalSubtitles
	defer func() {
		activeLinks, probedFormats, probedStreams, probedSidecars = oldLinks, oldProbes, oldStreams, oldSidecars
		currentMixQualities, currentMixSubs, externalSubtitles = oldQualities, oldSubs, oldExternal
	}()
	first := ffprobeOutput{Streams: []ffprobeStream{{CodecType: "video", Height: 720}}}
	first.Format.Duration = "1440"
	other := ffprobeOutput{Streams: []ffprobeStream{{CodecType: "video", Height: 1080}}}
	other.Format.Duration = "1400"
	activeLinks = []string{"reference", "cut"}
	probedFormats = map[string]ffprobeOutput{"reference": first, "cut": other}
	probedStreams = map[string][]ffprobeStream{"reference": first.Streams, "cut": other.Streams}
	probedSidecars = map[string][]string{"reference": {"Episode.eng.srt"}, "cut": {"Episode.por.srt"}}
	externalSubtitles = nil
	currentMixSubs = []string{"eng", "por"}
	freezeCompatibleSourceSetLocked()
	if len(activeLinks) != 1 || len(currentMixQualities) != 1 || currentMixQualities[0] != "720p" || len(currentMixSubs) != 1 || currentMixSubs[0] != "eng" {
		t.Fatalf("excluded edition leaked options: sources=%v qualities=%v subtitles=%v", activeLinks, currentMixQualities, currentMixSubs)
	}
}
