package main

import (
	"math"
	"time"
)

var sessionPreparationStarted bool // protected by swarmMu

// Caller holds swarmMu. Ownership ends with this playback generation, including
// while waiting for cache space or after EOF; a later seek can restart media.
func startSessionPreparationLocked() {
	if sessionPreparationStarted || !sessionContinuousPreparationLocked() {
		return
	}
	sessionPreparationStarted = true
	ctx, generation, workers := playbackContext, playbackGeneration, playbackWorkers
	workers.Add(1)
	go func() {
		defer workers.Done()
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// Shutdown may wait for workers while holding preparation's lock.
				if !preparePlaybackMu.TryLock() {
					continue
				}
				swarmMu.RLock()
				active := playbackGeneration == generation && ctx.Err() == nil
				position := currentPlaybackSession.Position
				swarmMu.RUnlock()
				if active && !playbackShuttingDown {
					replenishPlaybackWindowBuffer(position)
				}
				preparePlaybackMu.Unlock()
			}
		}
	}()
}

const playbackReplenishmentReserveSeconds = 48.0

// One in-flight window may exceed this budget. Consumed media keeps 48 seconds
// of decoder back buffer before retirement; raw torrent storage is separate.
const playbackEncodedCacheBudget int64 = 512 << 20

func sessionContinuousPreparationLocked() bool {
	return currentPlaybackSession.Generation == playbackGeneration && currentPlaybackSession.Revision > 0
}

// The timeline is immutable across replenishment, and replaced on seek. Old
// browser polls may observe media but must never move the new session's clock.
func updateSessionPositionLocked(timeline string, position float64, audio string) bool {
	window := currentPlaybackWindow
	if !sessionContinuousPreparationLocked() || window == nil || window.ctx.Err() != nil || !isFiniteWindowPosition(position) || audio != currentPlaybackSession.Audio {
		return false
	}
	if timeline != "/hls/"+window.timelineID+"-video/master.m3u8" {
		return false
	}
	limit := window.EpisodeDuration
	tolerance := 0.0
	if window.EndOfEpisode && window.Status == "ready" {
		limit = window.Start + window.DeliveredDuration
		tolerance = 0.25
	}
	// Timestamp rounding at the decoder's final sample is allowed only after
	// the actual final media has been produced, never from a guessed duration.
	if limit > 0 && position > limit+tolerance {
		return false
	}
	currentPlaybackSession.Position = position
	return true
}

func encodedWindowCacheBytesLocked() int64 {
	var total int64
	for _, window := range retainedPlaybackWindows {
		total += window.cacheBytes
	}
	if currentPlaybackWindow != nil {
		total += currentPlaybackWindow.cacheBytes
	}
	if prefetchedPlaybackWindow != nil {
		total += prefetchedPlaybackWindow.cacheBytes
	}
	return total
}

func trimConsumedWindowCacheLocked(position float64) {
	for encodedWindowCacheBytesLocked() >= playbackEncodedCacheBudget && len(retainedPlaybackWindows) > 0 {
		oldest := retainedPlaybackWindows[0]
		if position < oldest.Start+oldest.DeliveredDuration+48 {
			return
		}
		retirePlaybackWindowLocked(oldest)
		retainedPlaybackWindows = retainedPlaybackWindows[1:]
	}
}

// Called with the playback's actual position, not the last generated window.
// HTTP authorization and preparePlaybackMu are the caller's responsibility.
// Never promote while the decoder still needs a window that retention would
// evict. Video readiness is only scheduling input, not the joint playback gate.
func replenishPlaybackWindowBuffer(position float64) bool {
	if !isFiniteWindowPosition(position) {
		return false
	}
	swarmMu.Lock()
	current := currentPlaybackWindow
	continuous := sessionContinuousPreparationLocked()
	if continuous {
		trimConsumedWindowCacheLocked(position)
	}
	reserve := playbackReplenishmentReserveSeconds
	if currentPlaybackSession.Generation == playbackGeneration && currentPlaybackSession.BufferSeconds == 60 {
		reserve = 72
	}
	maximumLead := reserve + 24
	if current == nil || current.ctx.Err() != nil || current.Status != "ready" || current.EndOfEpisode {
		swarmMu.Unlock()
		return false
	}
	end := current.Start + current.DeliveredDuration
	if next := prefetchedPlaybackWindow; next != nil && next.ctx.Err() == nil && next.Status == "ready" {
		end = next.Start + next.DeliveredDuration
		if !continuous && end-position >= reserve {
			swarmMu.Unlock()
			return true
		}
		// At most72s preparation lead and two retained windows. Do not drop
		// the oldest until playback has actually passed its media endpoint.
		if !continuous && len(retainedPlaybackWindows) >= 2 {
			oldest := retainedPlaybackWindows[0]
			if position < oldest.Start+oldest.DeliveredDuration {
				swarmMu.Unlock()
				return false
			}
		}
		if (!continuous && end-position > maximumLead) || math.Abs(next.Start-(current.Start+current.DeliveredDuration)) > 0.05 {
			swarmMu.Unlock()
			return false
		}
		retainPlaybackWindowLocked(current)
		currentPlaybackWindow, prefetchedPlaybackWindow = next, nil
		current = next
	}
	quality, start := current.Quality, current.Start+current.DeliveredDuration
	if current.EndOfEpisode || (continuous && encodedWindowCacheBytesLocked() >= playbackEncodedCacheBudget) || (!continuous && (start-position >= reserve || start+24-position > maximumLead)) {
		swarmMu.Unlock()
		return true
	}
	swarmMu.Unlock()
	return requestPlaybackWindow(quality, start, true)
}
