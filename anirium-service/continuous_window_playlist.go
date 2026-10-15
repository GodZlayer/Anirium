package main

import (
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Inputs must remain owned by the playback until this playlist retires.
// No torrent/provider identity or filesystem path is published.
type continuousWindowPart struct {
	ID       string
	Start    float64
	Segments []hlsSegment
}

var continuousWindowMediaID = regexp.MustCompile(`^window-[0-9]+-[0-9]+-(video|audio-[0-9]+)$`)

// Source windows are VOD, but the combined stream is EVENT until the actual
// episode end. Each independently encoded window has a discontinuity boundary.
func continuousWindowPlaylist(parts []continuousWindowPart, ended bool) (string, error) {
	if len(parts) == 0 {
		return "", fmt.Errorf("no continuous media")
	}
	var body strings.Builder
	seen := map[string]bool{}
	rendition := ""
	expected := parts[0].Start
	if !isFiniteWindowPosition(expected) {
		return "", fmt.Errorf("invalid timeline")
	}
	for index, part := range parts {
		identity := continuousWindowMediaID.FindStringSubmatch(part.ID)
		if len(identity) != 2 || seen[part.ID] || !isFiniteWindowPosition(part.Start) || math.Abs(part.Start-expected) > 0.05 || len(part.Segments) == 0 {
			return "", fmt.Errorf("invalid or disconnected window")
		}
		if index == 0 {
			rendition = identity[1]
		}
		if identity[1] != rendition {
			return "", fmt.Errorf("mixed renditions")
		}
		seen[part.ID] = true
		// A discontinuity starts an independently encoded window at its owned
		// timestamp. AAC frame padding may extend each window slightly; carrying
		// that padding across windows invents a growing gap on the episode clock.
		expected = part.Start
		if index > 0 {
			body.WriteString("#EXT-X-DISCONTINUITY\n")
		}
		// This fixed epoch represents episode time, never wall-clock playback.
		// Keep an explicit anchor at every discontinuity so a consumer can map
		// its demuxer-adjusted media clock back to the owned episode position.
		anchor := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(math.Round(part.Start*1000)) * time.Millisecond)
		fmt.Fprintf(&body, "#EXT-X-PROGRAM-DATE-TIME:%s\n", anchor.Format("2006-01-02T15:04:05.000Z"))
		for _, segment := range part.Segments {
			duration, err := strconv.ParseFloat(segment.duration, 64)
			name := filepath.Base(segment.path)
			if err != nil || math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0 || duration > 6 || segment.size <= 0 || !strings.HasSuffix(name, ".ts") || strings.ContainsAny(name, "\\/?#\r\n") || name == ".ts" {
				return "", fmt.Errorf("invalid continuous segment")
			}
			fmt.Fprintf(&body, "#EXTINF:%s,\n/hls/%s/%s\n", segment.duration, part.ID, name)
			expected += duration
		}
	}
	out := "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXT-X-MEDIA-SEQUENCE:0\n" + body.String()
	if ended {
		out += "#EXT-X-ENDLIST\n"
	}
	return out, nil
}

func isFiniteWindowPosition(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0 && value <= 86400
}
