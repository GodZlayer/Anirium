package main

import "math"

// Prefer the producer already used at this quality. A failed input can still
// fall back to another compatible source, without rotating on capacity updates.
func (cache *mediaInputCache) preferredVideoSources(quality string, sources []string) []string {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	preferred := cache.videoProducers[quality]
	result := append([]string(nil), sources...)
	for index, source := range result {
		if source == preferred {
			copy(result[1:index+1], result[:index])
			result[0] = source
			break
		}
	}
	return result
}

// Distributes prefetch windows across compatible sources of the same quality
// while retaining all alternatives as fallbacks.
func (cache *mediaInputCache) balancedPrefetchVideoSources(quality string, sources []string, windowStart float64) []string {
	if len(sources) <= 1 {
		return append([]string(nil), sources...)
	}
	slot := int(math.Floor(math.Max(0, windowStart)/24.0)) % len(sources)
	result := make([]string, 0, len(sources))
	result = append(result, sources[slot:]...)
	result = append(result, sources[:slot]...)
	return result
}

func (cache *mediaInputCache) rememberVideoProducer(quality, source string) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.videoProducers == nil {
		cache.videoProducers = map[string]string{}
	}
	cache.videoProducers[quality] = source
}

func (cache *mediaInputCache) preferredVideoSource(quality string) string {
	if cache == nil {
		return ""
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	return cache.videoProducers[quality]
}

func (cache *mediaInputCache) primaryVideoSource() string {
	if cache == nil {
		return ""
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	for _, quality := range []string{"1080p", "720p", "480p", "360p"} {
		if src := cache.videoProducers[quality]; src != "" {
			return src
		}
	}
	for _, src := range cache.videoProducers {
		if src != "" {
			return src
		}
	}
	return ""
}

// Caller holds b.mu. Keep the two preceding producer inventories while their
// video windows remain playable. Never expose them as the new producer's tracks.
func (b *subtitleBundle) archiveSourceLocked() {
	if b.source == "" {
		return
	}
	if b.history == nil {
		b.history = map[string][]bundledSubtitle{}
	}
	source := publicSubtitleSource(b.source)
	tracks := []bundledSubtitle{}
	for _, track := range b.tracks {
		if track.Embedded {
			copy := *track
			copy.Parts = append([]subtitlePart(nil), track.Parts...)
			tracks = append(tracks, copy)
		}
	}
	order := []string{}
	for _, previous := range b.historyOrder {
		if previous != source {
			order = append(order, previous)
		}
	}
	b.historyOrder = append(order, source)
	b.history[source] = tracks
	for len(b.historyOrder) > 2 {
		delete(b.history, b.historyOrder[0])
		b.historyOrder = b.historyOrder[1:]
	}
}
