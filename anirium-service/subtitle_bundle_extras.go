package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"
)

func subtitleLanguagePriority(lang string) int {
	switch canonicalLanguage(lang) {
	case "por":
		return 0
	case "eng":
		return 1
	case "spa":
		return 2
	default:
		return 3
	}
}

func (b *subtitleBundle) startExtras(tracks []SubtitleTrack) {
	b.mu.Lock()
	added := false
	for _, track := range tracks {
		if b.closed || b.cache.ctx.Err() != nil || track.StreamIndex >= 0 || (track.Source != "" && track.Source != b.source) {
			continue
		}
		if b.tracks[track.ID] != nil {
			continue
		}
		b.revision++
		state := &bundledSubtitle{ID: track.ID, Language: track.Language, Title: track.Title, Status: "preparing", Alignment: "unverified", Parts: []subtitlePart{}, track: track, revision: b.revision}
		b.tracks[track.ID] = state
		b.extraPending = append(b.extraPending, state)
		b.workers.Add(1)
		added = true
	}
	if added {
		sort.SliceStable(b.extraPending, func(i, j int) bool {
			return subtitleLanguagePriority(b.extraPending[i].Language) < subtitleLanguagePriority(b.extraPending[j].Language)
		})
		limit := cap(b.externalSlots)
		if limit < 1 {
			limit = 2
		}
		for spawned := 0; b.extraActive < limit && spawned < len(b.extraPending); spawned++ {
			b.extraActive++
			go b.drainExtras()
		}
	}
	b.mu.Unlock()
}

func (b *subtitleBundle) drainExtras() {
	for {
		b.mu.Lock()
		if len(b.extraPending) == 0 {
			b.extraActive--
			b.mu.Unlock()
			return
		}
		state := b.extraPending[0]
		b.extraPending = b.extraPending[1:]
		canceled := b.closed || b.cache.ctx.Err() != nil
		b.mu.Unlock()
		if !canceled {
			b.loadExtra(state)
		}
		b.workers.Done()
	}
}

func (b *subtitleBundle) loadExtra(state *bundledSubtitle) {
	select {
	case b.externalSlots <- struct{}{}:
	case <-b.cache.ctx.Done():
		return
	}
	defer func() { <-b.externalSlots }()
	budget := 90 * time.Second
	if state.track.Source == "" && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		budget = 20 * time.Second
	}
	ctx, cancel := context.WithTimeout(b.cache.ctx, budget)
	defer cancel()
	content, err := loadBundleExtra(ctx, state.track, budget)
	cues, parseErr := parseBundleCues(content, 0)
	b.mu.Lock()
	if b.cache.ctx.Err() != nil || b.tracks[state.ID] != state {
		b.mu.Unlock()
		return
	}
	b.revision++
	state.revision = b.revision
	if err != nil || parseErr != nil || b.bytes+len(content) > 64<<20 {
		state.Status = "failed"
		b.mu.Unlock()
		return
	}
	b.bytes += len(content)
	state.Status = "ready"
	state.Complete = true
	state.Parts = []subtitlePart{{Start: 0, End: 86400, Cues: cues, Revision: b.revision}}
	b.cache.rememberCompleteSubtitle(state.ID)
	trackID, lang, alignment := state.ID, state.Language, state.Alignment
	b.mu.Unlock()
	broadcastWSEvent("subtitle_ready", map[string]interface{}{
		"trackId":  trackID,
		"language": lang,
		"complete": true,
	})
	pushCompleteSubtitleToSubscribers(trackID, content, alignment)
}

func loadBundleExtra(ctx context.Context, track SubtitleTrack, budget ...time.Duration) (string, error) {
	if track.Source == "" {
		swarmMu.RLock()
		var found *ProviderSubtitle
		for index, remote := range externalSubtitles {
			if track.ID == fmt.Sprintf("external-%d-%d", playbackGeneration, index) {
				copy := remote
				found = &copy
				break
			}
		}
		swarmMu.RUnlock()
		if found == nil {
			return "", fmt.Errorf("retired subtitle")
		}
		limit := 90 * time.Second
		if len(budget) > 0 && budget[0] > 0 {
			limit = budget[0]
		}
		return externalSubtitleVTTWithBudget(ctx, *found, limit)
	}
	swarmMu.RLock()
	client := torrentClient
	swarmMu.RUnlock()
	if client == nil {
		return "", fmt.Errorf("torrent unavailable")
	}
	item, err := addPlaybackTorrent(ctx, client, resolveMediaSource(track.Source).Magnet)
	if err != nil {
		return "", err
	}
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-item.GotInfo():
	}
	for _, file := range item.Files() {
		if file.DisplayPath() == track.FilePath {
			reader := file.NewReader()
			defer reader.Close()
			stop := context.AfterFunc(ctx, func() { reader.Close() })
			defer stop()
			raw, err := io.ReadAll(io.LimitReader(reader, (16<<20)+1))
			if err != nil || len(raw) > 16<<20 {
				return "", fmt.Errorf("sidecar unavailable")
			}
			return convertSidecarVTT(ctx, raw, filepath.Ext(track.FilePath))
		}
	}
	return "", fmt.Errorf("sidecar missing")
}
