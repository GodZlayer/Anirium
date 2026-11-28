package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"sync"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		return origin == "" || trustedPlayerOrigin(origin)
	},
}

type wsHub struct {
	clients    map[*wsClient]bool
	broadcast  chan []byte
	register   chan *wsClient
	unregister chan *wsClient
	mu         sync.Mutex
}

var globalHub = &wsHub{
	clients:    make(map[*wsClient]bool),
	broadcast:  make(chan []byte, 64),
	register:   make(chan *wsClient),
	unregister: make(chan *wsClient),
}

var startGlobalHubOnce sync.Once

func ensureGlobalHubRunning() {
	startGlobalHubOnce.Do(func() {
		globalSessionManager.StartReaper()
		go globalHub.run()
	})
}

type wsClient struct {
	hub                 *wsHub
	conn                *websocket.Conn
	send                chan []byte
	sendMu              sync.RWMutex
	closed              bool
	ctx                 context.Context
	cancel              context.CancelFunc
	origin              string
	stateMu             sync.RWMutex
	authorizedTicket    string
	activeSubtitleTrack string
	boundGeneration     uint64
	sessionID           string
}

func (c *wsClient) setSessionID(sessionID string) {
	id := strings.TrimSpace(sessionID)
	c.stateMu.Lock()
	c.sessionID = id
	c.stateMu.Unlock()
	if slot, ok := globalSessionManager.Get(id); ok {
		slot.Touch()
	}
}

func (c *wsClient) currentSessionID() string {
	c.stateMu.RLock()
	defer c.stateMu.RUnlock()
	return c.sessionID
}

func (c *wsClient) closeSend() {
	c.sendMu.Lock()
	if !c.closed {
		c.closed = true
		if c.cancel != nil {
			c.cancel()
		}
		if c.send != nil {
			close(c.send)
		}
	}
	c.sendMu.Unlock()
}

func (c *wsClient) enqueueRaw(data []byte) bool {
	c.sendMu.RLock()
	defer c.sendMu.RUnlock()
	if c.closed || c.send == nil {
		return false
	}
	select {
	case c.send <- data:
		return true
	default:
		return false
	}
}

func (c *wsClient) setAuthorizedTicket(ticket string) {
	if ticket == "" {
		return
	}
	c.stateMu.Lock()
	c.authorizedTicket = ticket
	c.stateMu.Unlock()
}

func (c *wsClient) getAuthorizedTicket() string {
	c.stateMu.RLock()
	defer c.stateMu.RUnlock()
	return c.authorizedTicket
}

func (c *wsClient) setActiveSubtitleTrack(trackID string) {
	c.stateMu.Lock()
	c.activeSubtitleTrack = trackID
	c.stateMu.Unlock()
}

func (c *wsClient) getActiveSubtitleTrack() string {
	c.stateMu.RLock()
	defer c.stateMu.RUnlock()
	return c.activeSubtitleTrack
}

func (h *wsHub) snapshotClients() []*wsClient {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := make([]*wsClient, 0, len(h.clients))
	for client := range h.clients {
		list = append(list, client)
	}
	return list
}

func (h *wsHub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			// Envia estado inicial imediato
			client.sendInitialState()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
			}
			h.mu.Unlock()
			client.closeSend()
		case message := <-h.broadcast:
			var stale []*wsClient
			h.mu.Lock()
			for client := range h.clients {
				if !client.enqueueRaw(message) {
					delete(h.clients, client)
					stale = append(stale, client)
				}
			}
			h.mu.Unlock()
			for _, client := range stale {
				client.closeSend()
			}
		}
	}
}

func activeSwarmLinkCountLocked() int {
	links := len(activeLinks)
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		if !audioSelectionFrozen && len(playbackMagnets) > links {
			links = len(playbackMagnets)
		} else if torrentClient != nil && len(playbackMagnets) > links {
			wanted := make(map[string]bool, len(playbackMagnets))
			for _, magnet := range playbackMagnets {
				if hash, valid := normalizedMagnetHash(magnet); valid {
					wanted[hash] = true
				}
			}
			active := 0
			for _, item := range torrentClient.Torrents() {
				if wanted[item.InfoHash().HexString()] {
					active++
				}
			}
			if active > links {
				links = active
			}
		}
	}
	return links
}

func (c *wsClient) sendInitialState() {
	swarmMu.RLock()
	peers := connectedPeers
	links := activeSwarmLinkCountLocked()
	rate := downloadRateStr
	swarmMu.RUnlock()

	msg, _ := json.Marshal(map[string]interface{}{
		"event":        "status",
		"service":      "Anirium Player Pro Torrent Node",
		"version":      "2.2.0",
		"peers":        peers,
		"activeLinks":  links,
		"downloadRate": rate,
		"time":         time.Now().Unix(),
	})
	_ = c.enqueueRaw(msg)
}

func (c *wsClient) readPump() {
	defer func() {
		closeAddonConfigSessionsForClient(c)
		if c.cancel != nil {
			c.cancel()
		}
		if c.hub != nil {
			c.hub.unregister <- c
		} else {
			c.closeSend()
		}
		c.conn.Close()
	}()
	c.conn.SetReadLimit(1 << 20)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var cmd map[string]interface{}
		if err := json.Unmarshal(message, &cmd); err != nil {
			continue
		}
		c.handleCommand(cmd)
	}
}

func (c *wsClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *wsClient) handleCommand(cmd map[string]interface{}) {
	action, _ := cmd["action"].(string)
	switch action {
	case "ping":
		c.sendEvent("pong", map[string]interface{}{"time": time.Now().Unix()})
	case "get_manifest":
		manifest := buildCurrentManifest()
		c.sendEvent("manifest", manifest)
	case "prepare":
		go c.handleWSPrepare(cmd)
	case "renew":
		go c.handleWSRenew(cmd)
	case "set_subtitle":
		if ticket, _ := cmd["playbackTicket"].(string); ticket != "" && hasActivePlaybackGrant(ticket) {
			c.setAuthorizedTicket(ticket)
		}
		trackID, _ := cmd["trackId"].(string)
		if trackID == "off" {
			trackID = ""
		}
		c.setActiveSubtitleTrack(trackID)
	case "get_subtitle":
		go c.handleWSGetSubtitle(cmd)
	case "seek", "request_window":
		if ticket, _ := cmd["playbackTicket"].(string); ticket != "" && hasActivePlaybackGrant(ticket) {
			c.setAuthorizedTicket(ticket)
		}
		quality, _ := cmd["quality"].(string)
		if quality == "" {
			quality = "1080p"
		}
		audio, _ := cmd["audio"].(string)
		subtitle, _ := cmd["subtitle"].(string)
		if subtitle != "" && subtitle != "off" {
			c.setActiveSubtitleTrack(subtitle)
		}
		pos := 0.0
		if p, ok := cmd["position"].(float64); ok {
			pos = p
		}
		normalizedPos := math.Floor(pos/4) * 4
		if normalizedPos < 0 {
			normalizedPos = 0
		}
		preparePlaybackMu.Lock()
		swarmMu.Lock()
		if subtitle != "" {
			validSub := false
			for _, track := range subtitleTracksLocked() {
				if track.ID == subtitle {
					validSub = true
					break
				}
			}
			if !validSub {
				subtitle = ""
			} else {
				c.setActiveSubtitleTrack(subtitle)
			}
		}
		if audio != "" && len(selectedAudioCandidates) > 0 {
			validAudio := false
			for _, candidate := range selectedAudioCandidates {
				if candidate.Language == audio {
					validAudio = true
					break
				}
			}
			if !validAudio {
				audio = ""
			}
		}
		targetAudio := audio
		if targetAudio == "" && len(selectedAudioCandidates) > 0 {
			targetAudio = selectedAudioCandidates[0].Language
			for _, candidate := range selectedAudioCandidates {
				if candidate.Language == "jpn" {
					targetAudio = "jpn"
					break
				}
			}
		}
		previous := currentPlaybackWindow
		mediaSwitch := previous != nil && previous.ctx.Err() == nil &&
			(previous.Quality != quality || (previous.Audio != "" && targetAudio != "" && previous.Audio != targetAudio))
		if mediaSwitch {
			restoreParkedPlaybackTimelineLocked(quality, targetAudio, normalizedPos)
		}
		existing := currentPlaybackWindow
		timelineStart, minRetainedStart, cachedEnd, hasReadyTimeline := activeContinuousWindowRangeLocked()
		sameMedia := existing != nil && existing.ctx.Err() == nil &&
			existing.Quality == quality &&
			(existing.Audio == "" || targetAudio == "" || existing.Audio == targetAudio)
		reuseCurrentExact := sameMedia &&
			math.Abs(existing.Start-normalizedPos) < 0.05 &&
			(existing.Status == "preparing" || existing.Status == "ready")
		reuseContinuousRange := sameMedia && hasReadyTimeline &&
			existing.ContinuousPlaylistURL != "" &&
			normalizedPos >= minRetainedStart-0.05 &&
			normalizedPos < cachedEnd-0.5
		reuseExisting := reuseCurrentExact || reuseContinuousRange
		previousSession := currentPlaybackSession
		applied := applyPlaybackSessionCommandLocked(playbackSessionCommand{
			Action:        "seek",
			Quality:       quality,
			Audio:         audio,
			Subtitle:      subtitle,
			Position:      normalizedPos,
			Playing:       true,
			BufferSeconds: 30,
		})
		readyWindowID := ""
		readyURL := ""
		continuousURL := ""
		readyTimelineStart := 0.0
		readyCachedEnd := 0.0
		reusedTimeline := false
		if applied {
			if reuseExisting {
				if existing.Audio == "" && currentPlaybackSession.Audio != "" {
					existing.Audio = currentPlaybackSession.Audio
				}
				if reuseContinuousRange || existing.Status == "ready" {
					readyWindowID = existing.ID
					readyURL = existing.PlaylistURL
					continuousURL = existing.ContinuousPlaylistURL
					readyTimelineStart = timelineStart
					readyCachedEnd = cachedEnd
					reusedTimeline = reuseContinuousRange
				}
			} else if mediaSwitch && currentPlaybackWindow == previous {
				// Keep the previous quality/audio encoded media for a later switch back.
				parkActivePlaybackTimelineLocked()
			} else {
				cancelPlaybackWindowLocked()
			}
		}
		swarmMu.Unlock()
		ok := applied
		if applied && !reuseExisting {
			ok = requestPlaybackWindow(quality, normalizedPos)
			if !ok {
				swarmMu.Lock()
				currentPlaybackSession = previousSession
				swarmMu.Unlock()
			}
		}
		if ok {
			swarmMu.Lock()
			startSessionPreparationLocked()
			swarmMu.Unlock()
		}
		preparePlaybackMu.Unlock()
		c.sendEvent("window_requested", map[string]interface{}{
			"quality":        quality,
			"position":       normalizedPos,
			"accepted":       ok,
			"reusedTimeline": reusedTimeline,
		})
		if ok && (continuousURL != "" || readyURL != "") {
			c.sendEvent("window_ready", map[string]interface{}{
				"windowId":              readyWindowID,
				"quality":               quality,
				"start":                 normalizedPos,
				"timelineStart":         readyTimelineStart,
				"minRetainedStart":      minRetainedStart,
				"cachedEnd":             readyCachedEnd,
				"playlistUrl":           readyURL,
				"continuousPlaylistUrl": continuousURL,
				"status":                "ready",
				"reusedTimeline":        reusedTimeline,
			})
		}
	case "progress":
		if ticket, _ := cmd["playbackTicket"].(string); ticket != "" && hasActivePlaybackGrant(ticket) {
			c.setAuthorizedTicket(ticket)
		}
		pos := 0.0
		if p, ok := cmd["position"].(float64); ok {
			pos = p
		}
		audio, _ := cmd["audio"].(string)
		subtitle, _ := cmd["subtitle"].(string)
		if subtitle != "" && subtitle != "off" {
			c.setActiveSubtitleTrack(subtitle)
		}
		swarmMu.Lock()
		window := currentPlaybackWindow
		if window != nil && window.ctx.Err() == nil && isFiniteWindowPosition(pos) {
			limit := playbackEpisodeDurationLocked()
			if window.EpisodeDuration > 0 {
				limit = window.EpisodeDuration
			}
			if limit <= 0 || pos <= limit+0.25 {
				if currentPlaybackSession.Generation != playbackGeneration || currentPlaybackSession.Revision == 0 {
					_ = applyPlaybackSessionCommandLocked(playbackSessionCommand{
						Action:        "seek",
						Quality:       window.Quality,
						Audio:         audio,
						Subtitle:      subtitle,
						Position:      pos,
						Playing:       true,
						BufferSeconds: 30,
					})
				} else {
					currentPlaybackSession.Position = pos
					if subtitle != "" {
						currentPlaybackSession.Subtitle = subtitle
					}
				}
				startSessionPreparationLocked()
			}
		}
		swarmMu.Unlock()
	case "get_stats":
		swarmMu.RLock()
		peers := connectedPeers
		links := activeSwarmLinkCountLocked()
		rate := downloadRateStr
		swarmMu.RUnlock()
		c.sendEvent("stats", map[string]interface{}{
			"peers":           peers,
			"activeLinks":     links,
			"downloadRate":    rate,
			"totalUploaded":   totalUploadedStr,
			"totalDownloaded": totalDownloadedStr,
		})
	case "health":
		c.sendEvent("health", map[string]interface{}{
			"status":  "online",
			"service": "Anirium Player Pro Torrent Node",
			"version": serviceVersion,
			"port":    globalPort,
		})
	case "inspect_addon":
		go c.handleWSInspectAddon(cmd)
	case "inspect_addons":
		go c.handleWSInspectAddons(cmd)
	case "search_addon_directories":
		go c.handleWSSearchAddonDirectories(cmd)
	case "start_addon_config_session":
		go c.handleWSStartAddonConfigSession(cmd)
	case "close_addon_config_session":
		go c.handleWSCloseAddonConfigSession(cmd)
	case "party_join":
		roomID, _ := cmd["roomId"].(string)
		author, _ := cmd["author"].(string)
		isHost, _ := cmd["isHost"].(bool)
		state := globalMeshHub.JoinWatchParty(strings.TrimSpace(roomID), strings.TrimSpace(author), isHost)
		c.sendEvent("party_state", state)
	case "party_leave":
		state := globalMeshHub.LeaveWatchParty()
		c.sendEvent("party_state", state)
	case "party_state":
		c.sendEvent("party_state", globalMeshHub.CurrentWatchPartyState())
	case "party_sync":
		pos, _ := cmd["position"].(float64)
		playing, _ := cmd["playing"].(bool)
		rate, _ := cmd["playbackRate"].(float64)
		globalMeshHub.PublishPartySync(pos, playing, rate)
	case "party_chat":
		text, _ := cmd["text"].(string)
		if msg, ok := globalMeshHub.PublishPartyChat(strings.TrimSpace(text)); ok {
			broadcastWSEvent("party_chat", msg)
		}
	case "close_session":
		sid, _ := cmd["sessionId"].(string)
		if strings.TrimSpace(sid) == "" {
			sid = c.currentSessionID()
		}
		closed := globalSessionManager.Close(sid)
		c.sendEvent("session_closed", map[string]interface{}{
			"sessionId": sid,
			"closed":    closed,
		})
	case "get_sessions":
		c.sendEvent("sessions", map[string]interface{}{
			"activeCount": globalSessionManager.ActiveCount(),
		})
	}
}

func (c *wsClient) sendEvent(event string, payload interface{}) {
	if event == "subtitle_data" {
		if sub, ok := payload.(wsSubtitlePayload); ok && strings.Contains(sub.VTT, "-->") {
			if targetLang, _, isTranslated := parseTranslatedTrackID(sub.TrackID); isTranslated {
				ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
				if translated, _, err := translateWebVTT(ctx, sub.VTT, targetLang); translated != "" && (err == nil || translated != sub.VTT) {
					sub.VTT = translated
					payload = sub
				} else if err != nil {
					appendLog(fmt.Sprintf("Subtitle translation failed track=%s lang=%s err=%v", sub.TrackID, targetLang, err))
				}
				cancel()
			}
		}
	}
	swarmMu.RLock()
	gen := playbackGeneration
	swarmMu.RUnlock()
	data, err := json.Marshal(map[string]interface{}{
		"event":      event,
		"generation": gen,
		"payload":    payload,
	})
	if err == nil {
		_ = c.enqueueRaw(data)
	}
}

func broadcastToSession(sessionID, event string, payload interface{}) {
	sid := strings.TrimSpace(sessionID)
	var gen uint64
	if slot, ok := globalSessionManager.Get(sid); ok {
		slot.mu.RLock()
		gen = slot.Generation
		slot.mu.RUnlock()
	} else {
		swarmMu.RLock()
		gen = playbackGeneration
		swarmMu.RUnlock()
	}
	data, err := json.Marshal(map[string]interface{}{
		"event":      event,
		"sessionId":  sid,
		"generation": gen,
		"payload":    payload,
	})
	if err != nil {
		return
	}
	globalHub.mu.Lock()
	clients := make([]*wsClient, 0, len(globalHub.clients))
	for client := range globalHub.clients {
		clients = append(clients, client)
	}
	globalHub.mu.Unlock()
	for _, client := range clients {
		client.stateMu.RLock()
		clientSID := client.sessionID
		client.stateMu.RUnlock()
		if sid != "" && clientSID != "" && clientSID != sid {
			continue
		}
		_ = client.enqueueRaw(data)
	}
}

func broadcastWSEvent(event string, payload interface{}) {
	swarmMu.RLock()
	gen := playbackGeneration
	swarmMu.RUnlock()
	data, err := json.Marshal(map[string]interface{}{
		"event":      event,
		"generation": gen,
		"payload":    payload,
	})
	if err != nil {
		return
	}
	globalHub.mu.Lock()
	clients := make([]*wsClient, 0, len(globalHub.clients))
	for client := range globalHub.clients {
		clients = append(clients, client)
	}
	globalHub.mu.Unlock()
	for _, client := range clients {
		client.stateMu.RLock()
		bound := client.boundGeneration
		client.stateMu.RUnlock()
		if bound != 0 && gen != 0 && bound != gen {
			continue
		}
		_ = client.enqueueRaw(data)
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ensureGlobalHubRunning()
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		appendLog(fmt.Sprintf("WebSocket upgrade error: %v", err))
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	client := &wsClient{
		hub:    globalHub,
		conn:   conn,
		send:   make(chan []byte, 256),
		ctx:    ctx,
		cancel: cancel,
		origin: r.Header.Get("Origin"),
	}
	client.hub.register <- client
	go client.writePump()
	go client.readPump()
}

func buildCurrentManifest() MixManifest {
	swarmMu.RLock()
	links := activeSwarmLinkCountLocked()
	generation := playbackGeneration
	catalogIdentity := currentCatalogIdentity
	qualities := append([]string(nil), currentMixQualities...)
	episodeDuration := playbackEpisodeDurationLocked()
	audioChoices := append([]string(nil), currentMixAudios...)
	subs := append([]string(nil), currentMixSubs...)
	subtitleTracks := manifestSubtitleTracksLocked()
	audioTracks := manifestAudioTracksLocked()
	audios := []string{}
	for _, track := range audioTracks {
		if track.Status == "ready" {
			audios = append(audios, track.Language)
		}
	}
	peers := connectedPeers
	rateSnapshot := downloadRateStr
	variants := []MixVariant{}
	manifestQualities := expandDownscaleQualities(selectVariantQualities(qualities))
	discoveryComplete := playbackDiscoveryComplete
	inventoryScanning := playbackInventoryScanning
	timelineStart, _, _ := activeContinuousWindowBoundsLocked()
	for _, quality := range manifestQualities {
		if quality != "" {
			variant := MixVariant{
				ID: playbackVariantID(generation, quality), Quality: quality,
				AudioLanguages: append([]string(nil), audios...), SubtitleCount: len(subs),
				Status: "available", PeerCount: peers,
			}
			if requestedVariants[variant.ID] {
				variant.Status = "preparing"
			}
			variantMu.RLock()
			if runtime, ok := variantRuntimes[variant.ID]; ok {
				variant = runtime.MixVariant
				variant.PeerCount = peers
			}
			variantMu.RUnlock()
			if window := currentPlaybackWindow; window != nil && window.ctx.Err() == nil && window.Quality == quality && window.Status == "preparing" {
				variant = preparingWindowVariant(variant)
			}
			if window := currentPlaybackWindow; window != nil && window.ctx.Err() == nil && window.Quality == quality && window.Status == "stalled" {
				variant = stalledWindowVariant(variant)
			}
			if window := currentPlaybackWindow; window != nil && window.ctx.Err() == nil && window.Status == "ready" {
				if window.Quality == quality {
					variantMu.RLock()
					if runtime := variantRuntimes[window.ID+"-video"]; runtime != nil {
						variant = runtime.MixVariant
						variant.PlaylistURL = window.PlaylistURL
						variant.ContinuousPlaylistURL = window.ContinuousPlaylistURL
						variant.TimelineStart = timelineStart
						variant.PeerCount = peers
					}
					variantMu.RUnlock()
				} else {
					variant.Status, variant.PlaylistURL = "available", ""
					variant.ContinuousPlaylistURL, variant.TimelineStart = "", 0
					variant.ProcessingFailed = false
				}
			}
			variant.AudioLanguages = append([]string(nil), audios...)
			variant.SubtitleCount = len(subtitleTracks)
			if variant.Status == "ready" && !audioPlaybackReady(audioTracks) {
				variant.Status = audioPreparationStatus(audioTracks)
				variant.PlaylistURL = ""
				variant.ContinuousPlaylistURL = ""
				variant.TimelineStart = 0
				variant.BufferPercent = 0
			}
			variants = append(variants, variant)
		}
	}
	swarmMu.RUnlock()
	manifestStatus, bufferPercent := manifestAvailability(variants, discoveryComplete)
	return MixManifest{
		CatalogIdentity:       &catalogIdentity,
		SubtitleBundleVersion: 1,
		InventoryScanning:     inventoryScanning,
		WindowOnDemand:        true,
		ContinuousBuffer:      discoveryComplete && os.Getenv("ANIRIUM_CONTINUOUS_BUFFER") == "1",
		EpisodeDuration:       episodeDuration,
		Version:               1, QualityOnDemand: true, Status: manifestStatus, ActiveLinks: links, Peers: peers,
		Qualities: manifestQualities, Audios: audios, Subtitles: subs,
		SubtitleTracks: subtitleTracks,
		AudioTracks:    audioTracks,
		AudioChoices:   audioChoices,
		Variants:       variants, BufferPercent: bufferPercent, DownloadRate: rateSnapshot,
	}
}

func activeContinuousWindowRangeLocked() (float64, float64, float64, bool) {
	if currentPlaybackWindow == nil || (currentPlaybackWindow.ctx != nil && currentPlaybackWindow.ctx.Err() != nil) {
		return 0, 0, 0, false
	}
	root := currentPlaybackWindow.timelineID
	if root == "" {
		root = currentPlaybackWindow.ID
	}
	windows := append([]*playbackWindow(nil), retainedPlaybackWindows...)
	windows = append(windows, currentPlaybackWindow, prefetchedPlaybackWindow)
	found := false
	minStart := 0.0
	maxEnd := 0.0
	originStart := currentPlaybackWindow.TimelineStart
	hasOrigin := isFiniteWindowPosition(originStart)
	for _, w := range windows {
		if w == nil || (w.ctx != nil && w.ctx.Err() != nil) || w.Status != "ready" {
			continue
		}
		if w.timelineID != "" && w.timelineID != root {
			continue
		}
		if w.timelineID == "" && w.ID != root {
			continue
		}
		dur := w.DeliveredDuration
		if dur <= 0 {
			dur = w.Duration
		}
		end := w.Start + dur
		if !found || w.Start < minStart {
			minStart = w.Start
		}
		if !found || end > maxEnd {
			maxEnd = end
		}
		if !hasOrigin && isFiniteWindowPosition(w.TimelineStart) {
			originStart = w.TimelineStart
			hasOrigin = true
		}
		found = true
	}
	if found {
		if !hasOrigin {
			originStart = minStart
		}
		return originStart, minStart, maxEnd, true
	}
	return currentPlaybackWindow.TimelineStart, currentPlaybackWindow.TimelineStart, 0, false
}

func activeContinuousWindowBoundsLocked() (float64, float64, bool) {
	originStart, _, maxEnd, ok := activeContinuousWindowRangeLocked()
	return originStart, maxEnd, ok
}

func preparedCacheEndLocked() float64 {
	_, cachedEnd, _ := activeContinuousWindowBoundsLocked()
	return cachedEnd
}

func qualitySourceCountsLocked() (map[string]int, int, int) {
	nativeCounts := map[string]int{}
	compatCounts := map[string]int{}
	probedCount := 0
	for _, src := range activeLinks {
		streams := probedStreams[src]
		if len(streams) == 0 {
			continue
		}
		maxHeight := 0
		for _, s := range streams {
			if s.CodecType == "video" && s.Height > maxHeight {
				maxHeight = s.Height
			}
		}
		if maxHeight <= 0 {
			continue
		}
		probedCount++
		switch {
		case maxHeight >= 1080:
			nativeCounts["1080p"]++
		case maxHeight >= 720:
			nativeCounts["720p"]++
		case maxHeight >= 480:
			nativeCounts["480p"]++
		default:
			nativeCounts["360p"]++
		}
		if maxHeight >= 1080 {
			compatCounts["1080p"]++
		}
		if maxHeight >= 720 {
			compatCounts["720p"]++
		}
		if maxHeight >= 480 {
			compatCounts["480p"]++
		}
		compatCounts["360p"]++
	}
	result := map[string]int{}
	for q, count := range nativeCounts {
		if count > 0 {
			result[q] = count
		}
	}
	for _, q := range currentMixQualities {
		if result[q] == 0 && compatCounts[q] > 0 {
			result[q] = compatCounts[q]
		}
	}
	totalSources := len(playbackMagnets)
	if totalSources < len(activeLinks) {
		totalSources = len(activeLinks)
	}
	return result, probedCount, totalSources
}

func subtitlePreparationProgressLocked() (int, bool) {
	tracks := manifestSubtitleTracksLocked()
	if len(tracks) == 0 {
		if playbackDiscoveryComplete {
			return 100, true
		}
		if len(probedStreams) > 0 {
			return 35, false
		}
		return 10, false
	}
	priorityReady := false
	anyReady := false
	for _, tr := range tracks {
		if tr.Ready {
			anyReady = true
			lang := canonicalLanguage(tr.Language)
			if lang == "por" || lang == "eng" || tr.Primary {
				priorityReady = true
				break
			}
		}
	}
	if priorityReady {
		return 100, true
	}
	if anyReady {
		return 85, false
	}
	if len(probedStreams) > 0 {
		return 60, false
	}
	return 30, false
}

func buildTelemetrySnapshotPayload() map[string]interface{} {
	swarmMu.RLock()
	peers := connectedPeers
	links := activeSwarmLinkCountLocked()
	rate := downloadRateStr
	qualities := append([]string(nil), currentMixQualities...)
	subtitleTracks := manifestSubtitleTracksLocked()
	subtitleTrackCount := len(subtitleTracks)
	qualityCounts, probedSources, totalSources := qualitySourceCountsLocked()
	subProgress, subReady := subtitlePreparationProgressLocked()
	discoveryComplete := playbackDiscoveryComplete
	inventoryScanning := playbackInventoryScanning
	episodeDuration := playbackEpisodeDurationLocked()
	timelineStart, minRetainedStart, cachedEnd, _ := activeContinuousWindowRangeLocked()
	window := currentPlaybackWindow
	var winInfo map[string]interface{}
	if window != nil && (window.ctx == nil || window.ctx.Err() == nil) {
		winInfo = map[string]interface{}{
			"id":                    window.ID,
			"status":                window.Status,
			"start":                 window.Start,
			"timelineStart":         timelineStart,
			"minRetainedStart":      minRetainedStart,
			"quality":               window.Quality,
			"playlistUrl":           window.PlaylistURL,
			"continuousPlaylistUrl": window.ContinuousPlaylistURL,
		}
	}
	swarmMu.RUnlock()

	return map[string]interface{}{
		"peers":               peers,
		"activeLinks":         links,
		"downloadRate":        rate,
		"totalUploaded":       totalUploadedStr,
		"totalDownloaded":     totalDownloadedStr,
		"qualities":           qualities,
		"qualitySourceCounts": qualityCounts,
		"probedSources":       probedSources,
		"totalSources":        totalSources,
		"subtitleTrackCount":  subtitleTrackCount,
		"subtitleProgress":    subProgress,
		"subtitleReady":       subReady,
		"discoveryComplete":   discoveryComplete,
		"inventoryScanning":   inventoryScanning,
		"timelineStart":       timelineStart,
		"minRetainedStart":    minRetainedStart,
		"cachedEnd":           cachedEnd,
		"episodeDuration":     episodeDuration,
		"window":              winInfo,
	}
}

func broadcastStartupTelemetry() {
	globalHub.mu.Lock()
	hasClients := len(globalHub.clients) > 0
	globalHub.mu.Unlock()
	if !hasClients {
		return
	}
	broadcastWSEvent("telemetry", buildTelemetrySnapshotPayload())
}

// Inicia broadcasting de telemetria contínua a cada 1 segundo para todos os clientes WebSocket conectados
func startWSTelemetryLoop() {
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			broadcastStartupTelemetry()
		}
	}()
}
