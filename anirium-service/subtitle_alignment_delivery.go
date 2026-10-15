package main

import (
	"context"
	"math"
	"strings"
	"time"
)

// Reference acquisition belongs to the session's existing shared extraction.
// A slow reference must not hold delivery of an already complete external file.
func prepareSubtitleAlignmentReference(parent context.Context, cache *mediaInputCache, language string, load func(context.Context, *mediaInputCache, string, int) (string, error)) {
	swarmMu.RLock()
	source := currentSubtitleVideoSourceLocked(cache)
	stream := -1
	if source != "" && canonicalLanguage(language) != "" && canonicalLanguage(language) != "und" {
		for _, track := range subtitleTracksLocked() {
			if track.Source == source && track.StreamIndex >= 0 && canonicalLanguage(track.Language) == canonicalLanguage(language) {
				stream = track.StreamIndex
				break
			}
		}
	}
	swarmMu.RUnlock()
	if stream < 0 {
		return
	}
	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()
	_, _ = load(ctx, cache, source, stream)
}

// Only a complete embedded subtitle from the actual video producer can be a
// reference. Multiple producers or missing reference leave manual adjustment.
func alignExternalSubtitleToVideo(cache *mediaInputCache, language, candidate string, trackIDs ...string) (string, bool) {
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if cache != nil && len(trackIDs) > 0 {
		cache.mu.Lock()
		delete(cache.externalSubtitleAlignmentSources, trackIDs[0])
		cache.mu.Unlock()
	}
	source := currentSubtitleVideoSourceLocked(cache)
	if source == "" {
		return candidate, false
	}
	for _, track := range subtitleTracksLocked() {
		if track.Source != source || track.StreamIndex < 0 || canonicalLanguage(track.Language) != canonicalLanguage(language) {
			continue
		}
		reference, ok := cache.cachedSubtitleWindow(subtitleWindowKey{source: source, stream: track.StreamIndex, start: -1})
		if !ok {
			continue
		}
		offset, confident := confidentSubtitleOffset(reference, candidate)
		if !confident {
			continue
		}
		adjusted, valid := shiftCompleteWebVTT(candidate, offset)
		if valid {
			if len(trackIDs) > 0 && trackIDs[0] != "" {
				cache.mu.Lock()
				if cache.externalSubtitleAlignmentSources == nil {
					cache.externalSubtitleAlignmentSources = make(map[string]string)
				}
				cache.externalSubtitleAlignmentSources[trackIDs[0]] = source
				cache.mu.Unlock()
			}
			return adjusted, true
		}
	}
	return candidate, false
}

// Caller holds swarmMu. A subtitle shares a container clock only with the
// actual producer of all currently prepared video, including fallback windows.
func currentSubtitleVideoSourceLocked(cache *mediaInputCache) string {
	if cache == nil || cache != playbackInputs || playbackContext.Err() != nil {
		return ""
	}
	windows := append([]*playbackWindow(nil), retainedPlaybackWindows...)
	windows = append(windows, currentPlaybackWindow, prefetchedPlaybackWindow)
	source := ""
	for _, window := range windows {
		if window == nil || window.Status != "ready" || window.ctx.Err() != nil {
			continue
		}
		runtime, ok := readyVariantSnapshot(window.ID + "-video")
		if !ok || runtime.videoSource == "" {
			return ""
		}
		if source != "" && source != runtime.videoSource {
			return ""
		}
		source = runtime.videoSource
	}
	return source
}

func embeddedSubtitleAlignment(cache *mediaInputCache, source string) string {
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if source != "" && currentSubtitleVideoSourceLocked(cache) == source {
		return "verified"
	}
	return "unverified"
}

func shiftCompleteWebVTT(content string, offset float64) (string, bool) {
	if math.IsNaN(offset) || math.IsInf(offset, 0) || math.Abs(offset) > 120 {
		return content, false
	}
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	delta := int64(math.Round(offset * 1000))
	for index, line := range lines {
		parts := strings.Split(line, "-->")
		if len(parts) != 2 {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) == 0 {
			return content, false
		}
		start, aErr := parseWebVTTMillis(strings.TrimSpace(parts[0]))
		end, bErr := parseWebVTTMillis(fields[0])
		if aErr != nil || bErr != nil || start+delta < 0 || end+delta <= start+delta {
			return content, false
		}
		lines[index] = formatWebVTTMillis(start+delta) + " --> " + formatWebVTTMillis(end+delta)
		if len(fields) > 1 {
			lines[index] += " " + strings.Join(fields[1:], " ")
		}
	}
	return strings.Join(lines, "\n"), true
}
