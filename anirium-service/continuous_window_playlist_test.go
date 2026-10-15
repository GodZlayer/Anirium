package main

import (
	"fmt"
	"strings"
	"testing"
)

func TestContinuousWindowPlaylistExtendsWithoutPrematureEnd(t *testing.T) {
	parts := []continuousWindowPart{
		{ID: "window-1-1-video", Start: 0, Segments: []hlsSegment{{path: "private/segment-000000.ts", duration: "4", size: 10}}},
		{ID: "window-1-2-video", Start: 4, Segments: []hlsSegment{{path: "other/segment-000000.ts", duration: "4", size: 10}}},
	}
	first, err := continuousWindowPlaylist(parts[:1], false)
	if err != nil || strings.Contains(first, "ENDLIST") {
		t.Fatalf("first playlist: %v", err)
	}
	extended, err := continuousWindowPlaylist(parts, false)
	if err != nil || !strings.HasPrefix(extended, first) || strings.Count(extended, "#EXT-X-DISCONTINUITY\n") != 1 || strings.Contains(extended, "private/") || strings.Contains(extended, "other/") {
		t.Fatalf("extension: %v %s", err, extended)
	}
	final, err := continuousWindowPlaylist(parts, true)
	if err != nil || !strings.HasSuffix(final, "#EXT-X-ENDLIST\n") {
		t.Fatal("actual end not published")
	}
	authorized := authorizePlaylist(extended, "fixture-ticket")
	if strings.Count(authorized, "playbackTicket=fixture-ticket") != 2 {
		t.Fatal("segment authorization lost")
	}
	parts[1].Start = 8
	if _, err := continuousWindowPlaylist(parts, false); err == nil {
		t.Fatal("gap accepted")
	}
	parts[1].Start = 4
	parts[1].ID = "provider-secret"
	if _, err := continuousWindowPlaylist(parts, false); err == nil {
		t.Fatal("unsafe identity accepted")
	}
}

func TestContinuousAudioPaddingDoesNotAccumulateAcrossWindows(t *testing.T) {
	// Durations observed in the real AAC window that failed after ~15s.
	durations := []string{"4.017056", "3.993833", "3.993833", "4.017044", "3.993833", "3.993833", "0.023222"}
	parts := make([]continuousWindowPart, 4)
	for i := range parts {
		parts[i] = continuousWindowPart{ID: fmt.Sprintf("window-1-%d-audio-0", i+1), Start: float64(i * 24)}
		for j, duration := range durations {
			parts[i].Segments = append(parts[i].Segments, hlsSegment{path: fmt.Sprintf("audio-%06d.ts", i*6+j), duration: duration, size: 10})
		}
	}
	playlist, err := slidingWindowPlaylist(parts, false, slidingPlaylistCursor{})
	if err != nil || strings.Count(playlist, "#EXTINF:") != 28 || strings.Count(playlist, "#EXT-X-DISCONTINUITY\n") != 3 {
		t.Fatalf("independent AAC padding rejected: %v", err)
	}
	cursor, err := (slidingPlaylistCursor{}).afterEviction(parts[:2])
	if err != nil || cursor.MediaSequence != 14 || cursor.DiscontinuitySequence != 2 {
		t.Fatalf("audio cursor must count actual segments: %+v %v", cursor, err)
	}
	parts[2].Start += 0.2
	if _, err := slidingWindowPlaylist(parts, false, slidingPlaylistCursor{}); err == nil {
		t.Fatal("real disconnected audio window accepted")
	}
}

func TestContinuousEpisodeAnchorsSurviveEvictionAndPadding(t *testing.T) {
	parts := []continuousWindowPart{
		{ID: "window-1-8-video", Start: 188, Segments: []hlsSegment{{path: "segment-000047.ts", duration: "24.023", size: 10}}},
		{ID: "window-1-9-video", Start: 212.023, Segments: []hlsSegment{{path: "segment-000053.ts", duration: "4", size: 10}}},
	}
	// Use valid per-segment lengths; the first window has AAC-sized padding.
	parts[0].Segments = nil
	for i := 0; i < 6; i++ {
		parts[0].Segments = append(parts[0].Segments, hlsSegment{path: fmt.Sprintf("segment-%06d.ts", 47+i), duration: "4", size: 10})
	}
	parts[0].Segments = append(parts[0].Segments, hlsSegment{path: "segment-000099.ts", duration: "0.023", size: 10})
	playlist, err := continuousWindowPlaylist(parts, true)
	if err != nil || !strings.Contains(playlist, "#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:03:08.000Z") || !strings.Contains(playlist, "#EXT-X-DISCONTINUITY\n#EXT-X-PROGRAM-DATE-TIME:2000-01-01T00:03:32.023Z") {
		t.Fatalf("episode anchors missing: %v %s", err, playlist)
	}
	retained, err := slidingWindowPlaylist(parts[1:], true, slidingPlaylistCursor{MediaSequence: 7, DiscontinuitySequence: 1})
	if err != nil || !strings.Contains(retained, "2000-01-01T00:03:32.023Z") || strings.Contains(retained, "00:03:08.000Z") {
		t.Fatalf("eviction reset episode origin: %v %s", err, retained)
	}
}
