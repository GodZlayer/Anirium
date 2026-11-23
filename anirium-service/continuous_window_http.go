package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func collectContinuousWindowParts(anchor, suffix string, windows []*playbackWindow) ([]continuousWindowPart, slidingPlaylistCursor, bool, error) {
	var parts []continuousWindowPart
	var cursor slidingPlaylistCursor
	found, ended := false, false
	for _, window := range windows {
		if window == nil {
			continue
		}
		if !found && window.timelineID != anchor && window.ID != anchor {
			continue
		}
		if !found {
			cursor = window.playlistCursor
			if suffix != "video" {
				if cursor.DiscontinuitySequence > 0 {
					var exists bool
					cursor, exists = window.audioPlaylistCursors[suffix]
					if !exists {
						return nil, slidingPlaylistCursor{}, false, fmt.Errorf("audio timeline unavailable")
					}
				} else {
					cursor = slidingPlaylistCursor{}
				}
			}
		}
		if found && window.timelineID != "" && window.timelineID != anchor {
			break
		}
		found = true
		if window.ctx.Err() != nil || window.Status != "ready" {
			break
		}
		runtime, ok := readyVariantSnapshot(window.ID + "-" + suffix)
		if !ok {
			break
		}
		segments, complete, err := readGeneratedHLS(filepath.Join(runtime.Dir, "index.m3u8"))
		if err != nil || !complete {
			break
		}
		parts = append(parts, continuousWindowPart{ID: window.ID + "-" + suffix, Start: window.Start, Segments: segments})
		ended = window.EndOfEpisode
		if ended {
			break
		}
	}
	return parts, cursor, ended, nil
}

// Experimental delivery primitive, not yet advertised to the Player. Holding
// swarmMu protects ownership against seek/retirement while reading playlists.
func preparedWindowSequencePlaylist(id string) (string, error) {
	identity := continuousWindowMediaID.FindStringSubmatch(id)
	if len(identity) != 2 {
		return "", fmt.Errorf("invalid rendition")
	}
	suffix := identity[1]
	anchor := strings.TrimSuffix(id, "-"+suffix)
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	windows := append([]*playbackWindow(nil), retainedPlaybackWindows...)
	windows = append(windows, currentPlaybackWindow, prefetchedPlaybackWindow)
	parts, cursor, ended, err := collectContinuousWindowParts(anchor, suffix, windows)
	if err != nil {
		return "", err
	}
	if len(parts) == 0 && os.Getenv("ANIRIUM_E2E_CHILD") != "1" &&
		currentPlaybackWindow != nil && currentPlaybackWindow.ctx.Err() == nil && currentPlaybackWindow.Status == "ready" &&
		strings.HasPrefix(anchor, fmt.Sprintf("window-%d-", playbackGeneration)) {
		fallbackAnchor := currentPlaybackWindow.timelineID
		if fallbackAnchor == "" {
			fallbackAnchor = currentPlaybackWindow.ID
		}
		if fallbackAnchor != "" && fallbackAnchor != anchor {
			parts, cursor, ended, err = collectContinuousWindowParts(fallbackAnchor, suffix, windows)
			if err != nil {
				return "", err
			}
		}
	}
	return slidingWindowPlaylist(parts, ended, cursor)
}

// Diagnostic labels for the continuous endpoints. The rendition id must match
// the continuousWindowMediaID whitelist and the reason must belong to the
// closed set of errors these owned functions return, so a log record can only
// carry a bounded internal label: never a URL, query, ticket, source path or
// arbitrary wrapped data.
const continuousDiagnosticInvalidID = "invalid"
const continuousDiagnosticUnexpectedReason = "unexpected"

var continuousDiagnosticReasons = map[string]bool{
	"invalid rendition":              true,
	"audio timeline unavailable":     true,
	"no continuous media":            true,
	"invalid timeline":               true,
	"invalid or disconnected window": true,
	"mixed renditions":               true,
	"invalid continuous segment":     true,
	"invalid video timeline":         true,
	"invalid audio rendition":        true,
	"audio continuity unavailable":   true,
	"audio not prepared":             true,
	"timeline unavailable":           true,
}

func safeContinuousRendition(id string) string {
	if continuousWindowMediaID.MatchString(id) {
		return id
	}
	return continuousDiagnosticInvalidID
}

func safeContinuousReason(err error) string {
	if err != nil && continuousDiagnosticReasons[err.Error()] {
		return err.Error()
	}
	return continuousDiagnosticUnexpectedReason
}

// logContinuousDiagnostic records a denied continuous request through the
// existing service log with only its whitelisted rendition id and reason.
func logContinuousDiagnostic(kind, id string, err error) {
	appendLog(fmt.Sprintf("continuous %s denied rendition=%s reason=%s", kind, safeContinuousRendition(id), safeContinuousReason(err)))
}

func servePreparedWindowSequence(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "GET or HEAD required", http.StatusMethodNotAllowed)
		return
	}
	playlist, err := preparedWindowSequencePlaylist(id)
	if err != nil {
		logContinuousDiagnostic("sequence", id, err)
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodGet {
		fmt.Fprint(w, authorizePlaylist(playlist, r.URL.Query().Get("playbackTicket")))
	}
}

func buildPreparedWindowMaster(anchor, ticket string, windows []*playbackWindow) (string, bool, error) {
	id := anchor + "-video"
	for _, window := range windows {
		if window == nil || window.ctx.Err() != nil || window.Status != "ready" || (window.timelineID != anchor && window.ID != anchor) {
			continue
		}
		video, ok := readyVariantSnapshot(window.ID + "-video")
		if !ok {
			continue
		}
		tracks := append([]AudioTrack(nil), window.AudioTracks...)
		if window.MuxedAudio {
			if !video.muxedAudio {
				return "", true, fmt.Errorf("audio not prepared")
			}
			playlist := masterPlaylist(id, nil, ticket, video.Bandwidth)
			return strings.Replace(playlist, "/hls/"+id+"/index.m3u8", "/hls/"+id+"/continuous.m3u8", 1), true, nil
		}
		for index := range tracks {
			if tracks[index].Status != "ready" {
				continue
			}
			trackIdentity := continuousWindowMediaID.FindStringSubmatch(tracks[index].ID)
			if len(trackIdentity) != 2 || trackIdentity[1] == "video" {
				return "", true, fmt.Errorf("invalid audio rendition")
			}
			if window.playlistCursor.DiscontinuitySequence > 0 {
				if _, exists := window.audioPlaylistCursors[trackIdentity[1]]; !exists {
					return "", true, fmt.Errorf("audio continuity unavailable")
				}
			}
			tracks[index].PlaylistURL = "/hls/" + anchor + "-" + trackIdentity[1] + "/continuous.m3u8"
		}
		if !audioPlaybackReady(tracks) {
			return "", true, fmt.Errorf("audio not prepared")
		}
		playlist := masterPlaylist(id, tracks, ticket, video.Bandwidth)
		return strings.Replace(playlist, "/hls/"+id+"/index.m3u8", "/hls/"+id+"/continuous.m3u8", 1), true, nil
	}
	return "", false, fmt.Errorf("timeline unavailable")
}

func preparedWindowMasterPlaylist(id, ticket string) (string, error) {
	identity := continuousWindowMediaID.FindStringSubmatch(id)
	if len(identity) != 2 || identity[1] != "video" {
		return "", fmt.Errorf("invalid video timeline")
	}
	anchor := strings.TrimSuffix(id, "-video")
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	windows := append([]*playbackWindow(nil), retainedPlaybackWindows...)
	windows = append(windows, currentPlaybackWindow, prefetchedPlaybackWindow)
	playlist, matched, err := buildPreparedWindowMaster(anchor, ticket, windows)
	if !matched && os.Getenv("ANIRIUM_E2E_CHILD") != "1" &&
		currentPlaybackWindow != nil && currentPlaybackWindow.ctx.Err() == nil && currentPlaybackWindow.Status == "ready" &&
		strings.HasPrefix(anchor, fmt.Sprintf("window-%d-", playbackGeneration)) {
		fallbackAnchor := currentPlaybackWindow.timelineID
		if fallbackAnchor == "" {
			fallbackAnchor = currentPlaybackWindow.ID
		}
		if fallbackAnchor != "" && fallbackAnchor != anchor {
			playlist, _, err = buildPreparedWindowMaster(fallbackAnchor, ticket, windows)
		}
	}
	return playlist, err
}

func servePreparedWindowMaster(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "GET or HEAD required", http.StatusMethodNotAllowed)
		return
	}
	playlist, err := preparedWindowMasterPlaylist(id, r.URL.Query().Get("playbackTicket"))
	if err != nil {
		logContinuousDiagnostic("master", id, err)
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodGet {
		fmt.Fprint(w, playlist)
	}
}
