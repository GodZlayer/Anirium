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
	fastLimit := 6
	bgLimit := 1
	if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		fastLimit = 8
		bgLimit = 8
	}
	probeSlots := make(chan struct{}, fastLimit)
	bgProbeSlots := make(chan struct{}, bgLimit)

	// Contexto da fase rápida usa discoveryInventoryBudget(); a fase abrangente em segundo plano
	// usa o contexto da sessão (parent) para nunca abandonar magnets secundários enquanto a janela
	// inicial carrega ou o usuário ainda está assistindo.
	inventory, cancelInventory := context.WithTimeout(parent, discoveryInventoryBudget())
	defer cancelInventory()

	var failedMu sync.Mutex
	failedSources := map[string]bool{}

	recordProbeOutcome := func(src string) bool {
		swarmMu.RLock()
		hasQualities := generation == playbackGeneration && len(probedStreams[src]) > 0
		swarmMu.RUnlock()
		if !hasQualities {
			probedMu.Lock()
			delete(probedFast, src)
			probedMu.Unlock()
			failedMu.Lock()
			failedSources[src] = true
			failedMu.Unlock()
			return false
		}
		failedMu.Lock()
		delete(failedSources, src)
		failedMu.Unlock()
		return true
	}

	scheduleProbeWith := func(probeCtx context.Context, slots chan struct{}, waitForWindow bool) func(string) {
		return func(source string) {
			if probeCtx.Err() != nil {
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
				if waitForWindow && os.Getenv("ANIRIUM_E2E_CHILD") != "1" && firstReadyFired.Load() {
					waitInitialWindowReady(probeCtx, generation)
				}
				select {
				case slots <- struct{}{}:
				case <-probeCtx.Done():
					return
				}
				defer func() { <-slots }()
				if waitForWindow && os.Getenv("ANIRIUM_E2E_CHILD") != "1" && firstReadyFired.Load() {
					waitInitialWindowReady(probeCtx, generation)
				}

				magnetCtx, cancelMagnet := context.WithTimeout(probeCtx, 20*time.Second)
				probeMixFileContext(magnetCtx, src, generation)
				cancelMagnet()
				if !recordProbeOutcome(src) {
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
	// dispara ffprobe concorrente usando o contexto de inventário.
	fastMeta, cancelFast := context.WithTimeout(parent, 5000*time.Millisecond)
	_ = expandMediaSources(fastMeta, priorityMagnets, generation, scheduleProbeWith(inventory, probeSlots, false))
	cancelFast()

	if parent.Err() != nil {
		fastProbeWg.Wait()
		return
	}

	// 2. Se já conseguiu faixas na fase rápida, dispara imediatamente
	triggerReady()

	// 3. Fase Abrangente em Segundo Plano: usa parent (vida da sessão) sem timeout artificial
	// enquanto o usuário estiver assistindo, garantindo descoberta contínua de todas as fontes.
	bgCtx := parent
	if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		bgCtx = inventory
	}
	sources := expandMediaSources(bgCtx, orderedMagnets, generation, scheduleProbeWith(bgCtx, bgProbeSlots, true))
	if parent.Err() != nil {
		fastProbeWg.Wait()
		return
	}
	probeSources(bgCtx, sources, func(source string) {
		probedMu.Lock()
		alreadyProbed := probedFast[source]
		if !alreadyProbed {
			probedFast[source] = true
		}
		probedMu.Unlock()
		if !alreadyProbed {
			if os.Getenv("ANIRIUM_E2E_CHILD") != "1" && firstReadyFired.Load() {
				waitInitialWindowReady(bgCtx, generation)
			}
			select {
			case bgProbeSlots <- struct{}{}:
			case <-bgCtx.Done():
				return
			}
			defer func() { <-bgProbeSlots }()

			magnetCtx, cancelMagnet := context.WithTimeout(bgCtx, 20*time.Second)
			probeMixFileContext(magnetCtx, source, generation)
			cancelMagnet()
			if recordProbeOutcome(source) && !triggerReady() && firstReadyFired.Load() {
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

	// 4. Passada de retry controlada (15s depois) para magnets que deram timeout de peer na 1ª rodada,
	// garantindo que vídeo/áudio/legendas de fontes mais lentas ainda entrem na mixagem ao vivo.
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" && parent.Err() == nil {
		failedMu.Lock()
		retryList := make([]string, 0, len(failedSources))
		for src := range failedSources {
			retryList = append(retryList, src)
		}
		failedMu.Unlock()
		if len(retryList) > 0 {
			timer := time.NewTimer(15 * time.Second)
			select {
			case <-timer.C:
			case <-parent.Done():
				timer.Stop()
				return
			}
			probeSources(parent, retryList, func(source string) {
				select {
				case bgProbeSlots <- struct{}{}:
				case <-parent.Done():
					return
				}
				defer func() { <-bgProbeSlots }()
				magnetCtx, cancelMagnet := context.WithTimeout(parent, 20*time.Second)
				probeMixFileContext(magnetCtx, source, generation)
				cancelMagnet()
				if recordProbeOutcome(source) && !triggerReady() && firstReadyFired.Load() {
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
			})
		}
	}
}


