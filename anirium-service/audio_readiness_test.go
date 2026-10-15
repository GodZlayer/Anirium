package main

import "testing"

func TestAudioPreparationDistinguishesPendingFailedAndSilentContent(t *testing.T) {
	cases := []struct {
		tracks []AudioTrack
		status string
	}{
		{nil, "ready"},
		{[]AudioTrack{{Status: "preparing"}}, "preparing"},
		{[]AudioTrack{{Status: "stalled"}}, "stalled"},
		{[]AudioTrack{{Status: "stalled"}, {Status: "preparing"}}, "preparing"},
		{[]AudioTrack{{Status: "stalled"}, {Status: "ready", PlaylistURL: "/audio/index.m3u8"}}, "ready"},
		{[]AudioTrack{{Status: "ready"}}, "preparing"},
	}
	for _, fixture := range cases {
		if actual := audioPreparationStatus(fixture.tracks); actual != fixture.status {
			t.Fatalf("audio state %v: got %s want %s", fixture.tracks, actual, fixture.status)
		}
	}
}
