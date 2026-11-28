package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
)

type wsAutoStartOptions struct {
	Enabled          bool
	PreferredQuality string
	PreferredAudio   string
	ResumePosition   float64
}

type playbackPrepareOutcome struct {
	StatusCode int
	Body       map[string]interface{}
	Rejection  *serviceAuthRejection
	Ticket     string
	PlainError string
}

var playbackInventoryScanning bool // protected by swarmMu

type wsSubtitlePayload struct {
	RequestID   string  `json:"requestId,omitempty"`
	TrackID     string  `json:"trackId"`
	BlockStart  float64 `json:"blockStart"`
	Offset      float64 `json:"offset"`
	CoverageEnd float64 `json:"coverageEnd,omitempty"`
	Partial     bool    `json:"partial"`
	Complete    bool    `json:"complete"`
	Alignment   string  `json:"alignment"`
	VTT         string  `json:"vtt"`
}

func executePlaybackPrepare(ctx context.Context, input PlaybackPrepareRequest, autoStart *wsAutoStartOptions) playbackPrepareOutcome {
	authorization, rejection := validateServiceTokenDetailed(input.Token, input.DeviceID)
	if rejection == nil && strings.TrimSpace(authorization.PlayerSessionID) == "" {
		rejection = &serviceAuthRejection{status: http.StatusUnauthorized, reason: "player_instance_required"}
	}
	if rejection != nil {
		return playbackPrepareOutcome{StatusCode: rejection.status, Rejection: rejection}
	}
	input, identityRejection := resolveCatalogPlaybackContext(ctx, input, authorization)
	if identityRejection != nil {
		return playbackPrepareOutcome{
			StatusCode: identityRejection.status,
			Body:       map[string]interface{}{"status": "context_unavailable", "reason": identityRejection.reason},
		}
	}
	input.AuthorizedAddonIDs = authorization.AuthorizedAddonIDs
	input.AccountProviderServers = accountProviderServers(authorization)
	input.ManifestSnapshots = newProviderSnapshotStore()
	preparePlaybackMu.Lock()
	defer preparePlaybackMu.Unlock()
	if playbackShuttingDown {
		return playbackPrepareOutcome{
			StatusCode: http.StatusServiceUnavailable,
			Body:       map[string]interface{}{"status": "service_shutting_down"},
		}
	}
	if !mediaToolsAvailable() {
		return playbackPrepareOutcome{
			StatusCode: http.StatusServiceUnavailable,
			Body:       map[string]interface{}{"status": "media_tools_missing", "reason": "ffmpeg_and_ffprobe_required"},
		}
	}
	if ctx.Err() != nil {
		return playbackPrepareOutcome{}
	}
	if !testing.Testing() && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		swarmMu.RLock()
		canReuse := playbackContext != nil && playbackContext.Err() == nil && len(activeLinks) > 0 && (
			(input.CatalogIdentity.EpisodeID != "" && input.CatalogIdentity.EpisodeID == currentCatalogIdentity.EpisodeID) ||
			(input.CatalogIdentity.WorkID != "" && input.CatalogIdentity.WorkID == currentCatalogIdentity.WorkID && input.Episode == requestedEpisode.Episode && input.Season == requestedEpisode.Season))
		existingGen := playbackGeneration
		existingSources := len(activeLinks)
		existingIdentity := currentCatalogIdentity
		existingReady := len(currentMixQualities) > 0
		swarmMu.RUnlock()
		if canReuse {
			ticket, ticketErr := issuePlaybackGrant(input.Token, input.DeviceID, authorization.AccountID, authorization.PlayerSessionID)
			if ticketErr == nil {
				slot := globalSessionManager.CreateOrReplace(authorization.PlayerSessionID, ticket, existingGen)
				slot.mu.Lock()
				slot.CatalogIdentity = existingIdentity
				slot.mu.Unlock()
				appendLog(fmt.Sprintf("Playback prepare reused active session gen=%d sources=%d ready=%t", existingGen, existingSources, existingReady))
				broadcastStartupTelemetry()
				if existingReady {
					broadcastWSEvent("manifest", buildCurrentManifest())
				}
				status := "preparing"
				if existingReady {
					status = "ready"
				}
				return playbackPrepareOutcome{
					StatusCode: http.StatusOK,
					Ticket:     ticket,
					Body: map[string]interface{}{
						"success":         true,
						"status":          status,
						"reusedSession":   true,
						"sessionId":       slot.ID,
						"sources":         existingSources,
						"playbackTicket":  ticket,
						"providerStatus":  input.ManifestSnapshots.statusByID(),
						"catalogIdentity": existingIdentity,
					},
				}
			}
		}
	}
	epKey := episodeRetentionKeyFor(input.CatalogIdentity, input.Season, input.Episode)
	if epKey == "" {
		if id := strings.TrimSpace(input.EpisodeID); id != "" {
			epKey = "ep:" + id
		} else if wid := strings.TrimSpace(input.WorkID); wid != "" {
			epKey = fmt.Sprintf("work:%s:s%de%d", wid, input.Season, input.Episode)
		} else if input.MALID > 0 {
			epKey = fmt.Sprintf("mal:%d:s%de%d", input.MALID, input.Season, input.Episode)
		} else if t := strings.TrimSpace(input.Title); t != "" {
			epKey = fmt.Sprintf("title:%s:s%de%d", slugifyFolderSegment(t, 40), input.Season, input.Episode)
		}
	}
	var cachedMagnets []string
	if !testing.Testing() && os.Getenv("ANIRIUM_E2E_CHILD") != "1" && epKey != "" {
		if _, entry, ok := globalEpisodeStorage.lookup(epKey); ok && len(entry.Magnets) > 0 {
			cachedMagnets = entry.Magnets
			appendLog(fmt.Sprintf("[EpisodeCache] HIT dir=%s magnets=%d subs=%d (skipping provider search)", entry.RelDir, len(entry.Magnets), entry.SubtitleCount))
		} else {
			cachedMagnets = globalEpisodeRetention.loadEpisodeMagnets(epKey)
			if len(cachedMagnets) > 0 {
				appendLog(fmt.Sprintf("[EpisodeCache] HIT legacy magnets=%d for %s (skipping provider search)", len(cachedMagnets), epKey))
			} else {
				appendLog(fmt.Sprintf("[EpisodeCache] MISS key=%s title=%q s=%d e=%d (searching providers)", epKey, input.Title, input.Season, input.Episode))
			}
		}
	}
	var results []ProviderSearchResult
	var providerSubtitles []ProviderSubtitle
	input = enrichPlaybackTitlesFromMAL(ctx, input)
	var searchWg sync.WaitGroup
	if len(cachedMagnets) == 0 {
		searchWg.Add(1)
		go func() {
			defer searchWg.Done()
			results = searchProviderServers(input, ctx)
		}()
	}
	searchWg.Add(1)
	go func() {
		defer searchWg.Done()
		providerSubtitles = searchSubtitleProviders(input, ctx)
		if len(providerSubtitles) > 0 {
			globalMeshHub.PublishSubtitleLinks(input.MALID, input.Episode, providerSubtitles)
		}
	}()
	searchWg.Wait()
	if len(cachedMagnets) == 0 {
		appendLog(fmt.Sprintf("Playback provider search sources=%d subs=%d status=%v", len(results), len(providerSubtitles), input.ManifestSnapshots.statusByID()))
	} else {
		appendLog(fmt.Sprintf("Playback subtitle search (cached magnets) subs=%d", len(providerSubtitles)))
	}
	if ctx.Err() != nil {
		return playbackPrepareOutcome{}
	}
	rechecked, recheckRejection := validateServiceTokenDetailed(input.Token, input.DeviceID)
	if recheckRejection != nil {
		return playbackPrepareOutcome{StatusCode: recheckRejection.status, Rejection: recheckRejection}
	}
	if mismatch := recheckPrepareAuthorization(authorization, rechecked); mismatch != nil {
		return playbackPrepareOutcome{StatusCode: mismatch.status, Rejection: mismatch}
	}
	if ctx.Err() != nil {
		return playbackPrepareOutcome{}
	}
	magnets := cachedMagnets
	if len(magnets) == 0 {
		magnets = pooledMagnets(results)
		if len(magnets) > 0 && epKey != "" && !testing.Testing() && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
			go globalEpisodeRetention.saveEpisodeMagnets(epKey, magnets)
			go globalEpisodeStorage.recordMagnets(epKey, input.Title, input.CatalogIdentity.WorkID, input.Season, input.Episode, input.CatalogIdentity.EpisodeID, magnets)
		}
	} else if epKey != "" && !testing.Testing() && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		go globalEpisodeStorage.ensureEpisodeDir(epKey, input.Title, input.CatalogIdentity.WorkID, input.Season, input.Episode, input.CatalogIdentity.EpisodeID)
	}
	if len(magnets) == 0 {
		swarmMu.Lock()
		resetPlaybackLocked()
		swarmMu.Unlock()
		return playbackPrepareOutcome{
			StatusCode: http.StatusOK,
			Body: map[string]interface{}{
				"success":         true,
				"status":          "no-sources",
				"sources":         0,
				"providerStatus":  input.ManifestSnapshots.statusByID(),
				"catalogIdentity": input.CatalogIdentity,
			},
		}
	}
	swarmMu.Lock()
	requestedEpisode = episodeContext{Episode: input.Episode, Season: input.Season}
	generation := resetPlaybackLocked()
	playbackInventoryScanning = true
	currentCatalogIdentity = input.CatalogIdentity
	probeContext := playbackContext
	externalSubtitles = providerSubtitles
	currentActiveTitle = input.Title
	currentMixQualities = []string{}
	currentMixAudios = []string{}
	currentMixSubs = []string{}
	activeLinks = append([]string(nil), magnets...)
	playbackMagnets = append([]string(nil), magnets...)
	workers := playbackWorkers
	workers.Add(1)
	subtitleCache := playbackInputs
	subtitleCatalog := subtitleTracksLocked()
	swarmMu.Unlock()
	broadcastStartupTelemetry()
	subtitleCache.bundle().startExtras(subtitleCatalog)
	ticket, ticketErr := issuePlaybackGrant(input.Token, input.DeviceID, authorization.AccountID, authorization.PlayerSessionID)
	if ticketErr != nil {
		workers.Done()
		return playbackPrepareOutcome{
			StatusCode: http.StatusInternalServerError,
			PlainError: "Playback credential unavailable",
		}
	}
	slot := globalSessionManager.CreateOrReplace(authorization.PlayerSessionID, ticket, generation)
	slot.mu.Lock()
	slot.CatalogIdentity = input.CatalogIdentity
	slot.mu.Unlock()
	// Monitora a autorização contínua da reprodução em segundo plano.
	workers.Add(1)
	go func() {
		defer workers.Done()
		watchPlaybackAuthorization(probeContext, generation, ticket, 30*time.Second, magnets...)
	}()
	// Descobre fontes em paralelo e publica o manifesto assim que a primeira fonte responde.
	go func(sources []string) {
		defer workers.Done()
		firstTriggered := false
		triggerFirstReady := func() {
			swarmMu.Lock()
			if generation != playbackGeneration || len(currentMixQualities) == 0 || firstTriggered {
				swarmMu.Unlock()
				return
			}
			firstTriggered = true
			refreshAudioSelectionLocked()
			playbackDiscoveryComplete = true
			qualities := append([]string(nil), currentMixQualities...)
			audioCandidates := append([]AudioCandidate(nil), selectedAudioCandidates...)
			episodeDuration := playbackEpisodeDurationLocked()
			firstSubSource := ""
			for _, src := range activeLinks {
				if len(probedStreams[src]) > 0 {
					firstSubSource = src
					break
				}
			}
			swarmMu.Unlock()

			initialStart := 0.0
			if autoStart != nil && autoStart.Enabled && isFiniteWindowPosition(autoStart.ResumePosition) && autoStart.ResumePosition > 2 {
				pos := math.Floor(autoStart.ResumePosition/4) * 4
				if episodeDuration > 8 && pos >= episodeDuration-4 {
					pos = math.Floor(math.Max(0, episodeDuration-8)/4) * 4
				}
				if pos >= 0 {
					initialStart = pos
				}
			}

			if firstSubSource != "" && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
				go prewarmPrioritySubtitles(probeContext, subtitleCache, firstSubSource, initialStart)
				go enrichSubtitlesByVideoHash(probeContext, generation, firstSubSource, input, subtitleCache)
			}
			broadcastWSEvent("manifest", buildCurrentManifest())

			if autoStart != nil && autoStart.Enabled && os.Getenv("ANIRIUM_CONTINUOUS_BUFFER") == "1" && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
				ordered := selectVariantQualities(qualities)
				if len(ordered) > 0 {
					chosenQuality := ordered[0]
					if autoStart.PreferredQuality != "" && containsString(qualities, autoStart.PreferredQuality) {
						chosenQuality = autoStart.PreferredQuality
					}
					chosenAudio := ""
					if len(audioCandidates) > 0 {
						chosenAudio = audioCandidates[0].Language
						for _, candidate := range audioCandidates {
							if candidate.Language == "jpn" {
								chosenAudio = "jpn"
							}
						}
						if autoStart.PreferredAudio != "" {
							for _, candidate := range audioCandidates {
								if candidate.Language == autoStart.PreferredAudio {
									chosenAudio = candidate.Language
									break
								}
							}
						}
					}
					go func(gen uint64, q, a string, startPos float64) {
						preparePlaybackMu.Lock()
						defer preparePlaybackMu.Unlock()
						swarmMu.Lock()
						if playbackShuttingDown || gen != playbackGeneration || playbackContext.Err() != nil ||
							currentPlaybackWindow != nil || currentPlaybackSession.Revision != 0 || !containsString(currentMixQualities, q) {
							swarmMu.Unlock()
							return
						}
						if dur := playbackEpisodeDurationLocked(); dur > 0 && startPos >= dur {
							startPos = 0
						}
						applied := applyPlaybackSessionCommandLocked(playbackSessionCommand{
							Action:        "seek",
							Quality:       q,
							Audio:         a,
							Position:      startPos,
							Playing:       true,
							BufferSeconds: 30,
						})
						swarmMu.Unlock()
						if applied && requestPlaybackWindow(q, startPos) {
							swarmMu.Lock()
							startSessionPreparationLocked()
							swarmMu.Unlock()
							wakeSessionPreparation()
						}
					}(generation, chosenQuality, chosenAudio, initialStart)
				}
			}

			if os.Getenv("ANIRIUM_CONTINUOUS_BUFFER") != "1" {
				for index, candidate := range audioCandidates {
					workers.Add(1)
					go func(c AudioCandidate, i int) { defer workers.Done(); buildAudioTrack(c, i, generation) }(candidate, index)
				}
				if ordered := selectVariantQualities(qualities); len(ordered) > 0 {
					requestVideoVariant(ordered[0], generation)
				}
			}
		}

		discoverPlaybackInventory(probeContext, sources, generation, triggerFirstReady)
		swarmMu.Lock()
		if generation != playbackGeneration {
			swarmMu.Unlock()
			return
		}
		freezeCompatibleSourceSetLocked()
		if os.Getenv("ANIRIUM_E2E_CHILD") == "1" || len(activeLinks) > 1 {
			releaseExcludedSourceTorrentsLocked()
		}
		refreshAudioSelectionLocked()
		audioSelectionFrozen = true
		playbackDiscoveryComplete = true
		playbackInventoryScanning = false
		qualities := append([]string(nil), currentMixQualities...)
		audioCandidates := append([]AudioCandidate(nil), selectedAudioCandidates...)
		swarmMu.Unlock()
		broadcastStartupTelemetry()
		broadcastWSEvent("manifest", buildCurrentManifest())
		// Em modo contínuo a janela inicial já é gerada sob demanda / autoStart.
		if os.Getenv("ANIRIUM_CONTINUOUS_BUFFER") == "1" {
			return
		}
		for index, candidate := range audioCandidates {
			workers.Add(1)
			go func(c AudioCandidate, i int) { defer workers.Done(); buildAudioTrack(c, i, generation) }(candidate, index)
		}
		if ordered := selectVariantQualities(qualities); len(ordered) > 0 {
			requestVideoVariant(ordered[0], generation)
		}
	}(append([]string(nil), magnets...))

	return playbackPrepareOutcome{
		StatusCode: http.StatusOK,
		Ticket:     ticket,
		Body: map[string]interface{}{
			"success":         true,
			"status":          "preparing",
			"localCacheHit":   len(cachedMagnets) > 0,
			"sessionId":       slot.ID,
			"sources":         len(magnets),
			"playbackTicket":  ticket,
			"providerStatus":  input.ManifestSnapshots.statusByID(),
			"catalogIdentity": input.CatalogIdentity,
		},
	}
}

func (c *wsClient) handleWSPrepare(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	autoStart, _ := cmd["autoStart"].(bool)
	preferredQuality, _ := cmd["preferredQuality"].(string)
	preferredAudio, _ := cmd["preferredAudio"].(string)
	resumePosition, _ := cmd["resumePosition"].(float64)

	allowedFields := []string{
		"workId", "episodeId", "malId", "episodeCount", "format",
		"videoId", "mediaType", "token", "deviceId", "title",
		"titleEnglish", "titleRomaji", "titleNative", "aliases",
		"season", "episode",
	}
	cleanPayload := map[string]interface{}{}
	for _, key := range allowedFields {
		if val, exists := cmd[key]; exists {
			cleanPayload[key] = val
		}
	}
	raw, marshalErr := json.Marshal(cleanPayload)
	if marshalErr != nil {
		c.sendEvent("prepare_result", map[string]interface{}{
			"requestId":  requestID,
			"ok":         false,
			"statusCode": http.StatusBadRequest,
			"reason":     "invalid_payload",
		})
		return
	}
	input, inputErr := decodePlaybackPrepare(bytes.NewReader(raw))
	if inputErr != nil {
		c.sendEvent("prepare_result", map[string]interface{}{
			"requestId":  requestID,
			"ok":         false,
			"statusCode": http.StatusBadRequest,
			"reason":     "invalid_payload",
		})
		return
	}

	reqCtx := c.ctx
	if reqCtx == nil {
		reqCtx = context.Background()
	}
	outcome := executePlaybackPrepare(reqCtx, input, &wsAutoStartOptions{
		Enabled:          autoStart,
		PreferredQuality: preferredQuality,
		PreferredAudio:   preferredAudio,
		ResumePosition:   resumePosition,
	})
	if outcome.Ticket != "" {
		c.setAuthorizedTicket(outcome.Ticket)
	}
	if outcome.Rejection != nil {
		c.sendEvent("prepare_result", map[string]interface{}{
			"requestId":  requestID,
			"ok":         false,
			"statusCode": outcome.Rejection.status,
			"reason":     outcome.Rejection.reason,
		})
		return
	}
	resp := map[string]interface{}{
		"requestId":  requestID,
		"ok":         outcome.StatusCode >= 200 && outcome.StatusCode < 300,
		"statusCode": outcome.StatusCode,
	}
	if outcome.PlainError != "" {
		resp["reason"] = outcome.PlainError
	}
	for key, val := range outcome.Body {
		resp[key] = val
	}
	c.sendEvent("prepare_result", resp)
	if reused, _ := outcome.Body["reusedSession"].(bool); reused {
		swarmMu.RLock()
		hasReady := len(currentMixQualities) > 0
		inputs := playbackInputs
		swarmMu.RUnlock()
		if hasReady {
			c.sendEvent("manifest", buildCurrentManifest())
		}
		if inputs != nil {
			b := inputs.existingBundle()
			if b != nil {
				snap := b.snapshot(0, 0)
				for _, tr := range snap.Tracks {
					for _, part := range tr.Parts {
						if part.Failed || len(part.Cues) == 0 {
							continue
						}
						c.sendEvent("subtitle_data", wsSubtitlePayload{
							TrackID:     tr.ID,
							BlockStart:  math.Floor(part.Start/60) * 60,
							Offset:      part.Start,
							CoverageEnd: part.End,
							Partial:     !tr.Complete && (part.End-part.Start) < 55,
							Complete:    tr.Complete,
							Alignment:   tr.Alignment,
							VTT:         bundleVTT(part.Cues, part.Start),
						})
					}
				}
			}
		}
		broadcastStartupTelemetry()
	} else if epKey := episodeRetentionKeyFor(input.CatalogIdentity, input.Season, input.Episode); epKey != "" {
		savedSubs := globalEpisodeStorage.loadSubtitles(epKey)
		if len(savedSubs) == 0 {
			savedSubs = globalEpisodeRetention.loadEpisodeSubtitles(epKey)
		}
		if len(savedSubs) > 0 {
			for _, sub := range savedSubs {
				c.sendEvent("subtitle_data", wsSubtitlePayload{
					TrackID:     sub.TrackID,
					BlockStart:  math.Floor(sub.Start/60) * 60,
					Offset:      sub.Start,
					CoverageEnd: sub.End,
					Partial:     !sub.Complete && (sub.End-sub.Start) < 55,
					Complete:    sub.Complete,
					Alignment:   "verified",
					VTT:         sub.VTT,
				})
			}
		}
	}
}

func (c *wsClient) handleWSRenew(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	ticket, _ := cmd["playbackTicket"].(string)
	if ticket == "" {
		ticket = c.getAuthorizedTicket()
	}
	token, _ := cmd["token"].(string)
	device, _ := cmd["deviceId"].(string)

	rejection := renewPlaybackGrantDetailed(ticket, token, device)
	if rejection != nil {
		c.sendEvent("renew_result", map[string]interface{}{
			"requestId":  requestID,
			"ok":         false,
			"statusCode": rejection.status,
			"reason":     rejection.reason,
		})
		return
	}
	c.setAuthorizedTicket(ticket)
	c.sendEvent("renew_result", map[string]interface{}{
		"requestId":  requestID,
		"ok":         true,
		"statusCode": http.StatusOK,
		"status":     "authorized",
	})
}

func (c *wsClient) sendSubtitleError(requestID, trackID string, blockStart float64, status int, reason string) {
	c.sendEvent("subtitle_error", map[string]interface{}{
		"requestId":  requestID,
		"trackId":    trackID,
		"blockStart": blockStart,
		"status":     status,
		"reason":     reason,
	})
}

func (c *wsClient) handleWSGetSubtitle(cmd map[string]interface{}) {
	requestID, _ := cmd["requestId"].(string)
	trackID, _ := cmd["trackId"].(string)
	ticket, _ := cmd["playbackTicket"].(string)
	if ticket == "" {
		ticket = c.getAuthorizedTicket()
	}
	start := -1.0
	if rawStart, ok := cmd["start"].(float64); ok {
		start = rawStart
	}
	if trackID == "" {
		c.sendSubtitleError(requestID, trackID, start, http.StatusBadRequest, "missing_track_id")
		return
	}
	if start != -1.0 && !isFiniteWindowPosition(start) {
		c.sendSubtitleError(requestID, trackID, start, http.StatusBadRequest, "invalid_interval")
		return
	}
	if !hasActivePlaybackGrant(ticket) {
		c.sendSubtitleError(requestID, trackID, start, http.StatusUnauthorized, serviceAuthReasonInvalid)
		return
	}
	c.setAuthorizedTicket(ticket)
	c.setActiveSubtitleTrack(trackID)

	at := math.Max(0, start)
	if start >= 0 {
		if rawAt, ok := cmd["at"].(float64); ok && isFiniteWindowPosition(rawAt) && rawAt >= start && rawAt < start+60 {
			at = math.Floor(rawAt/4) * 4
		}
	}
	fast, _ := cmd["fast"].(bool)
	prefetch, _ := cmd["prefetch"].(bool)

	reqCtx := c.ctx
	if reqCtx == nil {
		reqCtx = context.Background()
	}

	swarmMu.RLock()
	bundleCache := playbackInputs
	if bundleCache != nil && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		tracks := subtitleTracksLocked()
		episodeDuration := playbackEpisodeDurationLocked()
		var targetSource string
		baseTrackID := unwrapTranslatedTrackID(trackID)
		for _, tr := range tracks {
			if (tr.ID == trackID || tr.ID == baseTrackID) && tr.Source != "" && tr.StreamIndex >= 0 {
				targetSource = tr.Source
				break
			}
		}
		swarmMu.RUnlock()
		if targetSource != "" {
			b := bundleCache.bundle()
			b.configure(targetSource, tracks, episodeDuration)
		}
	} else {
		swarmMu.RUnlock()
	}

	if bundleCache != nil {
		if handled := c.tryServeBundledWSSubtitle(reqCtx, bundleCache, requestID, trackID, start, at, fast, prefetch); handled {
			return
		}
	}

	c.serveFallbackWSSubtitle(reqCtx, bundleCache, requestID, trackID, start, at, fast)
}

func (c *wsClient) tryServeBundledWSSubtitle(ctx context.Context, cache *mediaInputCache, requestID, trackID string, start, at float64, fast bool, prefetch ...bool) bool {
	isPrefetch := len(prefetch) > 0 && prefetch[0]
	b := cache.existingBundle()
	if b == nil {
		return false
	}
	lookupID := unwrapTranslatedTrackID(trackID)
	snapshot := b.snapshot(0, 0)
	for _, track := range snapshot.Tracks {
		if track.ID != trackID && track.ID != lookupID {
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
						c.sendEvent("subtitle_data", wsSubtitlePayload{
							RequestID:   requestID,
							TrackID:     trackID,
							BlockStart:  math.Floor(start/60) * 60,
							Offset:      headPart.Start,
							CoverageEnd: headPart.End,
							Partial:     true,
							Complete:    false,
							Alignment:   track.Alignment,
							VTT:         bundleVTT(headPart.Cues, headPart.Start),
						})
						return true
					}
				}
				return false
			}
			c.sendSubtitleError(requestID, trackID, start, http.StatusBadGateway, "subtitle_preparation_failed")
			return true
		}
		if ready {
			sort.SliceStable(cues, func(i, j int) bool { return cues[i].Start < cues[j].Start })
			if track.Complete {
				c.sendEvent("subtitle_data", wsSubtitlePayload{
					RequestID:  requestID,
					TrackID:    trackID,
					BlockStart: 0,
					Offset:     0,
					Partial:    false,
					Complete:   true,
					Alignment:  track.Alignment,
					VTT:        bundleVTT(cues, 0),
				})
				return true
			}
			offset := math.Max(0, start)
			if start >= 0 {
				bounded := []subtitleCue{}
				for _, cue := range cues {
					if cue.End <= start || cue.Start >= start+60 {
						continue
					}
					cue.End = math.Min(cue.End, start+60)
					bounded = append(bounded, cue)
				}
				cues = bounded
			}
			c.sendEvent("subtitle_data", wsSubtitlePayload{
				RequestID:  requestID,
				TrackID:    trackID,
				BlockStart: math.Max(0, start),
				Offset:     offset,
				Partial:    false,
				Complete:   start < 0,
				Alignment:  track.Alignment,
				VTT:        bundleVTT(cues, offset),
			})
			return true
		}

		// Not ready yet: serve fast-head if already cached, else trigger fast-head + full 60s push.
		if fast && start >= 0 {
			if headPart, ok := b.fastHeadFor(trackID, at); ok {
				if track.Embedded {
					job := b.schedule(start, isPrefetch)
					if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
						b.schedule(start+60, true)
						go func(tr SubtitleTrack, blk float64, scheduled *subtitleBatchJob) {
							if scheduled != nil {
								select {
								case <-scheduled.done:
								case <-b.cache.ctx.Done():
									return
								}
							}
							if b.hasReadyBlock(tr.ID, blk) {
								pushBundledSubtitleBlockToSubscribers(b, blk, blk+60)
							} else if cache != nil && cache.load != nil {
								key := subtitleWindowKey{source: tr.Source, stream: tr.StreamIndex, start: blk}
								if vtt, err := cache.sharedSubtitleWindow(b.cache.ctx, key, func(shared context.Context) (string, error) {
									return extractSubtitleWindowInput(shared, cache, tr.Source, tr.StreamIndex, blk)
								}); err == nil {
									if b.recordBundledTrackWindow(tr, blk, blk+60, vtt) {
										pushBundledSubtitleBlockToSubscribers(b, blk, blk+60)
									}
								}
							}
						}(track.track, start, job)
					}
				}
				c.sendEvent("subtitle_data", wsSubtitlePayload{
					RequestID:   requestID,
					TrackID:     trackID,
					BlockStart:  start,
					Offset:      headPart.Start,
					CoverageEnd: headPart.End,
					Partial:     true,
					Complete:    false,
					Alignment:   track.Alignment,
					VTT:         bundleVTT(headPart.Cues, headPart.Start),
				})
				return true
			}
			c.sendEvent("subtitle_pending", map[string]interface{}{
				"requestId":  requestID,
				"trackId":    trackID,
				"blockStart": start,
				"at":         at,
			})
			if track.Embedded {
				if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
					b.schedule(start, false)
					singleTrack := []SubtitleTrack{track.track}
					if b.prepareFastHead(b.cache.ctx, track.track.Source, singleTrack, at, 16) {
						if headPart, ok := b.fastHeadFor(trackID, at); ok && ctx.Err() == nil {
							c.sendEvent("subtitle_data", wsSubtitlePayload{
								RequestID:   requestID,
								TrackID:     trackID,
								BlockStart:  start,
								Offset:      headPart.Start,
								CoverageEnd: headPart.End,
								Partial:     true,
								Complete:    false,
								Alignment:   track.Alignment,
								VTT:         bundleVTT(headPart.Cues, headPart.Start),
							})
						}
						return true
					}
					if b.cache.ctx.Err() != nil {
						c.sendSubtitleError(requestID, trackID, start, http.StatusUnauthorized, "playback_session_closed")
						return true
					}
					return true
				}
				// Run 8s fast-head first so it never competes with a simultaneous 60s FFmpeg reader on the same torrent file,
				// then immediately schedule the 60s full block and 60s lookahead in the background.
				singleTrack := []SubtitleTrack{track.track}
				src := track.track.Source
				go func(reqID string, tr SubtitleTrack, blk, atPos float64, align string) {
					fastSent := false
					if b.prepareFastHead(b.cache.ctx, src, singleTrack, atPos, 8) {
						if headPart, ok := b.fastHeadFor(tr.ID, atPos); ok && ctx.Err() == nil {
							fastSent = true
							c.sendEvent("subtitle_data", wsSubtitlePayload{
								RequestID:   reqID,
								TrackID:     tr.ID,
								BlockStart:  blk,
								Offset:      headPart.Start,
								CoverageEnd: headPart.End,
								Partial:     true,
								Complete:    false,
								Alignment:   align,
								VTT:         bundleVTT(headPart.Cues, headPart.Start),
							})
						}
					} else if b.cache.ctx.Err() != nil {
						c.sendSubtitleError(reqID, tr.ID, blk, http.StatusUnauthorized, "playback_session_closed")
						return
					}
					job := b.schedule(blk, isPrefetch)
					b.schedule(blk+60, true)
					if job != nil {
						select {
						case <-job.done:
						case <-b.cache.ctx.Done():
							return
						}
					}
					if b.hasReadyBlock(tr.ID, blk) {
						pushBundledSubtitleBlockToSubscribers(b, blk, blk+60)
						return
					}
					if cache != nil && cache.load != nil {
						key := subtitleWindowKey{source: tr.Source, stream: tr.StreamIndex, start: blk}
						if vtt, err := cache.sharedSubtitleWindow(b.cache.ctx, key, func(shared context.Context) (string, error) {
							return extractSubtitleWindowInput(shared, cache, tr.Source, tr.StreamIndex, blk)
						}); err == nil {
							if b.recordBundledTrackWindow(tr, blk, blk+60, vtt) {
								pushBundledSubtitleBlockToSubscribers(b, blk, blk+60)
								return
							}
						} else {
							var partialErr *partialSubtitleError
							if errors.As(err, &partialErr) && !fastSent && ctx.Err() == nil {
								b.recordFastHead(tr.ID, blk, blk+16, partialErr.content)
								c.sendEvent("subtitle_data", wsSubtitlePayload{
									RequestID:   reqID,
									TrackID:     tr.ID,
									BlockStart:  blk,
									Offset:      blk,
									CoverageEnd: blk + 16,
									Partial:     true,
									Complete:    false,
									Alignment:   align,
									VTT:         partialErr.content,
								})
								return
							}
						}
					}
					if !fastSent && ctx.Err() == nil {
						c.sendSubtitleError(reqID, tr.ID, blk, http.StatusGatewayTimeout, "subtitle_timeout")
					}
				}(requestID, track.track, start, at, track.Alignment)
			}
			return true
		}

		c.sendEvent("subtitle_pending", map[string]interface{}{
			"requestId":  requestID,
			"trackId":    trackID,
			"blockStart": math.Max(0, start),
		})
		if start < 0 && track.Embedded {
			b.completeLegacy()
		} else if start >= 0 && track.Embedded {
			job := b.schedule(start, isPrefetch)
			if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
				b.schedule(start+60, true)
			}
			if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
				go func(reqID string, tr SubtitleTrack, blk float64, scheduled *subtitleBatchJob) {
					if scheduled != nil {
						select {
						case <-scheduled.done:
						case <-b.cache.ctx.Done():
							return
						}
					}
					if b.hasReadyBlock(tr.ID, blk) {
						pushBundledSubtitleBlockToSubscribers(b, blk, blk+60)
						return
					}
					if cache != nil && cache.load != nil {
						key := subtitleWindowKey{source: tr.Source, stream: tr.StreamIndex, start: blk}
						if vtt, err := cache.sharedSubtitleWindow(b.cache.ctx, key, func(shared context.Context) (string, error) {
							return extractSubtitleWindowInput(shared, cache, tr.Source, tr.StreamIndex, blk)
						}); err == nil {
							if b.recordBundledTrackWindow(tr, blk, blk+60, vtt) {
								pushBundledSubtitleBlockToSubscribers(b, blk, blk+60)
								return
							}
						}
					}
				}(requestID, track.track, start, job)
			}
		}
		return true
	}

	if fast && start >= 0 {
		if headPart, ok := b.fastHeadFor(trackID, at); ok {
			c.sendEvent("subtitle_data", wsSubtitlePayload{
				RequestID:   requestID,
				TrackID:     trackID,
				BlockStart:  start,
				Offset:      headPart.Start,
				CoverageEnd: headPart.End,
				Partial:     true,
				Complete:    false,
				Alignment:   "unverified",
				VTT:         bundleVTT(headPart.Cues, headPart.Start),
			})
			return true
		}
	}
	return false
}

func (c *wsClient) serveFallbackWSSubtitle(reqCtx context.Context, cache *mediaInputCache, requestID, trackID string, start, at float64, fast bool) {
	swarmMu.RLock()
	mediaContext := playbackContext
	subtitleCache := playbackInputs
	subtitleContext, cancelSubtitle := subtitleRequestContext(reqCtx, mediaContext)
	defer cancelSubtitle()

	var remote *ProviderSubtitle
	lookupTrackID := unwrapTranslatedTrackID(trackID)
	for index, subtitle := range externalSubtitles {
		if lookupTrackID == fmt.Sprintf("external-%d-%d", playbackGeneration, index) {
			copySub := subtitle
			remote = &copySub
			break
		}
	}
	if remote != nil {
		swarmMu.RUnlock()
		content, err := externalSubtitleVTT(subtitleContext, *remote)
		if err != nil {
			c.sendSubtitleError(requestID, trackID, start, http.StatusBadGateway, "subtitle_provider_unavailable")
			return
		}
		if subtitleCache != nil {
			subtitleCache.rememberCompleteSubtitle(trackID)
			prepareSubtitleAlignmentReference(subtitleContext, subtitleCache, remote.Language, extractCachedSubtitle)
		}
		alignment := "unverified"
		if subtitleCache != nil {
			if adjusted, verified := alignExternalSubtitleToVideo(subtitleCache, remote.Language, content, trackID); verified {
				content, alignment = adjusted, "verified"
			}
		}
		c.sendEvent("subtitle_data", wsSubtitlePayload{
			RequestID:  requestID,
			TrackID:    trackID,
			BlockStart: 0,
			Offset:     0,
			Partial:    false,
			Complete:   true,
			Alignment:  alignment,
			VTT:        content,
		})
		return
	}

	magnet := ""
	requestedIndex := -1
	requestedFile := ""
	tracks := subtitleTracksLocked()
	for _, track := range tracks {
		if track.ID == trackID || track.ID == lookupTrackID {
			magnet = track.Source
			requestedIndex = track.StreamIndex
			requestedFile = track.FilePath
			break
		}
	}
	// If the requested trackID became stale after a quality/source switch or
	// discovery freeze, fall back to the active available track instead of
	// stranding the player in a 404 retry loop.
	if magnet == "" && !testing.Testing() {
		for _, track := range tracks {
			if track.Source != "" {
				magnet = track.Source
				requestedIndex = track.StreamIndex
				requestedFile = track.FilePath
				break
			}
		}
	}
	client := torrentClient
	swarmMu.RUnlock()

	if magnet == "" {
		c.sendSubtitleError(requestID, trackID, start, http.StatusNotFound, "subtitle_track_not_found")
		return
	}
	t, err := addPlaybackTorrent(subtitleContext, client, resolveMediaSource(magnet).Magnet)
	if err != nil {
		status := http.StatusBadRequest
		reason := "subtitle_source_unavailable"
		if subtitleContext.Err() != nil {
			status = http.StatusUnauthorized
			reason = "playback_session_closed"
		}
		c.sendSubtitleError(requestID, trackID, start, status, reason)
		return
	}

	select {
	case <-t.GotInfo():
	case <-subtitleContext.Done():
		c.sendSubtitleError(requestID, trackID, start, http.StatusUnauthorized, "playback_session_closed")
		return
	case <-time.After(25 * time.Second):
		if t.Info() == nil {
			c.sendSubtitleError(requestID, trackID, start, http.StatusGatewayTimeout, "torrent_metadata_timeout")
			return
		}
	}

	var matchedSub *torrent.File
	for _, f := range t.Files() {
		if requestedFile != "" && f.DisplayPath() == requestedFile {
			matchedSub = f
		}
	}
	if matchedSub != nil {
		matchedSub.Download()
		reader := matchedSub.NewReader()
		defer reader.Close()
		readContext, cancelRead := context.WithTimeout(subtitleContext, 90*time.Second)
		defer cancelRead()
		stopReader := context.AfterFunc(readContext, func() { reader.Close() })
		defer stopReader()
		const maxSubtitleBytes = 16 << 20
		contentBytes, err := io.ReadAll(io.LimitReader(reader, maxSubtitleBytes+1))
		if len(contentBytes) > maxSubtitleBytes {
			c.sendSubtitleError(requestID, trackID, start, http.StatusRequestEntityTooLarge, "subtitle_too_large")
			return
		}
		if err == nil && len(contentBytes) > 0 {
			vtt, conversionErr := convertSidecarVTT(readContext, contentBytes, filepath.Ext(matchedSub.DisplayPath()))
			if conversionErr != nil {
				c.sendSubtitleError(requestID, trackID, start, http.StatusUnprocessableEntity, "subtitle_conversion_failed")
				return
			}
			if vtt != "" {
				if subtitleCache != nil {
					subtitleCache.rememberCompleteSubtitle(trackID)
				}
				c.sendEvent("subtitle_data", wsSubtitlePayload{
					RequestID:  requestID,
					TrackID:    trackID,
					BlockStart: 0,
					Offset:     0,
					Partial:    false,
					Complete:   true,
					Alignment:  "unverified",
					VTT:        vtt,
				})
				return
			}
		}
	}

	if requestedFile != "" {
		c.sendSubtitleError(requestID, trackID, start, http.StatusNotFound, "sidecar_unreadable")
		return
	}

	videoFile, _ := selectSourceVideo(mediaContext, t.Files(), magnet)
	if videoFile == nil || requestedIndex < 0 {
		c.sendSubtitleError(requestID, trackID, start, http.StatusNotFound, "subtitle_stream_not_found")
		return
	}

	waitContext := subtitleContext
	if start < 0 {
		var cancelWait context.CancelFunc
		waitContext, cancelWait = context.WithTimeout(subtitleContext, 15*time.Second)
		defer cancelWait()
	}

	if fast && start >= 0 && subtitleCache != nil {
		fullKey := subtitleWindowKey{source: magnet, stream: requestedIndex, start: start}
		if fullContent, ok := subtitleCache.cachedSubtitleWindow(fullKey); ok {
			c.sendEvent("subtitle_data", wsSubtitlePayload{
				RequestID:  requestID,
				TrackID:    trackID,
				BlockStart: start,
				Offset:     start,
				Partial:    false,
				Complete:   false,
				Alignment:  embeddedSubtitleAlignment(subtitleCache, magnet),
				VTT:        fullContent,
			})
			return
		}
		if fastContent, fastErr := extractCachedSubtitleSpan(waitContext, subtitleCache, magnet, requestedIndex, at, 16); fastErr == nil {
			subtitleCache.bundle().recordFastHead(trackID, at, at+16, fastContent)
			c.sendEvent("subtitle_data", wsSubtitlePayload{
				RequestID:   requestID,
				TrackID:     trackID,
				BlockStart:  start,
				Offset:      at,
				CoverageEnd: at + 16,
				Partial:     true,
				Complete:    false,
				Alignment:   embeddedSubtitleAlignment(subtitleCache, magnet),
				VTT:         fastContent,
			})
			// Agenda upgrade completo de 60s usando mediaContext (não subtitleContext, que é cancelado pelo defer ao retornar!)
			go func() {
				key := subtitleWindowKey{source: magnet, stream: requestedIndex, start: start}
				fullVTT, fullErr := subtitleCache.sharedSubtitleWindow(mediaContext, key, func(shared context.Context) (string, error) {
					return extractSubtitleWindowInput(shared, subtitleCache, magnet, requestedIndex, start)
				})
				if fullErr == nil {
					subtitleCache.bundle().recordBundledTrackWindow(SubtitleTrack{ID: trackID, Source: magnet, StreamIndex: requestedIndex}, start, start+60, fullVTT)
					if c.getActiveSubtitleTrack() == trackID {
						c.sendEvent("subtitle_data", wsSubtitlePayload{
							RequestID:  requestID,
							TrackID:    trackID,
							BlockStart: start,
							Offset:     start,
							Partial:    false,
							Complete:   false,
							Alignment:  embeddedSubtitleAlignment(subtitleCache, magnet),
							VTT:        fullVTT,
						})
					}
					nextKey := subtitleWindowKey{source: magnet, stream: requestedIndex, start: start + 60}
					_ = subtitleCache.prefetchSubtitleWindow(nextKey, func(shared context.Context) (string, error) {
						return extractSubtitleWindowInput(shared, subtitleCache, magnet, requestedIndex, start+60)
					})
				}
			}()
			return
		}
	}

	if content, ok := subtitleCache.cachedSubtitleWindow(subtitleWindowKey{source: magnet, stream: requestedIndex, start: start}); ok {
		b := subtitleCache.bundle()
		b.recordBundledTrackWindow(SubtitleTrack{ID: trackID, Source: magnet, StreamIndex: requestedIndex}, start, start+60, content)
		c.sendEvent("subtitle_data", wsSubtitlePayload{
			RequestID:  requestID,
			TrackID:    trackID,
			BlockStart: math.Max(0, start),
			Offset:     math.Max(0, start),
			Partial:    false,
			Complete:   start < 0,
			Alignment:  embeddedSubtitleAlignment(subtitleCache, magnet),
			VTT:        content,
		})
		return
	}
	extractWindowFn := func(ctx context.Context) (string, error) {
		if subtitleCache == nil {
			return extractSubtitleWindowInput(ctx, subtitleCache, magnet, requestedIndex, start)
		}
		key := subtitleWindowKey{source: magnet, stream: requestedIndex, start: start}
		return subtitleCache.sharedSubtitleWindow(ctx, key, func(shared context.Context) (string, error) {
			return extractSubtitleWindowInput(shared, subtitleCache, magnet, requestedIndex, start)
		})
	}
	if content, err := extractWindowFn(waitContext); err == nil {
		if start >= 0 && subtitleCache != nil {
			subtitleCache.bundle().recordBundledTrackWindow(SubtitleTrack{ID: trackID, Source: magnet, StreamIndex: requestedIndex}, start, start+60, content)
			if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
				nextKey := subtitleWindowKey{source: magnet, stream: requestedIndex, start: start + 60}
				_ = subtitleCache.prefetchSubtitleWindow(nextKey, func(shared context.Context) (string, error) {
					return extractSubtitleWindowInput(shared, subtitleCache, magnet, requestedIndex, start+60)
				})
			}
		}
		if start < 0 && subtitleCache != nil {
			subtitleCache.mu.Lock()
			delete(subtitleCache.externalSubtitleAlignmentSources, trackID)
			subtitleCache.mu.Unlock()
			subtitleCache.rememberCompleteSubtitle(trackID)
		}
		c.sendEvent("subtitle_data", wsSubtitlePayload{
			RequestID:  requestID,
			TrackID:    trackID,
			BlockStart: math.Max(0, start),
			Offset:     math.Max(0, start),
			Partial:    false,
			Complete:   start < 0,
			Alignment:  embeddedSubtitleAlignment(subtitleCache, magnet),
			VTT:        content,
		})
		return
	} else {
		var partialErr *partialSubtitleError
		if start >= 0 && errors.As(err, &partialErr) {
			covEnd := start + 16
			if parsedCues, parseErr := parseBundleCues(partialErr.content, start); parseErr == nil && len(parsedCues) > 0 {
				if lastEnd := parsedCues[len(parsedCues)-1].End; lastEnd > covEnd {
					covEnd = math.Min(start+60, lastEnd)
				}
			}
			if subtitleCache != nil {
				subtitleCache.bundle().recordFastHead(trackID, start, covEnd, partialErr.content)
			}
			c.sendEvent("subtitle_data", wsSubtitlePayload{
				RequestID:   requestID,
				TrackID:     trackID,
				BlockStart:  start,
				Offset:      start,
				CoverageEnd: covEnd,
				Partial:     true,
				Complete:    false,
				Alignment:   embeddedSubtitleAlignment(subtitleCache, magnet),
				VTT:         partialErr.content,
			})
			return
		}
		if start < 0 && subtitleContext.Err() == nil && subtitleCache != nil {
			if recovered, producer, ready := recoverCompleteEmbeddedSubtitle(subtitleCache, trackID); ready {
				c.sendEvent("subtitle_data", wsSubtitlePayload{
					RequestID:  requestID,
					TrackID:    trackID,
					BlockStart: 0,
					Offset:     0,
					Partial:    false,
					Complete:   true,
					Alignment:  embeddedSubtitleAlignment(subtitleCache, producer),
					VTT:        recovered,
				})
				return
			}
		}
		status := http.StatusBadGateway
		reason := "subtitle_extraction_failed"
		if err == context.DeadlineExceeded {
			status = http.StatusGatewayTimeout
			reason = "subtitle_timeout"
		}
		c.sendSubtitleError(requestID, trackID, start, status, reason)
	}
}

func pushBundledSubtitleBlockToSubscribers(b *subtitleBundle, start, end float64) {
	if b == nil {
		return
	}
	clients := globalHub.snapshotClients()
	if len(clients) == 0 {
		return
	}
	snapshot := b.snapshot(0, 0)
	if len(snapshot.Tracks) == 0 {
		return
	}
	trackMap := make(map[string]bundledSubtitle, len(snapshot.Tracks))
	for _, tr := range snapshot.Tracks {
		trackMap[tr.ID] = tr
	}
	for _, client := range clients {
		trackID := client.getActiveSubtitleTrack()
		if trackID == "" || !hasActivePlaybackGrant(client.getAuthorizedTicket()) {
			continue
		}
		tr, exists := trackMap[trackID]
		if !exists {
			continue
		}
		if tr.Complete {
			cues := []subtitleCue{}
			for _, part := range tr.Parts {
				if !part.Failed {
					cues = append(cues, part.Cues...)
				}
			}
			sort.SliceStable(cues, func(i, j int) bool { return cues[i].Start < cues[j].Start })
			client.sendEvent("subtitle_data", wsSubtitlePayload{
				TrackID:    trackID,
				BlockStart: 0,
				Offset:     0,
				Partial:    false,
				Complete:   true,
				Alignment:  tr.Alignment,
				VTT:        bundleVTT(cues, 0),
			})
			continue
		}
		hasBlock := false
		cues := []subtitleCue{}
		for _, part := range tr.Parts {
			if part.Failed {
				continue
			}
			if math.Abs(part.Start-start) < 0.05 || (part.Start <= start+0.05 && part.End >= end-0.05) {
				hasBlock = true
			}
			cues = append(cues, part.Cues...)
		}
		if !hasBlock {
			continue
		}
		sort.SliceStable(cues, func(i, j int) bool { return cues[i].Start < cues[j].Start })
		bounded := []subtitleCue{}
		for _, cue := range cues {
			if cue.Start >= start+60 {
				continue
			}
			cue.End = math.Min(cue.End, start+60)
			if cue.End > cue.Start {
				bounded = append(bounded, cue)
			}
		}
		client.sendEvent("subtitle_data", wsSubtitlePayload{
			TrackID:    trackID,
			BlockStart: start,
			Offset:     start,
			Partial:    false,
			Complete:   false,
			Alignment:  tr.Alignment,
			VTT:        bundleVTT(bounded, start),
		})
	}
}

func pushFastHeadSubtitleToSubscribers(b *subtitleBundle, start, end float64, onlyTrackID string) {
	if b == nil {
		return
	}
	clients := globalHub.snapshotClients()
	if len(clients) == 0 {
		return
	}
	blockStart := math.Floor(math.Max(0, start)/60) * 60
	for _, client := range clients {
		trackID := client.getActiveSubtitleTrack()
		if trackID == "" || (onlyTrackID != "" && trackID != onlyTrackID) {
			continue
		}
		if !hasActivePlaybackGrant(client.getAuthorizedTicket()) {
			continue
		}
		headPart, ok := b.fastHeadFor(trackID, start)
		if !ok {
			continue
		}
		client.sendEvent("subtitle_data", wsSubtitlePayload{
			TrackID:     trackID,
			BlockStart:  blockStart,
			Offset:      headPart.Start,
			CoverageEnd: headPart.End,
			Partial:     true,
			Complete:    false,
			Alignment:   "verified",
			VTT:         bundleVTT(headPart.Cues, headPart.Start),
		})
	}
}

func pushCompleteSubtitleToSubscribers(trackID, vtt, alignment string) {
	if trackID == "" || vtt == "" {
		return
	}
	clients := globalHub.snapshotClients()
	for _, client := range clients {
		if client.getActiveSubtitleTrack() != trackID {
			continue
		}
		if !hasActivePlaybackGrant(client.getAuthorizedTicket()) {
			continue
		}
		client.sendEvent("subtitle_data", wsSubtitlePayload{
			TrackID:    trackID,
			BlockStart: 0,
			Offset:     0,
			Partial:    false,
			Complete:   true,
			Alignment:  alignment,
			VTT:        vtt,
		})
	}
}
