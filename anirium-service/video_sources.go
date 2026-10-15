package main

import (
	"sort"
	"strconv"
	"strings"
)

func qualityPixels(quality string) int {
	if quality == "4k" {
		return 2160
	}
	if !strings.HasSuffix(quality, "p") {
		return 0
	}
	height, err := strconv.Atoi(strings.TrimSuffix(quality, "p"))
	if err != nil || height < 2 || height > 8640 || height%2 != 0 {
		return 0
	}
	return height
}

func qualityForHeight(height int) string {
	if height == 2160 {
		return "4k"
	}
	quality := strconv.Itoa(height) + "p"
	if qualityPixels(quality) == 0 {
		return "unknown"
	}
	return quality
}

func orderedExistingQualities(available []string) []string {
	heights := map[int]bool{}
	for _, quality := range available {
		if height := qualityPixels(quality); height > 0 {
			heights[height] = true
		}
	}
	ordered := make([]int, 0, len(heights))
	for height := range heights {
		ordered = append(ordered, height)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(ordered)))
	qualities := make([]string, 0, len(ordered))
	for _, height := range ordered {
		qualities = append(qualities, qualityForHeight(height))
	}
	return qualities
}

// The encoder maps the first video stream. A lower-resolution stream cannot
// contribute to a higher-quality variant simply because scaling is possible.
func videoSupportsQuality(streams []ffprobeStream, quality string) bool {
	minimum := qualityPixels(quality)
	if minimum == 0 {
		return false
	}
	for _, stream := range streams {
		if stream.CodecType == "video" && stream.Disposition.AttachedPic == 0 {
			return stream.Height >= minimum
		}
	}
	return false
}

// Caller supplies only the already compatible episode source set. Unknown
// lengths remain fallback candidates; they must not appear lighter than known
// files. Stable ties preserve discovery order without changing the reference.
func orderedVideoSources(sources []string, streams map[string][]ffprobeStream, quality string) []string {
	eligible := []string{}
	weights := map[string]int64{}
	for _, source := range sources {
		if videoSupportsQuality(streams[source], quality) {
			eligible = append(eligible, source)
			weights[source] = resolveMediaSource(source).FileBytes
		}
	}
	sort.SliceStable(eligible, func(i, j int) bool {
		a, b := weights[eligible[i]], weights[eligible[j]]
		if a <= 0 {
			return false
		}
		if b <= 0 {
			return true
		}
		return a < b
	})
	return eligible
}

// Ranking estimates whether observed swarm payload can sustain the actual
// selected episode's average bytes per second with headroom. It is not an ISP
// guarantee, and an unmeasured source is not classified as slow. Discovery and
// playback still validate episode identity and stream compatibility separately.
func orderedSustainableVideoSources(sources []string, streams map[string][]ffprobeStream, formats map[string]ffprobeOutput, quality string, capacity transferCapacity) []string {
	eligible := orderedVideoSources(sources, streams, quality)
	class := map[string]int{}
	for _, id := range eligible {
		class[id] = 1
		source := resolveMediaSource(id)
		hash, valid := normalizedMagnetHash(source.Magnet)
		_, duration, timingValid := sourceTiming(formats[id])
		rate := capacity.SwarmRates[hash]
		if !valid || !timingValid || duration <= 0 || source.FileBytes <= 0 || rate.Samples < 3 || rate.BytesPerSecond <= 0 {
			continue
		}
		class[id] = 2
		if rate.BytesPerSecond >= 1.25*float64(source.FileBytes)/duration {
			class[id] = 0
		}
	}
	sort.SliceStable(eligible, func(i, j int) bool { return class[eligible[i]] < class[eligible[j]] })
	return eligible
}
