package main

import "testing"

func TestSessionOnlyMixesWhenVideoSourceLacksRequestedAudio(t *testing.T) {
	selected := []AudioCandidate{{Source: "other", Language: "jpn", Channels: 2, SampleRate: 48000}}
	inventory := []AudioCandidate{{Source: "video", Language: "eng", Channels: 2}, {Source: "video", Language: "jpn", Channels: 2, SampleRate: 48000}, {Source: "other", Language: "por", Channels: 2}}
	got := preferVideoSourceAudio(selected, inventory, "video")
	if len(got) != 1 || got[0].Source != "video" || got[0].Language != "jpn" {
		t.Fatal("unnecessary source mix or extra language")
	}
	if selected[0].Source != "other" {
		t.Fatal("selection inventory mutated")
	}
	selected[0].Language = "por"
	got = preferVideoSourceAudio(selected, inventory, "video")
	if len(got) != 1 || got[0].Source != "other" || got[0].Language != "por" {
		t.Fatal("missing language fallback lost")
	}
}
