package main

import (
	"context"
	"math"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const metadataDiscoveryBudget = 5 * time.Second
const streamInventoryBudget = 10 * time.Second

func discoveryMetadataBudget() time.Duration {
	if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		return metadataDiscoveryBudget
	}
	return 45 * time.Second
}

func discoveryInventoryBudget() time.Duration {
	if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		return streamInventoryBudget
	}
	return 120 * time.Second
}

func selectPriorityMagnets(magnets []string, limit int) []string {
	if limit <= 0 || len(magnets) == 0 {
		return nil
	}
	if limit > len(magnets) {
		limit = len(magnets)
	}
	selected := make([]string, 0, limit)
	chosen := make(map[int]bool, limit)
	if len(magnets) > 0 && limit > 0 {
		selected = append(selected, magnets[0])
		chosen[0] = true
	}
	multiKeywords := []string{
		"multisub", "multi-sub", "multi sub", "pt-br", "ptbr", "portugues",
		"brazil", "por", "dual", "erai-raws", "subsplease", "amzn", "b-global",
		"dkb", "asw", "netflix", "multi", "toonshub", "varyg", "judas", "ember", "crunchyroll",
	}
	for i := 1; i < len(magnets) && len(selected) < limit; i++ {
		name := ""
		if u, err := url.Parse(magnets[i]); err == nil {
			name = u.Query().Get("dn")
		}
		if name == "" {
			if decoded, err := url.QueryUnescape(magnets[i]); err == nil {
				name = decoded
			} else {
				name = magnets[i]
			}
		}
		lower := strings.ToLower(name)
		matched := false
		for _, kw := range multiKeywords {
			if strings.Contains(lower, kw) {
				matched = true
				break
			}
		}
		if matched {
			selected = append(selected, magnets[i])
			chosen[i] = true
		}
	}
	for i := 0; i < len(magnets) && len(selected) < limit; i++ {
		if !chosen[i] {
			selected = append(selected, magnets[i])
		}
	}
	return selected
}

func waitInitialWindowReady(parent context.Context, generation uint64) {
	deadline := time.Now().Add(20 * time.Second)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		swarmMu.RLock()
		done := generation != playbackGeneration || (currentPlaybackWindow != nil && currentPlaybackWindow.Status == "ready" && (currentPlaybackWindow.EndOfEpisode || preparedCacheEndLocked()-currentPlaybackWindow.Start >= 12))
		swarmMu.RUnlock()
		if done || time.Now().After(deadline) {
			return
		}
		select {
		case <-parent.Done():
			return
		case <-ticker.C:
		}
	}
}

// discoverPlaybackInventory coordinates metadata expansion and media probing.
// When onFirstReady is provided, it is invoked as soon as the first playable media
// source finishes probing, allowing immediate playback without waiting for slower peers.
func discoverPlaybackInventory(parent context.Context, magnets []string, generation uint64, onFirstReady ...func()) {
	orderedMagnets := selectPriorityMagnets(magnets, len(magnets))
	priorityMagnets := selectPriorityMagnets(orderedMagnets, 12)

	prewarmNewlyDiscoveredSubtitles := func(src string) {
		if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
			return
		}
		swarmMu.RLock()
		if generation != playbackGeneration || playbackInputs == nil {
			swarmMu.RUnlock()
			return
		}
		subTracks := subtitleTracksLocked()
		primarySrc := currentSubtitleVideoSourceLocked(playbackInputs)
		if primarySrc == "" {
			primarySrc = playbackInputs.primaryVideoSource()
		}
		inputs := playbackInputs
		pCtx := playbackContext
		swarmMu.RUnlock()

		inputs.bundle().startExtras(subTracks)

		primaryHasPor := false
		var bestPorTrack *SubtitleTrack
		bestPorRank := 99
		for _, track := range subTracks {
			if track.StreamIndex < 0 || canonicalLanguage(track.Language) != "por" {
				continue
			}
			if primarySrc != "" && track.Source == primarySrc {
				primaryHasPor = true
			}
			if track.Source == src {
				rank := 2
				if !isForcedSubtitleTitle(track.Title) {
					rank = 1
					if isBrazilianPortugueseTitle(track.Title) {
						rank = 0
					}
				}
				if rank < bestPorRank {
					copyTrack := track
					bestPorTrack = &copyTrack
					bestPorRank = rank
				}
			}
		}
		if primarySrc != "" {
			swarmMu.RLock()
			resumePos := math.Floor(math.Max(0, currentPlaybackSession.Position)/4) * 4
			swarmMu.RUnlock()
			if src == primarySrc {
				go prewarmPrioritySubtitles(pCtx, inputs, src, resumePos)
			} else if !primaryHasPor && bestPorTrack != nil {
				go inputs.bundle().prepareFastHead(pCtx, src, []SubtitleTrack{*bestPorTrack}, resumePos, 16)
			}
		}
	}

	var firstReadyOnce sync.Once
	var firstReadyFired atomic.Bool
	triggerReady := func() bool {
		triggeredHere := false
		if len(onFirstReady) > 0 && onFirstReady[0] != nil {
			swarmMu.RLock()
			ready := generation == playbackGeneration && len(currentMixQualities) > 0
			swarmMu.RUnlock()
			if ready {
				firstReadyOnce.Do(func() {
					triggeredHere = true
					firstReadyFired.Store(true)
					onFirstReady[0]()
				})
			}
		}
		return triggeredHere
	}

	var probedMu sync.Mutex
	probedFast := map[string]bool{}
	var fastProbeWg sync.WaitGroup
	fastLimit := 3
	bgLimit := 2
	if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		fastLimit = 8
		bgLimit = 8
	}
	probeSlots := make(chan struct{}, fastLimit)
	bgProbeSlots := make(chan struct{}, bgLimit)

	// Contexto único de inventário para nunca cancelar ffprobe no meio durante a fase rápida.
	inventory, cancelInventory := context.WithTimeout(parent, discoveryInventoryBudget())
	defer cancelInventory()

	scheduleProbeWith := func(slots chan struct{}, waitForWindow bool) func(string) {
		return func(source string) {
			if inventory.Err() != nil {
				return
			}
			probedMu.Lock()
			if probedFast[source] {
				probedMu.Unlock()
				return
			}
			probedFast[source] = true
			probedMu.Unlock()

			fastProbeWg.Add(1)
			go func(src string) {
				defer fastProbeWg.Done()
				if os.Getenv("ANIRIUM_E2E_CHILD") != "1" && firstReadyFired.Load() {
					waitInitialWindowReady(inventory, generation)
				}
				select {
				case slots <- struct{}{}:
				case <-inventory.Done():
					return
				}
				defer func() { <-slots }()
				if os.Getenv("ANIRIUM_E2E_CHILD") != "1" && firstReadyFired.Load() {
					waitInitialWindowReady(inventory, generation)
				}

				probeMixFileContext(inventory, src, generation)
				swarmMu.RLock()
				hasQualities := generation == playbackGeneration && len(probedStreams[src]) > 0
				swarmMu.RUnlock()
				if !hasQualities {
					probedMu.Lock()
					delete(probedFast, src)
					probedMu.Unlock()
					return
				}
				broadcastStartupTelemetry()
				if !triggerReady() && firstReadyFired.Load() {
					prewarmNewlyDiscoveredSubtitles(src)
					swarmMu.Lock()
					sameGen := generation == playbackGeneration
					if sameGen {
						refreshAudioSelectionLocked()
					}
					swarmMu.Unlock()
					if sameGen {
						broadcastWSEvent("manifest", buildCurrentManifest())
					}
				}
			}(source)
		}
	}

	// 1. Fase Rápida: assim que qualquer magnet prioritário obtiver metadados,
	// dispara ffprobe concorrente usando o contexto de inventário completo.
	fastMeta, cancelFast := context.WithTimeout(parent, 2000*time.Millisecond)
	_ = expandMediaSources(fastMeta, priorityMagnets, generation, scheduleProbeWith(probeSlots, false))
	cancelFast()

	if parent.Err() != nil {
		fastProbeWg.Wait()
		return
	}

	// 2. Se já conseguiu faixas na fase rápida, dispara imediatamente
	triggerReady()

	// 3. Fase Abrangente em Segundo Plano: expande e sonda novas fontes continuamente
	metadata, cancelMetadata := context.WithTimeout(parent, discoveryMetadataBudget())
	sources := expandMediaSources(metadata, orderedMagnets, generation, scheduleProbeWith(bgProbeSlots, true))
	cancelMetadata()
	if parent.Err() != nil {
		fastProbeWg.Wait()
		return
	}
	probeSources(inventory, sources, func(source string) {
		probedMu.Lock()
		alreadyProbed := probedFast[source]
		if !alreadyProbed {
			probedFast[source] = true
		}
		probedMu.Unlock()
		if !alreadyProbed {
			if os.Getenv("ANIRIUM_E2E_CHILD") != "1" && firstReadyFired.Load() {
				waitInitialWindowReady(inventory, generation)
			}
			select {
			case bgProbeSlots <- struct{}{}:
			case <-inventory.Done():
				return
			}
			defer func() { <-bgProbeSlots }()

			probeMixFileContext(inventory, source, generation)
			swarmMu.RLock()
			hasQualities := generation == playbackGeneration && len(probedStreams[source]) > 0
			swarmMu.RUnlock()
			if hasQualities && !triggerReady() && firstReadyFired.Load() {
				prewarmNewlyDiscoveredSubtitles(source)
				swarmMu.Lock()
				sameGen := generation == playbackGeneration
				if sameGen {
					refreshAudioSelectionLocked()
				}
				swarmMu.Unlock()
				if sameGen {
					broadcastWSEvent("manifest", buildCurrentManifest())
				}
			}
		} else {
			triggerReady()
		}
	})
	fastProbeWg.Wait()
}


