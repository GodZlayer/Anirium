package main

// Protected by swarmMu; each actual quality is started only when requested.
var requestedVariants = map[string]bool{}

func requestVideoVariant(quality string, generation uint64) bool {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	if !playbackDiscoveryComplete || generation != playbackGeneration || playbackContext.Err() != nil || continuousContextLocked().Err() != nil || !containsString(currentMixQualities, quality) {
		return false
	}
	id := playbackVariantID(generation, quality)
	preferVideoQuality(quality)
	if requestedVariants[id] {
		return true
	}
	requestedVariants[id] = true
	sources := append([]string(nil), activeLinks...)
	playbackInputs.retryFailed(sources)
	workers := playbackWorkers
	workers.Add(1)
	go func() {
		defer workers.Done()
		buildVariant(sources, quality, generation)
		// Retry only after the previous worker has returned and only if no
		// immutable media prefix was published. Replacing a ready prefix would
		// change segment URLs/content already consumed by an attached player.
		swarmMu.Lock()
		defer swarmMu.Unlock()
		if generation != playbackGeneration {
			return
		}
		variantMu.RLock()
		runtime := variantRuntimes[id]
		retryable := runtime != nil && runtime.Status == "stalled" && runtime.BufferedSeconds == 0 && runtime.PlaylistURL == ""
		variantMu.RUnlock()
		if retryable {
			delete(requestedVariants, id)
		}
	}()
	return true
}
