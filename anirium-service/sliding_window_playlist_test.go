package main

import (
	"strings"
	"testing"
)

func TestSlidingPlaylistEvictionPreservesSequenceAndDiscontinuities(t *testing.T) {
	parts := []continuousWindowPart{
		{ID: "window-5-1-video", Start: 0, Segments: []hlsSegment{{path: "s0.ts", duration: "4", size: 1}, {path: "s1.ts", duration: "4", size: 1}}},
		{ID: "window-5-2-video", Start: 8, Segments: []hlsSegment{{path: "s0.ts", duration: "4", size: 1}}},
		{ID: "window-5-3-video", Start: 12, Segments: []hlsSegment{{path: "s0.ts", duration: "4", size: 1}}},
	}
	cursor := slidingPlaylistCursor{}
	initial, err := slidingWindowPlaylist(parts, false, cursor)
	if err != nil || strings.Contains(initial, "PLAYLIST-TYPE") || strings.Contains(initial, "ENDLIST") {
		t.Fatal("not a renewable sliding playlist")
	}
	cursor, err = cursor.afterEviction(parts[:1])
	if err != nil || cursor.MediaSequence != 2 || cursor.DiscontinuitySequence != 1 {
		t.Fatal("eviction cursor incorrect")
	}
	next, err := slidingWindowPlaylist(parts[1:], false, cursor)
	if err != nil || !strings.Contains(next, "#EXT-X-MEDIA-SEQUENCE:2\n#EXT-X-DISCONTINUITY-SEQUENCE:1\n") || strings.Contains(next, "window-5-1") || strings.Count(next, "#EXT-X-DISCONTINUITY\n") != 1 {
		t.Fatal("sliding sequence regressed")
	}
	cursor, err = cursor.afterEviction(parts[1:2])
	if err != nil || cursor.MediaSequence != 3 || cursor.DiscontinuitySequence != 2 {
		t.Fatal("second eviction incorrect")
	}
	final, err := slidingWindowPlaylist(parts[2:], true, cursor)
	if err != nil || !strings.HasSuffix(final, "#EXT-X-ENDLIST\n") {
		t.Fatal("final segment not terminated")
	}
	_, err = (slidingPlaylistCursor{MediaSequence: ^uint64(0)}).afterEviction(parts[:1])
	if err == nil {
		t.Fatal("sequence wrapped")
	}
}
