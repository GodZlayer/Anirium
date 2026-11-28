package main

import (
	"path/filepath"
	"sync"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/storage"
)

// Reserve space for incomplete chunks and their atomic promotion while the
// library schedules requests against a smaller advertised storage capacity.
// Sized to hold multiple 1080p episodes without evicting active sequential pieces.
const runtimePieceCacheBudget = 12 << 30
const runtimePieceSchedulingCapacity = 8 << 30

func newBoundedRuntimeTorrentClient(cfg *torrent.ClientConfig) (*torrent.Client, func(), error) {
	cache, err := newFixedPieceResourceCache(filepath.Join(cfg.DataDir, "pieces"), runtimePieceCacheBudget)
	if err != nil {
		return nil, nil, err
	}
	capacity := func() (int64, bool) { return runtimePieceSchedulingCapacity, true }
	cfg.DefaultStorage = storage.NewResourcePiecesOpts(cache, storage.ResourcePiecesOpts{Capacity: &capacity})
	client, err := torrent.NewClient(cfg)
	if err != nil {
		return nil, nil, err
	}
	var once sync.Once
	return client, func() { once.Do(func() { client.Close() }) }, nil
}

// The default file backend in torrent v1.61.0 retains mmap handles after
// TorrentImpl.Close. Use the explicit mmap backend, whose torrent Close unmaps
// every file, and retain ownership of the supplied client storage as well.
func newManagedTorrentClient(cfg *torrent.ClientConfig) (*torrent.Client, func(), error) {
	owned := storage.NewMMap(cfg.DataDir)
	cfg.DefaultStorage = owned
	client, err := torrent.NewClient(cfg)
	if err != nil {
		_ = owned.Close()
		return nil, nil, err
	}
	var once sync.Once
	closeClient := func() {
		once.Do(func() {
			client.Close()
			if err := owned.Close(); err != nil {
				appendLog("Torrent storage cleanup failed")
			}
		})
	}
	return client, closeClient, nil
}
