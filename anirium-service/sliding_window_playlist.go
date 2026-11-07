package main

import (
	"fmt"
	"strings"
)

// Sequence values belong to the timeline and survive eviction. They must not
// be recomputed from only the currently retained windows.
type slidingPlaylistCursor struct {
	MediaSequence         uint64
	DiscontinuitySequence uint64
}

func slidingWindowPlaylist(parts []continuousWindowPart, ended bool, cursor slidingPlaylistCursor) (string, error) {
	playlist, err := continuousWindowPlaylist(parts, ended)
	if err != nil {
		return "", err
	}
	playlist = strings.Replace(playlist, "#EXT-X-PLAYLIST-TYPE:EVENT\n", "", 1)
	playlist = strings.Replace(playlist, "#EXT-X-MEDIA-SEQUENCE:0\n", fmt.Sprintf("#EXT-X-MEDIA-SEQUENCE:%d\n#EXT-X-DISCONTINUITY-SEQUENCE:%d\n", cursor.MediaSequence, cursor.DiscontinuitySequence), 1)
	return playlist, nil
}

// Eviction advances the cursor only for validated completed windows. The
// caller retains at least one following window in the same timeline.
func (cursor slidingPlaylistCursor) afterEviction(parts []continuousWindowPart) (slidingPlaylistCursor, error) {
	if _, err := continuousWindowPlaylist(parts, false); err != nil {
		return cursor, err
	}
	var segments uint64
	for _, part := range parts {
		segments += uint64(len(part.Segments))
	}
	max := ^uint64(0)
	if segments > max-cursor.MediaSequence || uint64(len(parts)) > max-cursor.DiscontinuitySequence {
		return cursor, fmt.Errorf("playlist sequence overflow")
	}
	return slidingPlaylistCursor{MediaSequence: cursor.MediaSequence + segments, DiscontinuitySequence: cursor.DiscontinuitySequence + uint64(len(parts))}, nil
}
