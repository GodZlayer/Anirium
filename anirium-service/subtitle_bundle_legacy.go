package main

import (
	"fmt"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
)

func bundleVTT(cues []subtitleCue, offset float64) string {
	var text strings.Builder
	text.WriteString("WEBVTT\n\n")
	for _, cue := range cues {
		a, z := cue.Start-offset, cue.End-offset
		if z <= 0 {
			continue
		}
		a = math.Max(0, a)
		fmt.Fprintf(&text, "%s --> %s\n%s\n\n", formatWebVTTMillis(int64(math.Round(a*1000))), formatWebVTTMillis(int64(math.Round(z*1000))), cue.Text)
	}
	return text.String()
}

func (b *subtitleBundle) completeLegacy() {
	b.mu.Lock()
	epoch, duration := b.epoch, b.duration
	if b.closed || b.cache.ctx.Err() != nil || b.legacyEpoch == epoch || duration <= 0 {
		b.mu.Unlock()
		return
	}
	b.legacyEpoch = epoch
	b.workers.Add(1)
	b.mu.Unlock()
	go func() {
		defer b.workers.Done()
		limit := duration
		if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
			limit = 1
		}
		for start := 0.0; start < limit; start += 60 {
			b.mu.Lock()
			current := b.epoch == epoch
			b.mu.Unlock()
			if !current {
				return
			}
			job := b.schedule(start, true)
			if job == nil {
				return
			}
			select {
			case <-b.cache.ctx.Done():
				return
			case <-job.done:
				if job.err != nil {
					return
				}
			}
		}
	}()
}

func serveFastHeadResponse(w http.ResponseWriter, part subtitlePart, alignment string) {
	w.Header().Set("X-Anirium-Subtitle-Offset", strconv.FormatFloat(part.Start, 'f', 3, 64))
	w.Header().Set("X-Anirium-Subtitle-Partial", "1")
	w.Header().Set("X-Anirium-Subtitle-Coverage-End", strconv.FormatFloat(part.End, 'f', 3, 64))
	w.Header().Set("X-Anirium-Subtitle-Alignment", alignment)
	w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = fmt.Fprint(w, bundleVTT(part.Cues, part.Start))
}

func serveBundledSubtitle(w http.ResponseWriter, r *http.Request, cache *mediaInputCache, trackID string) bool {
	b := cache.existingBundle()
	if b == nil {
		return false
	}
	fast := r.URL.Query().Get("fast") == "1"
	start := -1.0
	if value := r.URL.Query().Get("start"); value != "" {
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil || !isFiniteWindowPosition(parsed) {
			http.Error(w, "Invalid subtitle interval", 400)
			return true
		}
		start = parsed
	}
	at := start
	if value := r.URL.Query().Get("at"); value != "" && start >= 0 {
		if parsed, err := strconv.ParseFloat(value, 64); err == nil && isFiniteWindowPosition(parsed) && parsed >= start && parsed < start+60 {
			at = math.Floor(parsed/4) * 4
		}
	}
	snapshot := b.snapshot(0, 0)
	for _, track := range snapshot.Tracks {
		if track.ID != trackID {
			continue
		}
		intervals := []preparedPlaybackInterval{}
		cues := []subtitleCue{}
		failed := false
		for _, part := range track.Parts {
			if part.Failed {
				if start < 0 || (start >= part.Start && start < part.End) {
					failed = true
				}
				continue
			}
			intervals = append(intervals, preparedPlaybackInterval{part.Start, part.End})
			cues = append(cues, part.Cues...)
		}
		sort.Slice(intervals, func(i, j int) bool { return intervals[i].Start < intervals[j].Start })
		b.mu.Lock()
		duration := b.duration
		b.mu.Unlock()
		ready := track.Complete || (duration > 0 && preparedPlaybackAhead(intervals, 0) >= duration)
		if start < 0 && os.Getenv("ANIRIUM_E2E_CHILD") != "1" && len(intervals) > 0 {
			ready = true
		}
		if start >= 0 {
			needed := 60.0
			if duration > 0 {
				needed = math.Min(60, math.Max(0, duration-start))
			}
			ready = track.Complete || (needed > 0 && preparedPlaybackAhead(intervals, start) >= needed)
		}
		if failed || (track.Status == "failed" && len(track.Parts) == 0) {
			if start >= 0 && track.Embedded && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
				if fast {
					if headPart, ok := b.fastHeadFor(trackID, at); ok {
						serveFastHeadResponse(w, headPart, track.Alignment)
						return true
					}
				}
				return false
			}
			http.Error(w, "Subtitle preparation failed", 502)
			return true
		}
		if !ready {
			if fast && start >= 0 {
				if headPart, ok := b.fastHeadFor(trackID, at); ok {
					if track.Embedded {
						b.schedule(start, false)
					}
					serveFastHeadResponse(w, headPart, track.Alignment)
					return true
				}
				if track.Embedded {
					singleTrack := []SubtitleTrack{track.track}
					src := track.track.Source
					ctx := b.cache.ctx
					go func() {
						_ = b.prepareFastHead(ctx, src, singleTrack, at, 16)
					}()
					b.schedule(start, false)
				}
				w.Header().Set("Retry-After", "1")
				w.Header().Set("Cache-Control", "no-store")
				w.WriteHeader(202)
				return true
			}
			if start < 0 && track.Embedded {
				b.completeLegacy()
			} else if start >= 0 && track.Embedded {
				b.schedule(start, false)
			}
			w.Header().Set("Retry-After", "2")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(202)
			return true
		}
		sort.SliceStable(cues, func(i, j int) bool { return cues[i].Start < cues[j].Start })
		offset := math.Max(0, start)
		if start >= 0 {
			bounded := []subtitleCue{}
			for _, cue := range cues {
				if cue.Start >= start+60 {
					continue
				}
				cue.End = math.Min(cue.End, start+60)
				bounded = append(bounded, cue)
			}
			cues = bounded
		}
		if start >= 0 {
			w.Header().Set("X-Anirium-Subtitle-Offset", strconv.FormatFloat(start, 'f', 3, 64))
		} else {
			w.Header().Set("X-Anirium-Subtitle-Complete", "1")
			w.Header().Set("X-Anirium-Subtitle-Offset", "0.000")
		}
		w.Header().Set("X-Anirium-Subtitle-Partial", "0")
		w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Anirium-Subtitle-Alignment", track.Alignment)
		_, _ = fmt.Fprint(w, bundleVTT(cues, offset))
		return true
	}
	if fast && start >= 0 {
		if headPart, ok := b.fastHeadFor(trackID, at); ok {
			serveFastHeadResponse(w, headPart, "unverified")
			return true
		}
	}
	if snapshot.Source == "" {
		// Legacy full-variant clients may never create a window/producer.
		// Preserve their existing shared extraction until a bundle is active.
		return false
	}
	swarmMu.RLock()
	for _, track := range subtitleTracksLocked() {
		if track.ID == trackID {
			swarmMu.RUnlock()
			return false
		}
	}
	swarmMu.RUnlock()
	http.Error(w, "Subtitle track unavailable", 404)
	return true
}
