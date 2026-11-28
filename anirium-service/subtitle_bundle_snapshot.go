package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
)

func (b *subtitleBundle) snapshot(epoch, since uint64) subtitleBundleSnapshot {
	b.mu.Lock()
	defer b.mu.Unlock()
	result := subtitleBundleSnapshot{Version: 1, Epoch: b.epoch, Revision: b.revision, Source: publicSubtitleSource(b.source), Reset: epoch != b.epoch || since > b.revision, Tracks: []bundledSubtitle{}}
	if result.Reset {
		since = 0
	}
	for _, state := range b.tracks {
		if state.revision <= since {
			continue
		}
		copy := *state
		copy.Parts = []subtitlePart{}
		for _, part := range state.Parts {
			if part.Revision > since {
				copy.Parts = append(copy.Parts, part)
			}
		}
		if heads := b.fastHeads[state.ID]; len(heads) > 0 {
			for _, head := range heads {
				if head.Revision <= since {
					continue
				}
				covered := false
				for _, part := range state.Parts {
					if !part.Failed && part.Start <= head.Start+0.05 && part.End >= head.End-0.05 {
						covered = true
						break
					}
				}
				if !covered {
					copy.Parts = append(copy.Parts, head)
					if copy.Status == "preparing" {
						copy.Status = "ready"
					}
				}
			}
		}
		result.Tracks = append(result.Tracks, copy)
	}
	sort.Slice(result.Tracks, func(i, j int) bool { return result.Tracks[i].ID < result.Tracks[j].ID })
	return result
}

func handleSubtitleBundle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "GET required", 405)
		return
	}
	for key, values := range r.URL.Query() {
		if len(values) != 1 || (key != "playbackTicket" && key != "since" && key != "epoch") {
			http.Error(w, "Invalid subtitle query", 400)
			return
		}
	}
	parse := func(key string) (uint64, error) {
		value := r.URL.Query().Get(key)
		if value == "" {
			return 0, nil
		}
		return strconv.ParseUint(value, 10, 64)
	}
	since, e1 := parse("since")
	epoch, e2 := parse("epoch")
	if e1 != nil || e2 != nil {
		http.Error(w, "Invalid revision", 400)
		return
	}
	swarmMu.RLock()
	cache := playbackInputs
	ctx := playbackContext
	swarmMu.RUnlock()
	if cache == nil || ctx.Err() != nil {
		http.Error(w, "Playback unavailable", 409)
		return
	}
	snapshot := cache.bundle().snapshot(epoch, since)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(snapshot)
}

// Failure is terminal for its interval, not an indefinitely pending coverage.
func (b *subtitleBundle) ahead(position float64) (float64, bool) {
	return b.aheadForSource(position, "")
}

func (b *subtitleBundle) aheadForSource(position float64, source string) (float64, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	tracks := []bundledSubtitle{}
	if source == "" || source == publicSubtitleSource(b.source) {
		for _, track := range b.tracks {
			tracks = append(tracks, *track)
		}
	} else {
		var found bool
		tracks, found = b.history[source]
		if !found {
			return 0, true
		}
	}
	ahead := 86400 - position
	required := false
	for _, track := range tracks {
		if !track.Embedded {
			continue
		}
		intervals := []preparedPlaybackInterval{}
		for _, part := range track.Parts {
			intervals = append(intervals, preparedPlaybackInterval{part.Start, part.End})
		}
		sort.Slice(intervals, func(i, j int) bool { return intervals[i].Start < intervals[j].Start })
		value := preparedPlaybackAhead(intervals, position)
		if value < ahead {
			ahead = value
		}
		required = true
	}
	return ahead, required
}
