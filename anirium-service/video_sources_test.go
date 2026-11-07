package main

import (
	"reflect"
	"testing"
)

func TestSustainableSourcePriorityUsesMeasuredPayloadAndActualFileSize(t *testing.T) {
	mediaSourceMu.Lock()
	previous := mediaSources
	hashes := map[string]string{"slow": "1111111111111111111111111111111111111111", "fast": "2222222222222222222222222222222222222222", "unknown": "3333333333333333333333333333333333333333"}
	mediaSources = map[string]mediaSource{}
	streams := map[string][]ffprobeStream{}
	formats := map[string]ffprobeOutput{}
	for id, hash := range hashes {
		bytes := int64(10000)
		if id == "fast" {
			bytes = 20000
		}
		mediaSources[id] = mediaSource{Magnet: "magnet:?xt=urn:btih:" + hash, FileBytes: bytes}
		streams[id] = []ffprobeStream{{CodecType: "video", Height: 720}}
		probe := ffprobeOutput{}
		probe.Format.Duration = "100"
		probe.Format.StartTime = "0"
		formats[id] = probe
	}
	mediaSourceMu.Unlock()
	defer func() { mediaSourceMu.Lock(); mediaSources = previous; mediaSourceMu.Unlock() }()
	capacity := transferCapacity{SwarmRates: map[string]transferCapacity{hashes["slow"]: {BytesPerSecond: 50, Samples: 3}, hashes["fast"]: {BytesPerSecond: 300, Samples: 3}}}
	got := orderedSustainableVideoSources([]string{"slow", "unknown", "fast"}, streams, formats, "720p", capacity)
	if !reflect.DeepEqual(got, []string{"fast", "unknown", "slow"}) {
		t.Fatalf("unsustainable lightweight source won: %v", got)
	}
	// Insufficient observations cannot justify classifying a source as slow.
	capacity.SwarmRates[hashes["slow"]] = transferCapacity{BytesPerSecond: 50, Samples: 2}
	got = orderedSustainableVideoSources([]string{"slow", "unknown", "fast"}, streams, formats, "720p", capacity)
	if !reflect.DeepEqual(got, []string{"fast", "slow", "unknown"}) {
		t.Fatalf("unmeasured ordering: %v", got)
	}
}

func TestVideoSourceWeightPriorityKeepsOnlyEligibleQuality(t *testing.T) {
	mediaSourceMu.Lock()
	previous := mediaSources
	mediaSources = map[string]mediaSource{
		"heavy": {FileBytes: 900}, "light": {FileBytes: 100},
		"tie": {FileBytes: 100}, "low": {FileBytes: 1},
	}
	mediaSourceMu.Unlock()
	defer func() { mediaSourceMu.Lock(); mediaSources = previous; mediaSourceMu.Unlock() }()
	streams := map[string][]ffprobeStream{}
	for _, id := range []string{"heavy", "light", "tie", "unknown"} {
		streams[id] = []ffprobeStream{{CodecType: "video", Height: 1080}}
	}
	streams["low"] = []ffprobeStream{{CodecType: "video", Height: 480}}
	input := []string{"unknown", "heavy", "light", "low", "tie"}
	want := []string{"light", "tie", "heavy", "unknown"}
	if got := orderedVideoSources(input, streams, "1080p"); !reflect.DeepEqual(got, want) {
		t.Fatalf("priority: %v", got)
	}
	if input[0] != "unknown" {
		t.Fatal("selection mutated reference order")
	}
	if len(orderedVideoSources(input, streams, "4k")) != 0 {
		t.Fatal("invented higher quality")
	}
}

func TestVideoSourcesCannotUpscaleIntoHigherQualityVariants(t *testing.T) {
	for _, test := range []struct {
		height   int
		quality  string
		expected bool
	}{
		{720, "1080p", false}, {1080, "4k", false}, {2160, "4k", true},
		{1080, "720p", true}, {480, "480p", true}, {240, "480p", false}, {1080, "unknown", false},
	} {
		streams := []ffprobeStream{{CodecType: "audio"}, {CodecType: "video", Height: test.height}}
		if got := videoSupportsQuality(streams, test.quality); got != test.expected {
			t.Fatalf("height=%d quality=%s got=%v", test.height, test.quality, got)
		}
	}
	// Match the actual encoder's first-video mapping, not an unused second stream.
	if videoSupportsQuality([]ffprobeStream{{CodecType: "video", Height: 480}, {CodecType: "video", Height: 2160}}, "4k") {
		t.Fatal("unused video stream inflated quality")
	}
	if videoSupportsQuality(nil, "720p") {
		t.Fatal("unprobed source advertised as compatible")
	}
}
