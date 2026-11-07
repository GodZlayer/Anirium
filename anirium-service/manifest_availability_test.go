package main

import "testing"

func TestStalledWindowCannotExposePreviousReadyPlaylist(t *testing.T) {
	previous := MixVariant{Status: "ready", PlaylistURL: "/old/index.m3u8", BufferPercent: 90}
	current := stalledWindowVariant(previous)
	if current.Status != "stalled" || current.PlaylistURL != "" || current.BufferPercent != 0 || !current.ProcessingFailed {
		t.Fatalf("failed window advertised old media: %+v", current)
	}
	if previous.Status != "ready" || previous.PlaylistURL == "" {
		t.Fatal("old snapshot mutated")
	}
	if status, _ := manifestAvailability([]MixVariant{current}, true); status != "stalled" {
		t.Fatal("failure hidden")
	}
}

func TestPreparingWindowSupersedesStaleVariant(t *testing.T) {
	for _, status := range []string{"ready", "stalled"} {
		previous := MixVariant{Status: status, PlaylistURL: "/old/index.m3u8", BufferPercent: 90, ProcessingFailed: true}
		current := preparingWindowVariant(previous)
		if current.Status != "preparing" || current.PlaylistURL != "" || current.BufferPercent != 0 || current.ProcessingFailed {
			t.Fatalf("stale attempt leaked: %+v", current)
		}
		if previous.Status != status || previous.PlaylistURL == "" {
			t.Fatal("previous snapshot mutated")
		}
	}
}

func TestManifestAvailabilityDoesNotWaitForUnrequestedQualities(t *testing.T) {
	variants := []MixVariant{{Status: "ready", BufferPercent: 42}, {Status: "available"}, {Status: "preparing"}, {Status: "stalled"}}
	status, buffer := manifestAvailability(variants)
	if status != "ready" || buffer != 42 {
		t.Fatalf("playable output hidden by other qualities: %s %v", status, buffer)
	}
	status, buffer = manifestAvailability(variants[1:])
	if status != "preparing" || buffer != 0 {
		t.Fatalf("failed alternative hid pending output: %s %v", status, buffer)
	}
	status, buffer = manifestAvailability(nil)
	if status != "preparing" || buffer != 0 {
		t.Fatal("empty inventory claimed playable")
	}
}

func TestManifestAvailabilityOnlyStallsWhenNoAlternativeIsPending(t *testing.T) {
	for _, pending := range []string{"available", "preparing"} {
		for _, variants := range [][]MixVariant{
			{{Status: "stalled"}, {Status: pending}},
			{{Status: pending}, {Status: "stalled"}},
		} {
			if status, _ := manifestAvailability(variants, true); status != "preparing" {
				t.Fatalf("pending %s hidden: %s", pending, status)
			}
		}
	}
	if status, _ := manifestAvailability([]MixVariant{{Status: "stalled"}}, true); status != "stalled" {
		t.Fatal("terminal failure must remain visible")
	}
}

func TestFinishedDiscoveryWithoutVideoDoesNotWaitForever(t *testing.T) {
	if status, _ := manifestAvailability(nil, false); status != "preparing" {
		t.Fatal("in-flight discovery was declared failed")
	}
	if status, buffer := manifestAvailability(nil, true); status != "stalled" || buffer != 0 {
		t.Fatal("completed empty discovery still waits for media")
	}
	if status, _ := manifestAvailability([]MixVariant{{Status: "ready"}}, true); status != "ready" {
		t.Fatal("completed discovery hid playable video")
	}
}
