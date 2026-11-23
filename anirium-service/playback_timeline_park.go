package main

// Parked timelines keep already encoded media of a previous quality/audio
// choice alive, so switching back reuses it instead of re-encoding.
// Protected by swarmMu. Parked windows still belong to playbackContext.
type parkedPlaybackTimeline struct {
	quality string
	audio   string
	windows []*playbackWindow
}

var parkedPlaybackTimelines []*parkedPlaybackTimeline

const maxParkedPlaybackTimelines = 3

const parkedPlaybackCacheBudget int64 = 768 << 20

func parkedTimelineAlive(timeline *parkedPlaybackTimeline) bool {
	if timeline == nil || len(timeline.windows) == 0 {
		return false
	}
	for _, window := range timeline.windows {
		if window == nil || (window.ctx != nil && window.ctx.Err() != nil) {
			return false
		}
	}
	return true
}

func retireParkedTimelineLocked(timeline *parkedPlaybackTimeline) {
	if timeline == nil {
		return
	}
	for _, window := range timeline.windows {
		retirePlaybackWindowLocked(window)
	}
}

// Caller holds swarmMu.
func retireAllParkedTimelinesLocked() {
	for _, timeline := range parkedPlaybackTimelines {
		retireParkedTimelineLocked(timeline)
	}
	parkedPlaybackTimelines = nil
}

func pruneParkedTimelinesLocked() {
	kept := parkedPlaybackTimelines[:0]
	for _, timeline := range parkedPlaybackTimelines {
		if parkedTimelineAlive(timeline) {
			kept = append(kept, timeline)
		} else {
			retireParkedTimelineLocked(timeline)
		}
	}
	parkedPlaybackTimelines = kept
	for len(parkedPlaybackTimelines) > maxParkedPlaybackTimelines || (len(parkedPlaybackTimelines) > 1 && parkedTimelinesBytesLocked() > parkedPlaybackCacheBudget) {
		retireParkedTimelineLocked(parkedPlaybackTimelines[0])
		parkedPlaybackTimelines = parkedPlaybackTimelines[1:]
	}
}

func parkedTimelinesBytesLocked() int64 {
	var total int64
	for _, timeline := range parkedPlaybackTimelines {
		for _, window := range timeline.windows {
			total += window.cacheBytes
		}
	}
	return total
}

// Caller holds swarmMu. Moves the ready part of the active timeline into the
// parked set instead of retiring it; unfinished work is cancelled.
func parkActivePlaybackTimelineLocked() {
	retirePlaybackWindowLocked(prefetchedPlaybackWindow)
	prefetchedPlaybackWindow = nil
	current := currentPlaybackWindow
	if current == nil || (current.ctx != nil && current.ctx.Err() != nil) {
		cancelPlaybackWindowLocked()
		return
	}
	root := current.timelineID
	if root == "" {
		root = current.ID
	}
	var windows []*playbackWindow
	for _, window := range retainedPlaybackWindows {
		if window != nil && (window.ctx == nil || window.ctx.Err() == nil) && window.Status == "ready" && (window.timelineID == root || window.ID == root) {
			windows = append(windows, window)
		} else {
			retirePlaybackWindowLocked(window)
		}
	}
	if current.Status == "ready" {
		windows = append(windows, current)
	} else {
		retirePlaybackWindowLocked(current)
	}
	retainedPlaybackWindows = nil
	currentPlaybackWindow = nil
	if len(windows) == 0 {
		return
	}
	kept := parkedPlaybackTimelines[:0]
	for _, timeline := range parkedPlaybackTimelines {
		if timeline.quality == current.Quality && timeline.audio == current.Audio {
			retireParkedTimelineLocked(timeline)
			continue
		}
		kept = append(kept, timeline)
	}
	parkedPlaybackTimelines = append(kept, &parkedPlaybackTimeline{quality: current.Quality, audio: current.Audio, windows: windows})
	pruneParkedTimelinesLocked()
}

// Caller holds swarmMu. Restores a parked timeline covering position for the
// requested quality/audio, parking the active one in its place.
func restoreParkedPlaybackTimelineLocked(quality, audio string, position float64) bool {
	pruneParkedTimelinesLocked()
	for index, timeline := range parkedPlaybackTimelines {
		if timeline.quality != quality || (audio != "" && timeline.audio != "" && timeline.audio != audio) {
			continue
		}
		first := timeline.windows[0]
		last := timeline.windows[len(timeline.windows)-1]
		end := last.Start + last.DeliveredDuration
		if position < first.Start-0.05 || position >= end-0.5 {
			continue
		}
		parkedPlaybackTimelines = append(parkedPlaybackTimelines[:index:index], parkedPlaybackTimelines[index+1:]...)
		parkActivePlaybackTimelineLocked()
		retainedPlaybackWindows = append([]*playbackWindow(nil), timeline.windows[:len(timeline.windows)-1]...)
		currentPlaybackWindow = last
		return true
	}
	return false
}
