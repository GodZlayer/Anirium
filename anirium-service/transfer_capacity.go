package main

import "math"

// Observed payload throughput, not a claim about ISP bandwidth. Idle samples
// cannot distinguish a completed buffer from a congested network and therefore
// are ignored; playback starvation must be handled by the scheduling policy.
type transferCapacity struct {
	BytesPerSecond float64
	Samples        int
	SwarmBytes     map[string]int64
	SwarmRates     map[string]transferCapacity
}

// Bound speculative pieces to roughly two seconds of observed payload. This
// is refreshed for each range reader; it is not an ISP-speed guarantee.
func mediaReadahead(capacity transferCapacity) int64 {
	if capacity.Samples < 3 || capacity.BytesPerSecond <= 0 || math.IsNaN(capacity.BytesPerSecond) || math.IsInf(capacity.BytesPerSecond, 0) {
		return 256 << 10
	}
	return int64(math.Max(64<<10, math.Min(2<<20, capacity.BytesPerSecond*2)))
}

func (capacity *transferCapacity) observeSwarms(counters map[string]int64, seconds float64) {
	var delta int64
	rates := make(map[string]transferCapacity, len(counters))
	for hash, current := range counters {
		previous, exists := capacity.SwarmBytes[hash]
		rate := capacity.SwarmRates[hash]
		if !exists {
			rate = transferCapacity{}
		}
		if exists && current > previous {
			delta += current - previous
			rate.observe(current-previous, seconds)
		}
		rates[hash] = rate
	}
	// Baseline newly joined swarms instead of counting their historical bytes.
	capacity.SwarmBytes = counters
	capacity.SwarmRates = rates
	capacity.observe(delta, seconds)
}

func (capacity *transferCapacity) observe(bytes int64, seconds float64) {
	if bytes <= 0 || seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		return
	}
	rate := float64(bytes) / seconds
	if capacity.Samples == 0 {
		capacity.BytesPerSecond = rate
	} else {
		weight := 0.15
		if rate < capacity.BytesPerSecond {
			weight = 0.5
		}
		capacity.BytesPerSecond += weight * (rate - capacity.BytesPerSecond)
	}
	capacity.Samples++
}
