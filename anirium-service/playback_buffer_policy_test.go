package main

import (
	"math"
	"testing"
)

func TestSessionReserveCanRequireSixtyJointSeconds(t *testing.T) {
	coverage := playbackBufferCoverage{VideoAhead: 72, AudioAhead: 59, AudioRequired: true}
	if verdict := assessPlaybackBuffer(coverage, 300, 60); verdict.Ready || verdict.TargetSeconds != 60 {
		t.Fatalf("reserve bypassed: %+v", verdict)
	}
	coverage.AudioAhead = 60
	if !assessPlaybackBuffer(coverage, 300, 60).Ready {
		t.Fatal("sixty prepared seconds rejected")
	}
	if verdict := assessPlaybackBuffer(coverage, 15, 60); !verdict.Ready || verdict.TargetSeconds != 15 {
		t.Fatal("tail requires nonexistent media")
	}
}

func TestPreparedBufferUsesContiguousCoverageNotTotalDuration(t *testing.T) {
	intervals := []preparedPlaybackInterval{{0, 24}, {24, 48}, {60, 84}}
	for _, sample := range []struct{ position, ahead float64 }{{0, 48}, {18, 30}, {19, 29}, {48, 0}, {65, 19}} {
		if got := preparedPlaybackAhead(intervals, sample.position); got != sample.ahead {
			t.Fatalf("position%v: got%v want%v", sample.position, got, sample.ahead)
		}
	}
	parts := []continuousWindowPart{{ID: "window-1-1-video", Start: 0, Segments: []hlsSegment{{path: "segment.ts", duration: "4", size: 10}}}}
	actual, err := preparedSegmentIntervals(parts)
	if err != nil || preparedPlaybackAhead(actual, 1) != 3 {
		t.Fatal("segment coverage incorrect")
	}
	parts[0].Segments[0].size = 0
	if _, err := preparedSegmentIntervals(parts); err == nil {
		t.Fatal("incomplete segment counted")
	}
	// Extracted subtitle silence covers its interval even without any cue.
	quiet := []preparedPlaybackInterval{{0, 45}}
	verdict := assessPlaybackBuffer(playbackBufferCoverage{VideoAhead: 48, AudioAhead: 32, SubtitleAhead: preparedPlaybackAhead(quiet, 0), AudioRequired: true, SubtitleRequired: true}, 300)
	if !verdict.Ready || verdict.CommonAhead != 32 {
		t.Fatal("quiet subtitle interval blocked playback")
	}
}

func TestPlaybackBufferRequiresThirtySecondsOfAllSelectedTracks(t *testing.T) {
	coverage := playbackBufferCoverage{VideoAhead: 45, AudioAhead: 35, SubtitleAhead: 29.99, AudioRequired: true, SubtitleRequired: true}
	if assessPlaybackBuffer(coverage, 300).Ready {
		t.Fatal("subtitle coverage below30 accepted")
	}
	coverage.SubtitleAhead = 30
	if result := assessPlaybackBuffer(coverage, 300); !result.Ready || result.CommonAhead != 30 || result.TargetSeconds != 30 {
		t.Fatalf("aligned reserve: %+v", result)
	}
	coverage.AudioAhead = 10
	if assessPlaybackBuffer(coverage, 300).Ready {
		t.Fatal("insufficient audio accepted")
	}
	if !assessPlaybackBuffer(coverage, 10).Ready {
		t.Fatal("episode tail blocked")
	}
	coverage.AudioRequired, coverage.SubtitleRequired = false, false
	if !assessPlaybackBuffer(coverage, 300).Ready {
		t.Fatal("absent tracks blocked video")
	}
	coverage.VideoAhead = math.NaN()
	if assessPlaybackBuffer(coverage, 300).Ready {
		t.Fatal("invalid coverage accepted")
	}
	coverage.VideoAhead = 24
	for _, remaining := range []float64{-1, math.NaN(), math.Inf(1)} {
		if assessPlaybackBuffer(coverage, remaining).Ready {
			t.Fatal("unknown duration bypassed reserve")
		}
	}
}
