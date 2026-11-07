package main

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
)

type preparedPlaybackBuffer struct {
	SubtitleUnverified bool                   `json:"subtitleUnverified"`
	Position           float64                `json:"position"`
	EndOfEpisode       bool                   `json:"endOfEpisode"`
	Coverage           playbackBufferCoverage `json:"coverage"`
	Verdict            playbackBufferVerdict  `json:"buffer"`
	PlaylistURL        string                 `json:"playlistUrl,omitempty"`
}

func playbackBufferSnapshot(position float64, audio, subtitle string) (preparedPlaybackBuffer, bool) {
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if playbackContext.Err() != nil || currentPlaybackWindow == nil {
		return preparedPlaybackBuffer{}, false
	}
	windows := append([]*playbackWindow(nil), retainedPlaybackWindows...)
	windows = append(windows, currentPlaybackWindow, prefetchedPlaybackWindow)
	videoIntervals, audioIntervals := []preparedPlaybackInterval{}, []preparedPlaybackInterval{}
	result := preparedPlaybackBuffer{Position: position}
	audioExists := audio == ""
	remaining := -1.0
	root := currentPlaybackWindow.timelineID
	if root == "" {
		root = currentPlaybackWindow.ID
	}
	for _, window := range windows {
		if window == nil || window.ctx.Err() != nil || window.Status != "ready" {
			continue
		}
		if window.timelineID != "" && window.timelineID != root {
			continue
		}
		if window.EpisodeDuration > 0 {
			remaining = math.Max(0, window.EpisodeDuration-position)
		}
		if window.EndOfEpisode && window.DeliveredDuration > 0 {
			result.EndOfEpisode = true
			remaining = math.Max(0, window.Start+window.DeliveredDuration-position)
		}
		if runtime, ok := readyVariantSnapshot(window.ID + "-video"); ok {
			if runtime.ProcessingComplete && runtime.BufferedSeconds > 0 {
				videoIntervals = append(videoIntervals, preparedPlaybackInterval{window.Start, window.Start + runtime.BufferedSeconds})
			}
		}
		for _, track := range window.AudioTracks {
			if track.Language != audio {
				continue
			}
			audioExists = true
			result.Coverage.AudioRequired = true
			if runtime, ok := readyVariantSnapshot(track.ID); ok && track.Status == "ready" {
				if runtime.ProcessingComplete && runtime.BufferedSeconds > 0 {
					audioIntervals = append(audioIntervals, preparedPlaybackInterval{window.Start, window.Start + runtime.BufferedSeconds})
				}
			}
		}
		if audio == "" && len(window.AudioTracks) > 0 {
			audioExists = false
		}
	}
	if !audioExists {
		return preparedPlaybackBuffer{}, false
	}
	result.Coverage.VideoAhead = preparedPlaybackAhead(videoIntervals, position)
	result.Coverage.AudioAhead = preparedPlaybackAhead(audioIntervals, position)
	if subtitle != "" {
		found := false
		for _, track := range subtitleTracksLocked() {
			if track.ID != subtitle {
				continue
			}
			found = true
			if track.StreamIndex >= 0 {
				producer := track.Source
				playbackInputs.mu.Lock()
				if recovered := playbackInputs.externalSubtitleAlignmentSources[subtitle]; recovered != "" {
					producer = recovered
				}
				playbackInputs.mu.Unlock()
				result.SubtitleUnverified = producer == "" || currentSubtitleVideoSourceLocked(playbackInputs) != producer
			} else {
				playbackInputs.mu.Lock()
				alignedSource := playbackInputs.externalSubtitleAlignmentSources[subtitle]
				playbackInputs.mu.Unlock()
				result.SubtitleUnverified = alignedSource == "" || currentSubtitleVideoSourceLocked(playbackInputs) != alignedSource
			}
			result.Coverage.SubtitleRequired = true
			if playbackInputs.hasCompleteSubtitle(subtitle) {
				result.Coverage.SubtitleAhead = 86400 - position
				if remaining >= 0 {
					result.Coverage.SubtitleAhead = remaining
				}
			} else if track.StreamIndex >= 0 {
				result.Coverage.SubtitleAhead = playbackInputs.preparedSubtitleAhead(track.Source, track.StreamIndex, position)
				if remaining >= 0 {
					result.Coverage.SubtitleAhead = math.Min(result.Coverage.SubtitleAhead, remaining)
				}
			}
			break
		}
		if !found {
			return preparedPlaybackBuffer{}, false
		}
	}
	reserve := minimumPlaybackBufferSeconds
	if currentPlaybackSession.Generation == playbackGeneration {
		reserve = currentPlaybackSession.BufferSeconds
	}
	result.Verdict = assessPlaybackBuffer(result.Coverage, remaining, reserve)
	result.PlaylistURL = "/hls/" + root + "-video/continuous-master.m3u8"
	return result, true
}

func handlePlaybackBuffer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "GET or POST required", 405)
		return
	}
	query := r.URL.Query()
	for key, values := range query {
		if len(values) != 1 || (key != "position" && key != "audio" && key != "subtitle" && key != "playbackTicket" && key != "timeline") {
			http.Error(w, "Invalid buffer selection", 400)
			return
		}
	}
	position, err := strconv.ParseFloat(query.Get("position"), 64)
	audio, subtitle := query.Get("audio"), query.Get("subtitle")
	if err != nil || !isFiniteWindowPosition(position) || len(audio) > 32 || len(subtitle) > 100 || strings.ContainsAny(audio+subtitle, "\r\n") {
		http.Error(w, "Invalid buffer selection", 400)
		return
	}
	if _, valid := playbackBufferSnapshot(position, audio, subtitle); !valid {
		http.Error(w, "Selected tracks unavailable", 409)
		return
	}
	if r.Method == http.MethodPost {
		preparePlaybackMu.Lock()
		swarmMu.Lock()
		timeline := query.Get("timeline")
		validTimeline := timeline == "" || updateSessionPositionLocked(timeline, position, audio)
		swarmMu.Unlock()
		if !validTimeline {
			preparePlaybackMu.Unlock()
			http.Error(w, "Playback timeline changed", http.StatusConflict)
			return
		}
		if !playbackShuttingDown {
			replenishPlaybackWindowBuffer(position)
		}
		preparePlaybackMu.Unlock()
	}
	snapshot, ok := playbackBufferSnapshot(position, audio, subtitle)
	if !ok {
		http.Error(w, "Playback unavailable", 409)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(snapshot)
}
