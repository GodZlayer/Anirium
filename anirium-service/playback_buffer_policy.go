package main

import (
	"math"
	"strconv"
)

type preparedPlaybackInterval struct{ Start, End float64 }

// Caller supplies ordered, successful coverage for one selected track only.
// A gap cannot be filled by adding durations from disconnected windows.
func preparedPlaybackAhead(intervals []preparedPlaybackInterval, position float64) float64 {
	if !isFiniteWindowPosition(position) {
		return 0
	}
	end := position
	started := false
	for _, interval := range intervals {
		if !isFiniteWindowPosition(interval.Start) || !isFiniteWindowPosition(interval.End) || interval.End <= interval.Start {
			return 0
		}
		if interval.End <= position {
			continue
		}
		if !started {
			if interval.Start > position {
				return 0
			}
			started = true
		} else if interval.Start > end {
			break
		}
		if interval.End > end {
			end = interval.End
		}
	}
	return end - position
}

func preparedSegmentIntervals(parts []continuousWindowPart) ([]preparedPlaybackInterval, error) {
	if _, err := continuousWindowPlaylist(parts, false); err != nil {
		return nil, err
	}
	intervals := make([]preparedPlaybackInterval, 0, len(parts))
	for _, part := range parts {
		end := part.Start
		for _, segment := range part.Segments {
			duration, _ := strconv.ParseFloat(segment.duration, 64)
			end += duration
		}
		intervals = append(intervals, preparedPlaybackInterval{Start: part.Start, End: end})
	}
	return intervals, nil
}

const minimumPlaybackBufferSeconds = 30.0

// Ahead values describe contiguous prepared coverage, not torrent bytes or
// the timestamp of the last subtitle cue. Successfully extracted silence is
// subtitle coverage too. Missing/disabled tracks do not constrain playback.
type playbackBufferCoverage struct {
	VideoAhead       float64 `json:"videoAhead"`
	AudioAhead       float64 `json:"audioAhead"`
	SubtitleAhead    float64 `json:"subtitleAhead"`
	AudioRequired    bool    `json:"audioRequired"`
	SubtitleRequired bool    `json:"subtitleRequired"`
}

type playbackBufferVerdict struct {
	TargetSeconds   float64 `json:"targetSeconds"`
	CommonAhead     float64 `json:"commonAhead"`
	Ready           bool    `json:"ready"`
	ContinueSeconds float64 `json:"continueSeconds"`
	ContinueReady   bool    `json:"continueReady"`
}

func assessPlaybackBuffer(coverage playbackBufferCoverage, remaining float64, requested ...float64) playbackBufferVerdict {
	target := minimumPlaybackBufferSeconds
	if len(requested) > 0 && requested[0] == 60 {
		target = 60
	}
	// An unknown episode duration must never bypass the initial reserve.
	if !math.IsNaN(remaining) && !math.IsInf(remaining, 0) && remaining >= 0 && remaining < target {
		target = remaining
	}
	validAhead := func(value float64) float64 {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return 0
		}
		return value
	}
	common := validAhead(coverage.VideoAhead)
	if coverage.AudioRequired {
		common = math.Min(common, validAhead(coverage.AudioAhead))
	}
	if coverage.SubtitleRequired {
		common = math.Min(common, validAhead(coverage.SubtitleAhead))
	}
	continuation := math.Min(target, minimumPlaybackBufferSeconds)
	return playbackBufferVerdict{TargetSeconds: target, CommonAhead: common, Ready: common >= target, ContinueSeconds: continuation, ContinueReady: common >= continuation}
}
