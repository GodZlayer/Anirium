package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
)

func TestPieceCacheRedownloadsEvictedDataFromPeer(t *testing.T) {
	const pieceSize = 16 << 10
	payload := make([]byte, pieceSize*12)
	for i := range payload {
		payload[i] = byte(i/pieceSize*17 + i%251)
	}
	seedDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(seedDir, "fixture.bin"), payload, 0600); err != nil {
		t.Fatal(err)
	}
	info := metainfo.Info{PieceLength: pieceSize}
	if err := info.BuildFromFilePath(filepath.Join(seedDir, "fixture.bin")); err != nil {
		t.Fatal(err)
	}
	encoded, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	mi := metainfo.MetaInfo{InfoBytes: encoded}
	config := func() *torrent.ClientConfig {
		cfg := torrent.NewDefaultClientConfig()
		cfg.NoDHT = true
		cfg.DisableTrackers = true
		cfg.DisablePEX = true
		cfg.DisableUTP = true
		cfg.DisableIPv6 = true
		cfg.NoDefaultPortForwarding = true
		cfg.ListenPort = 0
		cfg.ListenHost = func(string) string { return "127.0.0.1" }
		cfg.DropMutuallyCompletePeers = false
		return cfg
	}
	seedCfg := config()
	seedCfg.DataDir = seedDir
	seedCfg.Seed = true
	seed, closeSeed, err := newManagedTorrentClient(seedCfg)
	if err != nil {
		t.Fatal(err)
	}
	defer closeSeed()
	seeded, err := seed.AddTorrent(&mi)
	if err != nil {
		t.Fatal(err)
	}
	seeded.VerifyData()
	select {
	case <-seeded.Complete().On():
	case <-time.After(15 * time.Second):
		t.Fatal("seed verification timed out")
	}
	cache, err := newPieceResourceCache(t.TempDir(), pieceSize*4)
	if err != nil {
		t.Fatal(err)
	}
	capacity := func() (int64, bool) { return pieceSize * 2, true }
	cfg := config()
	cfg.DefaultStorage = storage.NewResourcePiecesOpts(cache, storage.ResourcePiecesOpts{Capacity: &capacity})
	client, err := torrent.NewClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	downloaded, err := client.AddTorrent(&mi)
	if err != nil {
		t.Fatal(err)
	}
	downloaded.AddClientPeer(seed)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reader := downloaded.NewReader()
	defer reader.Close()
	reader.SetContext(ctx)
	reader.SetReadahead(pieceSize)
	readPiece := func(index int) {
		t.Helper()
		if _, err := reader.Seek(int64(index*pieceSize), io.SeekStart); err != nil {
			t.Fatal(err)
		}
		got := make([]byte, pieceSize)
		if _, err := io.ReadFull(reader, got); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, payload[index*pieceSize:(index+1)*pieceSize]) {
			t.Fatal("peer bytes differ")
		}
	}
	for i := 0; i < 12; i++ {
		readPiece(i)
	}
	hash := info.Pieces[:20]
	first, err := cache.NewInstance("completed/" + metainfo.Hash(hash).HexString())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := first.Stat(); !os.IsNotExist(err) {
		t.Fatal("first piece was not evicted")
	}
	readPiece(0)
	cache.mu.Lock()
	used := cache.used
	cache.mu.Unlock()
	if used > cache.budget {
		t.Fatalf("cache exceeded budget: %d", used)
	}
	cancel()
	finished := make(chan error, 1)
	go func() { _, err := reader.Read(make([]byte, 1)); finished <- err }()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("canceled capped reader: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("capped reader retried after cancellation")
	}
}
