package main

import "testing"

func TestAudioPoolRetainsRankedSameLanguageChannelAlternatives(t *testing.T) {
	preferred := AudioCandidate{Language: "jpn", Source: "preferred", StreamIndex: 1, Channels: 2, Codec: "flac", SampleRate: 48000}
	lossy := AudioCandidate{Language: "jpn", Source: "lossy", StreamIndex: 2, Channels: 2, Codec: "aac", SampleRate: 48000}
	lossless := AudioCandidate{Language: "jpn", Source: "lossless", StreamIndex: 3, Channels: 2, Codec: "flac", SampleRate: 48000}
	otherLanguage := preferred
	otherLanguage.Source, otherLanguage.Language = "english", "eng"
	otherChannels := preferred
	otherChannels.Source, otherChannels.Channels = "surround", 6
	pool := compatibleAudioPool(preferred, []AudioCandidate{lossy, otherLanguage, preferred, lossless, otherChannels, lossy})
	if len(pool) != 3 || pool[0] != preferred || pool[1] != lossless || pool[2] != lossy {
		t.Fatalf("invalid audio pool: %+v", pool)
	}
}

func TestAudioSegmentPreferenceOverridesFileWeightAndRecoversMissingPiece(t *testing.T) {
	sources := [][]hlsSegment{
		{{duration: "4", size: 1000, path: "preferred"}},
		{{duration: "4", size: 10, path: "fallback-first"}, {duration: "4", size: 10, path: "fallback-second"}},
	}
	producers := []hlsProducer{{preference: 0}, {preference: 1}}
	first, ok := chooseProducerSegment(sources, producers, 0)
	if !ok || first.path != "preferred" {
		t.Fatal("smaller lower-quality audio displaced preferred source")
	}
	second, ok := chooseProducerSegment(sources, producers, 1)
	if !ok || second.path != "fallback-second" {
		t.Fatal("missing preferred piece did not use alternative")
	}
	// Video producers keep equal preference, retaining compressed-weight choice.
	producers[1].preference = 0
	first, ok = chooseProducerSegment(sources, producers, 0)
	if !ok || first.path != "fallback-first" {
		t.Fatal("video weight selection regressed")
	}
}
