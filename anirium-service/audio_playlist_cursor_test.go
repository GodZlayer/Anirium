package main

import "testing"

func TestAudioPlaylistCursorNeverUsesVideoSegmentCount(t *testing.T) {
	window := &playbackWindow{videoSegmentCount: 6, audioSegmentCounts: map[string]uint64{"audio-0": 7, "audio-1": 8}, audioPlaylistCursors: map[string]slidingPlaylistCursor{"audio-0": {MediaSequence: 10, DiscontinuitySequence: 2}, "audio-1": {MediaSequence: 12, DiscontinuitySequence: 2}}}
	next := nextAudioPlaylistCursors(window)
	if next["audio-0"].MediaSequence != 17 || next["audio-1"].MediaSequence != 20 || next["audio-0"].DiscontinuitySequence != 3 {
		t.Fatal("audio sequence conflated with video")
	}
	if window.audioPlaylistCursors["audio-0"].MediaSequence != 10 {
		t.Fatal("previous cursor mutated")
	}
	if _, exists := next["audio-2"]; exists {
		t.Fatal("missing track invented")
	}
}
