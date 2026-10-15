package main

import "testing"

func TestConcurrentAudioLanguagesShareConnectionBudget(t *testing.T) {
	policy := AudioPolicy{MaxBitRate: 192000}
	shared := sharedAudioPolicy(policy, 3)
	if shared.MaxBitRate != 64000 || policy.MaxBitRate != 192000 {
		t.Fatal("connection budget was multiplied or original mutated")
	}
	candidate := AudioCandidate{Channels: 2, SampleRate: 48000, Codec: "flac"}
	output := audioOutputFor(candidate, shared)
	if output.BitRate*3 > policy.MaxBitRate {
		t.Fatalf("concurrent output exceeds budget: %+v", output)
	}
	if sharedAudioPolicy(AudioPolicy{}, 3).MaxBitRate != 0 {
		t.Fatal("invented budget without measurements")
	}
	if sharedAudioPolicy(policy, 1) != policy {
		t.Fatal("single language budget reduced")
	}
}
