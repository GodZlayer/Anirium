package main

// Recover only complete, already prepared alternatives of the requested
// language. A failed worker never turns its partial output into a subtitle.
func recoverCompleteEmbeddedSubtitle(cache *mediaInputCache, selectedID string) (string, string, bool) {
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if cache == nil || cache != playbackInputs || playbackContext.Err() != nil {
		return "", "", false
	}
	tracks := subtitleTracksLocked()
	language := ""
	for _, track := range tracks {
		if track.ID == selectedID {
			language = canonicalLanguage(track.Language)
			break
		}
	}
	if language == "" || language == "und" {
		return "", "", false
	}
	for _, track := range tracks {
		if track.ID == selectedID || track.StreamIndex < 0 || canonicalLanguage(track.Language) != language {
			continue
		}
		content, ready := cache.cachedSubtitleWindow(subtitleWindowKey{source: track.Source, stream: track.StreamIndex, start: -1})
		if !ready || content == "" {
			continue
		}
		cache.rememberCompleteSubtitle(selectedID)
		cache.mu.Lock()
		if cache.externalSubtitleAlignmentSources == nil {
			cache.externalSubtitleAlignmentSources = make(map[string]string)
		}
		cache.externalSubtitleAlignmentSources[selectedID] = track.Source
		cache.mu.Unlock()
		return content, track.Source, true
	}
	return "", "", false
}
