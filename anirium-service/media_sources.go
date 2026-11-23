package main

import (
	"context"
	"fmt"
	"github.com/anacrolix/torrent"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type mediaSource struct {
	Magnet, FilePath  string
	FileBytes         int64 // Actual selected episode file, never provider-reported torrent size.
	ExplicitSelection bool
}

var mediaSourceMu sync.RWMutex
var mediaSources = map[string]mediaSource{}

func resolveMediaSource(id string) mediaSource {
	mediaSourceMu.RLock()
	source, exists := mediaSources[id]
	mediaSourceMu.RUnlock()
	if !exists {
		return mediaSource{Magnet: id}
	}
	return source
}

func selectSourceVideo(ctx context.Context, files []*torrent.File, id string) (*torrent.File, error) {
	source := resolveMediaSource(id)
	if source.FilePath == "" {
		return selectTorrentVideo(ctx, files)
	}
	eligible := matchingTorrentVideos(ctx, files)
	if source.ExplicitSelection {
		eligible = files
	}
	for _, file := range eligible {
		if file.DisplayPath() == source.FilePath {
			return file, nil
		}
	}
	return nil, fmt.Errorf("selected source file not eligible for episode")
}

// Caller holds mediaSourceMu. Reuses the existing ID if the same torrent file
// was already registered in this generation (e.g., during fast discovery).
func registerMediaSourceLocked(generation uint64, source mediaSource) string {
	prefix := fmt.Sprintf("media-%d-", generation)
	count := 0
	for id, existing := range mediaSources {
		if strings.HasPrefix(id, prefix) {
			count++
			if existing.Magnet == source.Magnet && existing.FilePath == source.FilePath {
				return id
			}
		}
	}
	id := fmt.Sprintf("media-%d-%d", generation, count)
	mediaSources[id] = source
	return id
}

func expandMediaSources(ctx context.Context, magnets []string, generation uint64, onSource ...func(string)) []string {
	swarmMu.RLock()
	client := torrentClient
	swarmMu.RUnlock()
	if client == nil {
		return nil
	}
	perTorrent := make([][]mediaSource, len(magnets))
	var mu sync.Mutex
	probeSources(ctx, magnets, func(magnet string) {
		t, err := addPlaybackTorrent(ctx, client, magnet)
		if err != nil {
			return
		}
		select {
		case <-t.GotInfo():
		case <-ctx.Done():
			return
		case <-time.After(25 * time.Second):
			return
		}
		matches := matchingTorrentVideos(ctx, t.Files())
		explicit := false
		if uri, parseErr := url.Parse(magnet); parseErr == nil && uri.Query().Has("so") {
			explicit = true
			matches = nil
			index, indexErr := strconv.Atoi(uri.Query().Get("so"))
			if indexErr == nil && index >= 0 && index < len(t.Files()) {
				file := t.Files()[index]
				lower := strings.ToLower(file.DisplayPath())
				if strings.HasSuffix(lower, ".mkv") || strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".webm") || strings.HasSuffix(lower, ".avi") {
					matches = []*torrent.File{file}
				}
			}
		}
		mu.Lock()
		var matched []mediaSource
		for index, value := range magnets {
			if value == magnet {
				for _, file := range matches {
					src := mediaSource{Magnet: magnet, FilePath: file.DisplayPath(), FileBytes: file.Length(), ExplicitSelection: explicit}
					perTorrent[index] = append(perTorrent[index], src)
					matched = append(matched, src)
				}
				break
			}
		}
		mu.Unlock()
		if len(onSource) > 0 && onSource[0] != nil && len(matched) > 0 {
			var newIDs []string
			prefix := fmt.Sprintf("media-%d-", generation)
			swarmMu.Lock()
			if generation == playbackGeneration && playbackContext.Err() == nil {
				mediaSourceMu.Lock()
				for _, src := range matched {
					id := registerMediaSourceLocked(generation, src)
					newIDs = append(newIDs, id)
					filtered := make([]string, 0, len(activeLinks)+1)
					for _, link := range activeLinks {
						if strings.HasPrefix(link, prefix) {
							filtered = append(filtered, link)
						}
					}
					if !containsString(filtered, id) {
						filtered = append(filtered, id)
					}
					activeLinks = filtered
				}
				mediaSourceMu.Unlock()
			}
			swarmMu.Unlock()
			for _, id := range newIDs {
				if ctx.Err() != nil {
					break
				}
				onSource[0](id)
			}
		}
	})
	swarmMu.Lock()
	defer swarmMu.Unlock()
	if (ctx.Err() != nil && ctx.Err() != context.DeadlineExceeded) || generation != playbackGeneration || playbackContext.Err() != nil {
		return nil
	}
	mediaSourceMu.Lock()
	defer mediaSourceMu.Unlock()
	prefix := fmt.Sprintf("media-%d-", generation)
	ids := []string{}
	for _, sources := range perTorrent {
		for _, source := range sources {
			id := registerMediaSourceLocked(generation, source)
			if !containsString(ids, id) {
				ids = append(ids, id)
			}
		}
	}
	for _, existing := range activeLinks {
		if strings.HasPrefix(existing, prefix) && !containsString(ids, existing) {
			ids = append(ids, existing)
		}
	}
	activeLinks = append([]string(nil), ids...)
	return ids
}
