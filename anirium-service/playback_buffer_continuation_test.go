package main

import "testing"

func TestAdaptiveBufferSeparatesStartAndContinuation(t *testing.T) {
	coverage := playbackBufferCoverage{VideoAhead: 59.7, AudioAhead: 59.7, SubtitleAhead: 59.7, AudioRequired: true, SubtitleRequired: true}
	verdict := assessPlaybackBuffer(coverage, 300, 60)
	if verdict.Ready || !verdict.ContinueReady || verdict.TargetSeconds != 60 || verdict.ContinueSeconds != 30 {
		t.Fatal("adaptive startup and continuation reserves were not separated")
	}
	coverage.SubtitleAhead = 29.9
	if assessPlaybackBuffer(coverage, 300, 60).ContinueReady {
		t.Fatal("continuation bypassed the selected subtitle reserve")
	}
	coverage.SubtitleAhead = 59.7
	verdict = assessPlaybackBuffer(coverage, 15, 60)
	if !verdict.Ready || !verdict.ContinueReady || verdict.TargetSeconds != 15 || verdict.ContinueSeconds != 15 {
		t.Fatal("completed tail retained an impossible reserve")
	}
}
