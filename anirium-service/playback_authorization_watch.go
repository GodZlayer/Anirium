package main

import (
	"context"
	"time"

	"github.com/anacrolix/torrent"
)

// Validate the renewable media grant, not the initial Core token: the Player
// refreshes that grant while the same authorized playback instance is alive.
func watchPlaybackAuthorization(ctx context.Context, generation uint64, ticket string, interval time.Duration, magnets ...string) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		rejection := validatePlaybackGrantRejection(ticket)
		if rejection == nil {
			continue
		}
		// Never depend on preparePlaybackMu: a long provider search holds it and
		// a shutdown must not wait behind a revoked worker's preparation. Cancel
		// and drop only while the ownership generation is still protected.
		swarmMu.Lock()
		ownCanceled := false
		if generation == playbackGeneration {
			if cancelPlayback != nil {
				cancelPlayback()
				ownCanceled = true
			}
			dropPlaybackTorrents(torrentClient, magnets)
		}
		swarmMu.Unlock()
		if ownCanceled {
			if msg := formatAuthorizationDiagnostic(rejection); msg != "" {
				appendLog(msg)
			}
		}
		return
	}
}

func dropPlaybackTorrents(client *torrent.Client, magnets []string) {
	if client == nil {
		return
	}
	hashes := map[string]bool{}
	for _, magnet := range magnets {
		if hash, valid := normalizedMagnetHash(magnet); valid {
			hashes[hash] = true
		}
	}
	for _, item := range client.Torrents() {
		if hashes[item.InfoHash().HexString()] {
			item.Drop()
		}
	}
}

func unretainedMagnets(owned, retained []string) []string {
	hashes := map[string]bool{}
	for _, magnet := range retained {
		if hash, valid := normalizedMagnetHash(magnet); valid {
			hashes[hash] = true
		}
	}
	result := []string{}
	for _, magnet := range owned {
		if hash, valid := normalizedMagnetHash(magnet); valid && !hashes[hash] {
			result = append(result, magnet)
		}
	}
	return result
}
