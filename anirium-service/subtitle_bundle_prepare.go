package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

func activeClientSubtitleTrackID() string {
	for _, client := range globalHub.snapshotClients() {
		if id := client.getActiveSubtitleTrack(); id != "" && id != "off" && hasActivePlaybackGrant(client.getAuthorizedTicket()) {
			return id
		}
	}
	return ""
}

func activeSubtitleTrackID() string {
	if id := activeClientSubtitleTrackID(); id != "" {
		return id
	}
	swarmMu.RLock()
	activeID := ""
	if currentPlaybackSession.Generation == playbackGeneration && currentPlaybackSession.Revision > 0 && currentPlaybackSession.Subtitle != "" {
		activeID = currentPlaybackSession.Subtitle
	}
	swarmMu.RUnlock()
	if activeID != "" && activeID != "off" {
		return activeID
	}
	return ""
}

func activeSubtitleTrackSource(fallbackSource string) string {
	activeID := activeSubtitleTrackID()
	if activeID == "" {
		return fallbackSource
	}
	swarmMu.RLock()
	tracks := subtitleTracksLocked()
	swarmMu.RUnlock()
	for _, tr := range tracks {
		if tr.ID == activeID && tr.Source != "" && tr.StreamIndex >= 0 {
			return tr.Source
		}
	}
	return fallbackSource
}

func (b *subtitleBundle) configure(source string, tracks []SubtitleTrack, duration float64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.source == source {
		if duration > 0 && (b.duration <= 0 || math.Abs(b.duration-math.Min(duration, 86400)) > 0.5) {
			b.duration = math.Min(duration, 86400)
		}
		for _, track := range tracks {
			if track.Source != source || track.StreamIndex < 0 {
				continue
			}
			if b.tracks[track.ID] == nil {
				b.revision++
				b.tracks[track.ID] = &bundledSubtitle{ID: track.ID, Language: track.Language, Title: track.Title, Status: "preparing", Alignment: "verified", Embedded: true, Parts: []subtitlePart{}, track: track, revision: b.revision}
			}
		}
		return
	}
	if b.cancel != nil {
		b.cancel()
	}
	b.archiveSourceLocked()
	b.source = source
	b.epoch++
	b.revision++
	b.duration = math.Min(duration, 86400)
	b.jobs = map[float64]*subtitleBatchJob{}
	for id, track := range b.tracks {
		if track.track.Source != "" {
			delete(b.tracks, id)
		}
	}
	for _, track := range tracks {
		if track.Source != source || track.StreamIndex < 0 {
			continue
		}
		b.tracks[track.ID] = &bundledSubtitle{ID: track.ID, Language: track.Language, Title: track.Title, Status: "preparing", Alignment: "verified", Embedded: true, Parts: []subtitlePart{}, track: track, revision: b.revision}
	}
}

func (b *subtitleBundle) schedule(start float64, speculative bool) *subtitleBatchJob {
	activeID := ""
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		activeID = activeClientSubtitleTrackID()
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	start = math.Floor(start/60) * 60
	if job := b.jobs[start]; job != nil {
		return job
	}
	if b.closed || b.cache.ctx.Err() != nil || b.source == "" || !isFiniteWindowPosition(start) || start >= 86400 || (b.duration > 0 && start >= b.duration) || len(b.jobs) >= 1441 {
		return nil
	}
	pending := 0
	for _, queued := range b.jobs {
		select {
		case <-queued.done:
		default:
			pending++
		}
	}
	if pending >= 8 {
		return nil
	}
	tracks := []SubtitleTrack{}
	for _, track := range b.tracks {
		if track.Embedded {
			tracks = append(tracks, track.track)
		}
	}
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" && len(tracks) > 4 {
		sort.SliceStable(tracks, func(i, j int) bool {
			if activeID != "" {
				if tracks[i].ID == activeID && tracks[j].ID != activeID {
					return true
				}
				if tracks[j].ID == activeID && tracks[i].ID != activeID {
					return false
				}
			}
			return prioritySubtitleRank(tracks[i]) < prioritySubtitleRank(tracks[j])
		})
		tracks = tracks[:4]
	}
	job := &subtitleBatchJob{done: make(chan struct{}), start: start, source: b.source, epoch: b.epoch, tracks: tracks, speculative: speculative}
	b.jobs[start] = job
	if !speculative && b.running != nil && b.running.start != start && b.cancel != nil {
		b.cancel()
	}
	b.workers.Add(1)
	go func() { defer b.workers.Done(); b.run(job) }()
	return job
}

func (b *subtitleBundle) run(job *subtitleBatchJob) {
	b.work.Lock()
	defer b.work.Unlock()
	b.mu.Lock()
	if b.cache.ctx.Err() != nil || job.epoch != b.epoch {
		job.err = context.Canceled
		close(job.done)
		b.mu.Unlock()
		return
	}
	ctx, cancel := context.WithTimeout(b.cache.ctx, b.budget)
	b.running = job
	b.cancel = cancel
	b.mu.Unlock()
	values := b.extract(ctx, b.cache, job.source, job.tracks, job.start)
	var (
		notifyReady bool
		notifyStart float64
		notifyEnd   float64
	)
	defer func() {
		if notifyReady {
			broadcastWSEvent("subtitle_ready", map[string]interface{}{
				"start": notifyStart,
				"end":   notifyEnd,
			})
			pushBundledSubtitleBlockToSubscribers(b, notifyStart, notifyEnd)
			broadcastStartupTelemetry()
		}
	}()
	b.mu.Lock()
	defer b.mu.Unlock()
	defer cancel()
	defer close(job.done)
	if job.epoch != b.epoch || b.cache.ctx.Err() != nil {
		job.err = context.Canceled
		return
	}
	if ctx.Err() == context.Canceled {
		delete(b.jobs, job.start)
		job.err = context.Canceled
		return
	}
	if ctx.Err() != nil {
		values = map[int]string{}
	}
	b.revision++
	end := job.start + 60
	if b.duration > 0 {
		end = math.Min(end, b.duration)
	}
	readyCount := 0
	for _, track := range job.tracks {
		state := b.tracks[track.ID]
		if state == nil {
			continue
		}
		content, ok := values[track.StreamIndex]
		cues, err := parseBundleCues(content, job.start)
		failed := !ok || err != nil || b.bytes+len(content) > 64<<20
		if !failed {
			bounded := []subtitleCue{}
			for _, cue := range cues {
				if cue.Start >= end {
					continue
				}
				cue.End = math.Min(cue.End, end)
				if cue.End > cue.Start {
					bounded = append(bounded, cue)
				}
			}
			cues = bounded
		}
		status := "ready"
		if failed {
			status = "failed"
			cues = []subtitleCue{}
		}
		newPart := subtitlePart{Start: job.start, End: end, Cues: cues, Failed: failed, Revision: b.revision}
		replaced := false
		for i, existing := range state.Parts {
			if math.Abs(existing.Start-job.start) < 0.05 {
				if existing.Failed || !failed {
					state.Parts[i] = newPart
				}
				replaced = true
				break
			}
		}
		if !replaced {
			state.Parts = append(state.Parts, newPart)
		}
		state.Status = status
		state.revision = b.revision
		intervals := []preparedPlaybackInterval{}
		for _, part := range state.Parts {
			if !part.Failed {
				intervals = append(intervals, preparedPlaybackInterval{part.Start, part.End})
			}
		}
		sort.Slice(intervals, func(i, j int) bool { return intervals[i].Start < intervals[j].Start })
		state.Complete = b.duration > 0 && preparedPlaybackAhead(intervals, 0) >= b.duration
		if !failed {
			readyCount++
			b.bytes += len(content)
			b.cache.rememberSubtitleWindow(subtitleWindowKey{job.source, track.StreamIndex, job.start}, content)
			if epKey := currentEpisodeRetentionKey(); epKey != "" && len(cues) > 0 {
				blk := persistedSubtitleBlock{
					TrackID:  track.ID,
					Language: track.Language,
					Title:    track.Title,
					Start:    job.start,
					End:      end,
					Complete: state.Complete,
					VTT:      bundleVTT(cues, job.start),
				}
				go globalEpisodeRetention.saveEpisodeSubtitle(epKey, blk)
				go globalEpisodeStorage.saveSubtitle(epKey, blk)
			}
		}
	}
	if readyCount == 0 && job.speculative && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		delete(b.jobs, job.start)
		for _, track := range job.tracks {
			if state := b.tracks[track.ID]; state != nil {
				filtered := state.Parts[:0]
				for _, part := range state.Parts {
					if part.Failed && math.Abs(part.Start-job.start) < 0.05 {
						continue
					}
					filtered = append(filtered, part)
				}
				state.Parts = filtered
			}
		}
	}
	b.running = nil
	b.cancel = nil
	if readyCount > 0 {
		notifyReady = true
		notifyStart = job.start
		notifyEnd = end
	}
	appendLog(fmt.Sprintf("Subtitle batch tracks=%d ready=%d start=%.0f", len(job.tracks), readyCount, job.start))
}

func (b *subtitleBundle) hasTrackReadyOrFastHead(trackID string) bool {
	if b == nil {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if state := b.tracks[trackID]; state != nil {
		if state.Complete || state.Status == "ready" {
			return true
		}
		for _, part := range state.Parts {
			if !part.Failed {
				return true
			}
		}
	}
	return len(b.fastHeads[trackID]) > 0
}

func fastHeadMinEnd(start, span, duration float64) float64 {
	if span <= 0 {
		span = 16
	}
	minAhead := math.Min(span, 8.0)
	minEnd := start + minAhead
	if duration > 0 {
		minEnd = math.Min(minEnd, duration)
	}
	return minEnd
}

func (b *subtitleBundle) fastHeadFor(trackID string, start float64) (subtitlePart, bool) {
	if b == nil {
		return subtitlePart{}, false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	minEnd := fastHeadMinEnd(start, 16, b.duration)
	var best subtitlePart
	found := false
	for _, part := range b.fastHeads[trackID] {
		if part.Failed {
			continue
		}
		coversLookahead := part.Start <= start+0.05 && part.End >= minEnd-0.05
		coversExactStart := math.Abs(part.Start-start) < 0.05 && part.End > start+0.05
		if !coversLookahead && !coversExactStart {
			continue
		}
		if !found || part.End > best.End {
			best = part
			found = true
		}
	}
	if found {
		copyPart := best
		copyPart.Cues = append([]subtitleCue(nil), best.Cues...)
		return copyPart, true
	}
	if state := b.tracks[trackID]; state != nil {
		endLimit := start + 16
		if b.duration > 0 {
			endLimit = math.Min(endLimit, b.duration)
		}
		for _, part := range state.Parts {
			if part.Failed {
				continue
			}
			coversLookahead := part.Start <= start+0.05 && part.End >= minEnd-0.05
			coversExactStart := math.Abs(part.Start-start) < 0.05 && part.End > start+0.05
			if !coversLookahead && !coversExactStart {
				continue
			}
			sliceEnd := math.Min(part.End, math.Max(minEnd, endLimit))
			slicedCues := []subtitleCue{}
			for _, cue := range part.Cues {
				if cue.End <= start || cue.Start >= sliceEnd {
					continue
				}
				c := cue
				if c.Start < start {
					c.Start = start
				}
				if c.End > sliceEnd {
					c.End = sliceEnd
				}
				if c.End > c.Start {
					slicedCues = append(slicedCues, c)
				}
			}
			return subtitlePart{Start: start, End: sliceEnd, Cues: slicedCues, Revision: part.Revision}, true
		}
	}
	return subtitlePart{}, false
}

func (b *subtitleBundle) hasReadyBlock(trackID string, blockStart float64) bool {
	if b == nil {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	state := b.tracks[trackID]
	if state == nil {
		return false
	}
	if state.Complete {
		return true
	}
	minEnd := blockStart + 60
	if b.duration > 0 {
		minEnd = math.Min(minEnd, b.duration)
	}
	if minEnd <= blockStart {
		return false
	}
	for _, part := range state.Parts {
		if !part.Failed && part.Start <= blockStart+0.05 && part.End >= minEnd-0.05 {
			return true
		}
	}
	return false
}

func (b *subtitleBundle) recordFastHead(trackID string, start, end float64, vtt string) {
	if b == nil || trackID == "" || end <= start {
		return
	}
	cues, err := parseBundleCues(vtt, start)
	if err != nil {
		return
	}
	bounded := []subtitleCue{}
	for _, cue := range cues {
		if cue.Start >= end {
			continue
		}
		cue.End = math.Min(cue.End, end)
		if cue.End > cue.Start {
			bounded = append(bounded, cue)
		}
	}
	b.mu.Lock()
	if b.closed || b.cache.ctx.Err() != nil {
		b.mu.Unlock()
		return
	}
	if b.fastHeads == nil {
		b.fastHeads = map[string][]subtitlePart{}
	}
	b.revision++
	part := subtitlePart{Start: start, End: end, Cues: bounded, Revision: b.revision}
	replaced := false
	for i, existing := range b.fastHeads[trackID] {
		if math.Abs(existing.Start-start) < 0.05 {
			b.fastHeads[trackID][i] = part
			replaced = true
			break
		}
	}
	if !replaced {
		b.fastHeads[trackID] = append(b.fastHeads[trackID], part)
	}
	b.mu.Unlock()
	broadcastWSEvent("subtitle_ready", map[string]interface{}{
		"trackId": trackID,
		"start":   start,
		"end":     end,
	})
	pushFastHeadSubtitleToSubscribers(b, start, end, trackID)
	broadcastStartupTelemetry()
}

func (b *subtitleBundle) recordBundledTrackWindow(track SubtitleTrack, start, end float64, vtt string) bool {
	if b == nil || track.ID == "" || track.StreamIndex < 0 || end <= start {
		return false
	}
	cues, err := parseBundleCues(vtt, start)
	if err != nil {
		return false
	}
	bounded := []subtitleCue{}
	for _, cue := range cues {
		if cue.Start >= end {
			continue
		}
		cue.End = math.Min(cue.End, end)
		if cue.End > cue.Start {
			bounded = append(bounded, cue)
		}
	}
	b.mu.Lock()
	if b.closed || b.cache.ctx.Err() != nil || (track.Source != "" && b.source != "" && track.Source != b.source) {
		b.mu.Unlock()
		return false
	}
	state := b.tracks[track.ID]
	if state == nil {
		b.mu.Unlock()
		return false
	}
	if b.duration > 0 {
		end = math.Min(end, b.duration)
	}
	b.revision++
	newPart := subtitlePart{Start: start, End: end, Cues: bounded, Failed: false, Revision: b.revision}
	replaced := false
	for i, existing := range state.Parts {
		if math.Abs(existing.Start-start) < 0.05 {
			state.Parts[i] = newPart
			replaced = true
			break
		}
	}
	if !replaced {
		state.Parts = append(state.Parts, newPart)
	}
	state.Status = "ready"
	state.revision = b.revision
	intervals := []preparedPlaybackInterval{}
	for _, part := range state.Parts {
		if !part.Failed {
			intervals = append(intervals, preparedPlaybackInterval{part.Start, part.End})
		}
	}
	sort.Slice(intervals, func(i, j int) bool { return intervals[i].Start < intervals[j].Start })
	state.Complete = b.duration > 0 && preparedPlaybackAhead(intervals, 0) >= b.duration
	b.cache.rememberSubtitleWindow(subtitleWindowKey{track.Source, track.StreamIndex, start}, vtt)
	b.mu.Unlock()

	broadcastWSEvent("subtitle_ready", map[string]interface{}{
		"trackId": track.ID,
		"start":   start,
		"end":     end,
	})
	broadcastStartupTelemetry()
	return true
}

func (b *subtitleBundle) prepareFastHead(ctx context.Context, source string, tracks []SubtitleTrack, start, span float64) bool {
	if b == nil || source == "" {
		return false
	}
	start = math.Floor(math.Max(0, start)/4) * 4
	if span <= 0 {
		span = 16
	}
	sourceTracks := []SubtitleTrack{}
	for _, track := range tracks {
		if track.Source == source && track.StreamIndex >= 0 {
			sourceTracks = append(sourceTracks, track)
		}
	}
	if len(sourceTracks) == 0 {
		return false
	}
	b.mu.Lock()
	if b.closed || b.cache.ctx.Err() != nil {
		b.mu.Unlock()
		return false
	}
	end := start + span
	if b.duration > 0 {
		if start >= b.duration {
			b.mu.Unlock()
			return false
		}
		end = math.Min(end, b.duration)
		span = end - start
	}
	if span <= 0 {
		b.mu.Unlock()
		return false
	}
	minEnd := fastHeadMinEnd(start, span, b.duration)
	allReady := true
	for _, track := range sourceTracks {
		hasFast := false
		for _, part := range b.fastHeads[track.ID] {
			if !part.Failed && part.Start <= start+0.05 && part.End >= minEnd-0.05 {
				hasFast = true
				break
			}
		}
		if !hasFast {
			if state := b.tracks[track.ID]; state != nil {
				for _, part := range state.Parts {
					if !part.Failed && part.Start <= start+0.05 && part.End >= minEnd-0.05 {
						hasFast = true
						break
					}
				}
			}
		}
		if !hasFast {
			allReady = false
			break
		}
	}
	if allReady {
		b.mu.Unlock()
		return true
	}
	if b.fastHeads == nil {
		b.fastHeads = map[string][]subtitlePart{}
	}
	if b.fastFlights == nil {
		b.fastFlights = map[string]chan struct{}{}
	}
	var streamTokens strings.Builder
	streamTokens.WriteByte(',')
	for _, tr := range sourceTracks {
		fmt.Fprintf(&streamTokens, "%d,", tr.StreamIndex)
	}
	flightPrefix := fmt.Sprintf("%s@%.0f:%.0f#", source, start, span)
	flightKey := flightPrefix + streamTokens.String()
	var existing chan struct{}
	if ch := b.fastFlights[flightKey]; ch != nil {
		existing = ch
	} else {
		for k, ch := range b.fastFlights {
			if !strings.HasPrefix(k, flightPrefix) {
				continue
			}
			tokens := strings.TrimPrefix(k, flightPrefix)
			coversAll := true
			for _, tr := range sourceTracks {
				if !strings.Contains(tokens, fmt.Sprintf(",%d,", tr.StreamIndex)) {
					coversAll = false
					break
				}
			}
			if coversAll {
				existing = ch
				break
			}
		}
	}
	if existing != nil {
		b.mu.Unlock()
		select {
		case <-existing:
		case <-ctx.Done():
			return false
		case <-b.cache.ctx.Done():
			return false
		}
		_, ok := b.fastHeadFor(sourceTracks[0].ID, start)
		return ok
	}
	done := make(chan struct{})
	b.fastFlights[flightKey] = done
	b.fastWorkers.Add(1)
	extractSpanFn := b.extractSpan
	extractBatchFn := b.extract
	b.mu.Unlock()

	var readyCount int
	func() {
		defer b.fastWorkers.Done()
		fastCtx, cancel := context.WithTimeout(b.cache.ctx, 20*time.Second)
		defer cancel()
		if ctx != nil {
			stop := context.AfterFunc(ctx, cancel)
			defer stop()
		}
		var values map[int]string
		if extractSpanFn != nil {
			values = extractSpanFn(fastCtx, b.cache, source, sourceTracks, start, span)
		} else if extractBatchFn != nil {
			values = extractBatchFn(fastCtx, b.cache, source, sourceTracks, start)
		}
		b.mu.Lock()
		defer b.mu.Unlock()
		defer close(done)
		delete(b.fastFlights, flightKey)
		if b.closed || b.cache.ctx.Err() != nil || (fastCtx.Err() != nil && len(values) == 0) {
			return
		}
		b.revision++
		for _, track := range sourceTracks {
			content, ok := values[track.StreamIndex]
			if !ok {
				continue
			}
			cues, err := parseBundleCues(content, start)
			if err != nil {
				continue
			}
			bounded := []subtitleCue{}
			for _, cue := range cues {
				if cue.Start >= end {
					continue
				}
				cue.End = math.Min(cue.End, end)
				if cue.End > cue.Start {
					bounded = append(bounded, cue)
				}
			}
			part := subtitlePart{Start: start, End: end, Cues: bounded, Revision: b.revision}
			replaced := false
			for i, existing := range b.fastHeads[track.ID] {
				if math.Abs(existing.Start-start) < 0.05 {
					b.fastHeads[track.ID][i] = part
					replaced = true
					break
				}
			}
			if !replaced {
				b.fastHeads[track.ID] = append(b.fastHeads[track.ID], part)
			}
			if st := b.tracks[track.ID]; st != nil {
				st.revision = b.revision
			}
			readyCount++
		}
	}()
	if readyCount > 0 {
		broadcastWSEvent("subtitle_ready", map[string]interface{}{
			"start": start,
			"end":   end,
		})
		pushFastHeadSubtitleToSubscribers(b, start, end, "")
		broadcastStartupTelemetry()
		appendLog(fmt.Sprintf("Subtitle fast-head tracks=%d ready=%d start=%.0f span=%.0f", len(sourceTracks), readyCount, start, span))
		return true
	}
	return false
}

func prioritySubtitleRank(track SubtitleTrack) int {
	lang := canonicalLanguage(track.Language)
	forced := isForcedSubtitleTitle(track.Title)
	sdh := isSDHSubtitleTitle(track.Title)
	if lang == "por" && !forced {
		base := 2
		if isBrazilianPortugueseTitle(track.Title) {
			base = 0
		}
		if sdh {
			return base + 1
		}
		return base
	}
	if lang == "eng" && !forced {
		if sdh {
			return 5
		}
		return 4
	}
	if lang == "por" || lang == "eng" {
		return 6
	}
	return 7
}

func prewarmPrioritySubtitles(ctx context.Context, cache *mediaInputCache, primarySource string, start float64) {
	if cache == nil {
		return
	}
	if ctx == nil {
		ctx = cache.ctx
	}
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		primarySource = activeSubtitleTrackSource(primarySource)
	}
	swarmMu.RLock()
	tracks := subtitleTracksLocked()
	episodeDuration := playbackEpisodeDurationLocked()
	swarmMu.RUnlock()

	b := cache.bundle()
	if primarySource != "" {
		b.configure(primarySource, tracks, episodeDuration)
	}
	b.startExtras(tracks)

	primaryCandidates := []SubtitleTrack{}
	primaryHasPor := false
	for _, track := range tracks {
		if track.Source != primarySource || track.StreamIndex < 0 {
			continue
		}
		if canonicalLanguage(track.Language) == "por" {
			primaryHasPor = true
		}
		primaryCandidates = append(primaryCandidates, track)
	}
	sort.SliceStable(primaryCandidates, func(i, j int) bool {
		return prioritySubtitleRank(primaryCandidates[i]) < prioritySubtitleRank(primaryCandidates[j])
	})

	priorityPrimary := []SubtitleTrack{}
	otherPrimary := []SubtitleTrack{}
	for _, track := range primaryCandidates {
		lang := canonicalLanguage(track.Language)
		if (lang == "por" || lang == "eng") && len(priorityPrimary) < 4 {
			priorityPrimary = append(priorityPrimary, track)
		} else {
			otherPrimary = append(otherPrimary, track)
		}
	}
	if len(priorityPrimary) == 0 && len(otherPrimary) > 0 {
		limit := 2
		if len(otherPrimary) < limit {
			limit = len(otherPrimary)
		}
		priorityPrimary = append(priorityPrimary, otherPrimary[:limit]...)
		otherPrimary = otherPrimary[limit:]
	}
	var altPorTrack *SubtitleTrack
	altPorRank := 99
	if !primaryHasPor {
		for _, track := range tracks {
			if track.Source != "" && track.Source != primarySource && track.StreamIndex >= 0 && canonicalLanguage(track.Language) == "por" {
				rank := prioritySubtitleRank(track)
				if rank < altPorRank {
					copyTrack := track
					altPorTrack = &copyTrack
					altPorRank = rank
				}
			}
		}
	}

	var wg sync.WaitGroup
	if primarySource != "" && len(priorityPrimary) > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b.prepareFastHead(ctx, primarySource, priorityPrimary, start, 16)
		}()
	}
	if altPorTrack != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b.prepareFastHead(ctx, altPorTrack.Source, []SubtitleTrack{*altPorTrack}, start, 16)
		}()
	}
	wg.Wait()
	if primarySource != "" && len(otherPrimary) > 0 && len(otherPrimary) <= 4 {
		go func() {
			_ = b.prepareFastHead(cache.ctx, primarySource, otherPrimary, start, 16)
		}()
	}
}

func prepareWindowSubtitles(ctx context.Context, cache *mediaInputCache, source string, start, duration float64) error {
	return prepareWindowSubtitlesWithMode(ctx, cache, source, start, duration, false)
}

func prepareWindowSubtitlesWithMode(ctx context.Context, cache *mediaInputCache, source string, start, duration float64, speculative bool) error {
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		source = activeSubtitleTrackSource(source)
	}
	if source == "" || cache == nil {
		return nil
	}
	swarmMu.RLock()
	tracks := subtitleTracksLocked()
	episodeDuration := playbackEpisodeDurationLocked()
	swarmMu.RUnlock()
	b := cache.bundle()
	b.configure(source, tracks, episodeDuration)
	b.startExtras(tracks)
	b.mu.Lock()
	embedded := 0
	for _, track := range b.tracks {
		if track.Embedded {
			embedded++
		}
	}
	b.mu.Unlock()
	if embedded == 0 {
		return nil
	}
	for block := math.Floor(start/60) * 60; block < start+duration; block += 60 {
		job := b.schedule(block, speculative)
		if job == nil {
			return fmt.Errorf("subtitle interval unavailable")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-job.done:
			if job.err != nil {
				return job.err
			}
		}
	}
	b.schedule(math.Ceil((start+duration)/60)*60, true)
	return nil
}
