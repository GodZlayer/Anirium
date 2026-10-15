package main

import (
	"context"
	"fmt"
	"github.com/anacrolix/torrent"
	"sync"
	"time"
)

type mediaSource struct {
	Magnet, FilePath string
	FileBytes        int64 // Actual selected episode file, never provider-reported torrent size.
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
	for _, file := range matchingTorrentVideos(ctx, files) {
		if file.DisplayPath() == source.FilePath {
			return file, nil
		}
	}
	return nil, fmt.Errorf("selected source file not eligible for episode")
}

func expandMediaSources(ctx context.Context, magnets []string, generation uint64) []string {
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
		mu.Lock()
		defer mu.Unlock()
		for index, value := range magnets {
			if value == magnet {
				for _, file := range matches {
					perTorrent[index] = append(perTorrent[index], mediaSource{Magnet: magnet, FilePath: file.DisplayPath(), FileBytes: file.Length()})
				}
				break
			}
		}
	})
	swarmMu.Lock()
	defer swarmMu.Unlock()
	if ctx.Err() != nil || generation != playbackGeneration {
		return nil
	}
	mediaSourceMu.Lock()
	defer mediaSourceMu.Unlock()
	ids := []string{}
	for _, sources := range perTorrent {
		for _, source := range sources {
			id := fmt.Sprintf("media-%d-%d", generation, len(ids))
			mediaSources[id] = source
			ids = append(ids, id)
		}
	}
	activeLinks = append([]string(nil), ids...)
	return ids
}
