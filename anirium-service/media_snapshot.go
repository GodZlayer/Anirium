package main

// Never return a mutable worker pointer to an HTTP handler. Ready means at least
// one closed segment is published; the event playlist may still be growing.
func readyVariantSnapshot(id string) (variantRuntime, bool) {
	variantMu.RLock()
	defer variantMu.RUnlock()
	runtime, exists := variantRuntimes[id]
	if !exists || runtime.Status != "ready" {
		return variantRuntime{}, false
	}
	snapshot := *runtime
	snapshot.AudioLanguages = append([]string(nil), runtime.AudioLanguages...)
	return snapshot, true
}
