package main

// Evidence only: content is still delivered by the normal subtitle endpoint.
// Entries belong to this playback, never an account-global/static inventory.
func (cache *mediaInputCache) rememberCompleteSubtitle(trackID string) {
	if cache == nil || trackID == "" {
		return
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.ctx.Err() != nil {
		return
	}
	if cache.completeSubtitleTracks == nil {
		cache.completeSubtitleTracks = map[string]bool{}
	}
	if cache.completeSubtitleTracks[trackID] {
		return
	}
	if len(cache.completeSubtitleOrder) >= 64 {
		delete(cache.externalSubtitleAlignmentSources, cache.completeSubtitleOrder[0])
		delete(cache.completeSubtitleTracks, cache.completeSubtitleOrder[0])
		cache.completeSubtitleOrder = cache.completeSubtitleOrder[1:]
	}
	cache.completeSubtitleTracks[trackID] = true
	cache.completeSubtitleOrder = append(cache.completeSubtitleOrder, trackID)
}

func (cache *mediaInputCache) hasCompleteSubtitle(trackID string) bool {
	if cache == nil {
		return false
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	return cache.ctx.Err() == nil && cache.completeSubtitleTracks[trackID]
}
