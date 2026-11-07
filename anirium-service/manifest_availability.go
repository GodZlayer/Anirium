package main

var playbackDiscoveryComplete bool // protected by swarmMu

// A fresh on-demand attempt supersedes stale readiness of the previous worker.
// Its eventual failure remains authoritative once the window stops preparing.
func preparingWindowVariant(variant MixVariant) MixVariant {
	variant.Status = "preparing"
	variant.PlaylistURL = ""
	variant.BufferPercent = 0
	variant.ProcessingFailed = false
	return variant
}

func stalledWindowVariant(variant MixVariant) MixVariant {
	variant.Status = "stalled"
	variant.PlaylistURL = ""
	variant.BufferPercent = 0
	variant.ProcessingFailed = true
	return variant
}

// Overall availability describes playable output, not completion of every
// advertised quality. Each variant remains authoritative for its own buffer.
func manifestAvailability(variants []MixVariant, discoveryComplete ...bool) (string, float64) {
	if len(variants) == 0 && len(discoveryComplete) > 0 && discoveryComplete[0] {
		return "stalled", 0
	}
	status, buffer := "preparing", 0.0
	failed, pending := false, false
	for _, variant := range variants {
		if variant.Status == "ready" {
			status = "ready"
			if variant.BufferPercent > buffer {
				buffer = variant.BufferPercent
			}
		} else if variant.Status == "stalled" {
			failed = true
		} else {
			pending = true
		}
	}
	if status != "ready" && failed && !pending {
		status = "stalled"
	}
	return status, buffer
}
