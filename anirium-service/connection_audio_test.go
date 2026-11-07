package main

import "testing"

func TestPublishedAudioSelectionCannotBeReassignedByLateProbe(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldFrozen, oldTracks, oldLanguages := audioSelectionFrozen, selectedAudioCandidates, currentMixAudios
	defer func() {
		audioSelectionFrozen, selectedAudioCandidates, currentMixAudios = oldFrozen, oldTracks, oldLanguages
	}()
	audioSelectionFrozen = true
	selectedAudioCandidates = []AudioCandidate{{Language: "jpn", Source: "published", Channels: 2}}
	currentMixAudios = []string{"jpn"}
	refreshAudioSelectionLocked()
	if len(selectedAudioCandidates) != 1 || selectedAudioCandidates[0].Source != "published" || len(currentMixAudios) != 1 || currentMixAudios[0] != "jpn" {
		t.Fatal("published track identity changed")
	}
}

func TestConnectionAudioSelectionAndPoolRespectMeasuredBudget(t *testing.T) {
	inputs := []AudioCandidate{
		{Language: "jpn", Source: "small", BitRate: 128000, Channels: 2, Codec: "aac"},
		{Language: "jpn", Source: "better", BitRate: 256000, Channels: 2, Codec: "aac"},
		{Language: "jpn", Source: "heavy", BitRate: 1500000, Channels: 2, Codec: "flac"},
		{Language: "eng", Source: "only", BitRate: 384000, Channels: 2, Codec: "aac"},
	}
	policy := connectionAudioPolicy(transferCapacity{Samples: 3, BytesPerSecond: 200000})
	tracks := selectConnectionAudioCandidates(inputs, policy)
	if len(tracks) != 2 || tracks[0].Source != "heavy" || tracks[1].Source != "only" {
		t.Fatalf("bad language selection: %+v", tracks)
	}
	pool := connectionAudioPool(tracks[0], inputs)
	if len(pool) != 3 || pool[1].Source != "better" || pool[2].Source != "small" {
		t.Fatalf("compatible transcoded fallback lost: %+v", pool)
	}
	output := audioOutputFor(tracks[0], policy)
	if output.BitRate > policy.MaxBitRate {
		t.Fatalf("delivered output exceeds budget: %+v", output)
	}
	if connectionAudioPolicy(transferCapacity{Samples: 2, BytesPerSecond: 100}).MaxBitRate != 0 {
		t.Fatal("unreliable startup measurement constrained quality")
	}
	fast := connectionAudioPolicy(transferCapacity{Samples: 3, BytesPerSecond: 2000000})
	if selectConnectionAudioCandidates(inputs, fast)[0].Source != "heavy" {
		t.Fatal("maximum permitted quality not selected")
	}
}
