package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
)

// Session choices belong to the same generation as the authorized media.
// Protected by swarmMu; command application is serialized by preparePlaybackMu.
type playbackSessionState struct {
	adaptiveReserve bool
	Generation      uint64  `json:"generation"`
	Revision        uint64  `json:"revision"`
	Quality         string  `json:"quality"`
	Audio           string  `json:"audio"`
	Subtitle        string  `json:"subtitle"`
	Position        float64 `json:"position"`
	Playing         bool    `json:"playing"`
	BufferSeconds   float64 `json:"bufferSeconds"`
}

var currentPlaybackSession playbackSessionState

type playbackSessionCommand struct {
	Timeline      string  `json:"timeline,omitempty"`
	Action        string  `json:"action"`
	Quality       string  `json:"quality"`
	Audio         string  `json:"audio"`
	Subtitle      string  `json:"subtitle"`
	Position      float64 `json:"position"`
	Playing       bool    `json:"playing"`
	BufferSeconds float64 `json:"bufferSeconds"`
}

func decodePlaybackSessionCommand(body io.Reader) (playbackSessionCommand, error) {
	var command playbackSessionCommand
	payload, err := io.ReadAll(io.LimitReader(body, 4097))
	if err != nil || len(payload) > 4096 {
		return command, fmt.Errorf("invalid command size")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&command); err != nil {
		return command, err
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return command, fmt.Errorf("trailing command")
	}
	if command.Action != "seek" && command.Action != "choices" && command.Action != "transport" && command.Action != "progress" {
		return command, fmt.Errorf("invalid action")
	}
	if !isFiniteWindowPosition(command.Position) || command.Position > 86400 || len(command.Audio) > 32 || len(command.Subtitle) > 100 || len(command.Timeline) > 200 {
		return command, fmt.Errorf("invalid selection")
	}
	if command.BufferSeconds == 0 {
		command.BufferSeconds = 30
	}
	if command.BufferSeconds != 30 && command.BufferSeconds != 60 {
		return command, fmt.Errorf("invalid reserve")
	}
	return command, nil
}

// Caller holds swarmMu. Inventory validation never substitutes another track.
func applyPlaybackSessionCommandLocked(command playbackSessionCommand) bool {
	if playbackContext.Err() != nil || !playbackDiscoveryComplete || !containsString(currentMixQualities, command.Quality) {
		return false
	}
	if duration := playbackEpisodeDurationLocked(); duration > 0 && command.Position >= duration {
		return false
	}
	if command.Audio == "" && len(selectedAudioCandidates) > 0 {
		command.Audio = selectedAudioCandidates[0].Language
		for _, candidate := range selectedAudioCandidates {
			if candidate.Language == "jpn" {
				command.Audio = "jpn"
				break
			}
		}
	}
	if command.Audio != "" {
		found := false
		for _, candidate := range selectedAudioCandidates {
			if candidate.Language == command.Audio {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	if command.Subtitle != "" {
		found := false
		for _, track := range subtitleTracksLocked() {
			if track.ID == command.Subtitle {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	adaptive := currentPlaybackSession.Generation == playbackGeneration && currentPlaybackSession.adaptiveReserve
	if adaptive {
		command.BufferSeconds = 60
	}
	currentPlaybackSession = playbackSessionState{adaptiveReserve: adaptive, Generation: playbackGeneration, Revision: currentPlaybackSession.Revision + 1, Quality: command.Quality, Audio: command.Audio, Subtitle: command.Subtitle, Position: command.Position, Playing: command.Playing, BufferSeconds: command.BufferSeconds}
	return true
}

func handlePlaybackSession(w http.ResponseWriter, r *http.Request) {
	var progress *playbackSessionCommand
	for key, values := range r.URL.Query() {
		if key != "playbackTicket" || len(values) != 1 {
			http.Error(w, "Invalid session parameter", 400)
			return
		}
	}
	if r.Method == http.MethodPost {
		command, err := decodePlaybackSessionCommand(r.Body)
		if err != nil {
			http.Error(w, "Invalid session command", 400)
			return
		}
		preparePlaybackMu.Lock()
		swarmMu.Lock()
		previous := currentPlaybackSession
		accepted := false
		if !playbackShuttingDown {
			if command.Action == "progress" {
				validSubtitle := command.Subtitle == ""
				for _, track := range subtitleTracksLocked() {
					if track.ID == command.Subtitle {
						validSubtitle = true
						break
					}
				}
				accepted = validSubtitle && updateSessionPositionLocked(command.Timeline, command.Position, command.Audio)
				if accepted {
					currentPlaybackSession.Playing = command.Playing
					currentPlaybackSession.Subtitle = command.Subtitle
					progress = &command
				}
			} else {
				accepted = applyPlaybackSessionCommandLocked(command)
			}
		}
		// A seek starts a fresh media origin. Reattaching a sliding queue whose
		// old prefix was evicted would give the browser another time origin.
		if accepted && command.Action == "seek" {
			cancelPlaybackWindowLocked()
		}
		swarmMu.Unlock()
		if accepted && command.Action != "transport" && command.Action != "progress" {
			accepted = requestPlaybackWindow(command.Quality, math.Floor(command.Position/4)*4)
		}
		if !accepted {
			swarmMu.Lock()
			currentPlaybackSession = previous
			swarmMu.Unlock()
		}
		if accepted {
			swarmMu.Lock()
			startSessionPreparationLocked()
			swarmMu.Unlock()
		}
		preparePlaybackMu.Unlock()
		if !accepted {
			http.Error(w, "Session selection unavailable", 409)
			return
		}
	} else if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "GET or POST required", 405)
		return
	}
	window, exists := playbackWindowSnapshot()
	swarmMu.RLock()
	session := currentPlaybackSession
	generation := playbackGeneration
	swarmMu.RUnlock()
	if !exists || session.Generation != generation {
		http.Error(w, "Session unavailable", 409)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	var bufferState *preparedPlaybackBuffer
	if progress != nil {
		if snapshot, available := playbackBufferSnapshot(progress.Position, progress.Audio, progress.Subtitle); available {
			bufferState = &snapshot
		} else {
			http.Error(w, "Selected tracks unavailable", http.StatusConflict)
			return
		}
	}
	if r.Method == http.MethodPost {
		w.WriteHeader(http.StatusAccepted)
	}
	_ = json.NewEncoder(w).Encode(struct {
		Session     playbackSessionState    `json:"session"`
		Window      playbackWindow          `json:"window"`
		BufferState *preparedPlaybackBuffer `json:"bufferState,omitempty"`
	}{session, window, bufferState})
}
