package main

import (
	"math"
	"sort"
	"strings"
)

type subtitleAnchor struct {
	text       string
	start, end int64
}

func subtitleAlignmentAnchors(vtt string) []subtitleAnchor {
	var result []subtitleAnchor
	for _, block := range strings.Split(strings.ReplaceAll(vtt, "\r\n", "\n"), "\n\n") {
		lines := strings.Split(block, "\n")
		for index, line := range lines {
			parts := strings.Split(line, "-->")
			if len(parts) != 2 {
				continue
			}
			endFields := strings.Fields(parts[1])
			if len(endFields) == 0 {
				break
			}
			start, aErr := parseWebVTTMillis(strings.TrimSpace(parts[0]))
			end, bErr := parseWebVTTMillis(endFields[0])
			text := strings.Join(strings.Fields(strings.ToLower(strings.Join(lines[index+1:], " "))), " ")
			if aErr == nil && bErr == nil && end > start && len(text) >= 12 {
				result = append(result, subtitleAnchor{text, start, end})
			}
			break
		}
	}
	return result
}

// Match dialogue content, never cue ordinal. A constant offset is accepted only
// with unique shared speech over two minutes and consistent start/end timing.
// Drift, cuts, repeated phrases and sparse matches remain unverified.
func confidentSubtitleOffset(reference, candidate string) (float64, bool) {
	ref, cand := subtitleAlignmentAnchors(reference), subtitleAlignmentAnchors(candidate)
	refByText := map[string]subtitleAnchor{}
	counts := map[string]int{}
	for _, anchor := range ref {
		refByText[anchor.text] = anchor
		counts[anchor.text]++
	}
	candCounts := map[string]int{}
	for _, anchor := range cand {
		candCounts[anchor.text]++
	}
	var offsets []float64
	first, last := int64(math.MaxInt64), int64(0)
	previous := int64(-1)
	for _, anchor := range cand {
		matched, exists := refByText[anchor.text]
		if !exists || counts[anchor.text] != 1 || candCounts[anchor.text] != 1 {
			continue
		}
		if matched.start <= previous {
			return 0, false
		}
		previous = matched.start
		if matched.start < first {
			first = matched.start
		}
		if matched.start > last {
			last = matched.start
		}
		offsets = append(offsets, float64(matched.start-anchor.start)/1000, float64(matched.end-anchor.end)/1000)
	}
	if len(offsets) < 16 || last-first < 120000 {
		return 0, false
	}
	sort.Float64s(offsets)
	offset := offsets[len(offsets)/2]
	if math.Abs(offset) > 120 {
		return 0, false
	}
	for _, value := range offsets {
		if math.Abs(value-offset) > 0.15 {
			return 0, false
		}
	}
	return offset, true
}
