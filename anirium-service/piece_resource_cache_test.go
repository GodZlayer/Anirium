package main

import (
	"context"
	"crypto/sha1"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	g "github.com/anacrolix/generics"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
)

func TestNativePieceStorageRepublishesEvictedPiece(t *testing.T) {
	cache, err := newPieceResourceCache(t.TempDir(), 12)
	if err != nil {
		t.Fatal(err)
	}
	capacity := func() (int64, bool) { return 8, true }
	backend := storage.NewResourcePiecesOpts(cache, storage.ResourcePiecesOpts{Capacity: &capacity})
	payloads := []string{"aaaa", "bbbb", "cccc"}
	info := &metainfo.Info{Name: "cache-fixture", PieceLength: 4, Length: 12}
	for _, payload := range payloads {
		hash := sha1.Sum([]byte(payload))
		info.Pieces = append(info.Pieces, hash[:]...)
	}
	owned, err := backend.OpenTorrent(context.Background(), info, metainfo.Hash{})
	if err != nil {
		t.Fatal(err)
	}
	defer owned.Close()
	pieces := make([]storage.PieceImpl, len(payloads))
	for index, payload := range payloads {
		hash := sha1.Sum([]byte(payload))
		pieces[index] = owned.PieceWithHash(info.Piece(index), g.Some(hash[:]))
		if _, err := pieces[index].WriteAt([]byte(payload), 0); err != nil {
			t.Fatal(err)
		}
		if err := pieces[index].MarkComplete(); err != nil {
			t.Fatal(err)
		}
		if !pieces[index].Completion().Complete {
			t.Fatal("written piece not published")
		}
	}
	if pieces[0].Completion().Complete {
		t.Fatal("evicted piece still advertised as complete")
	}
	bytes := make([]byte, 4)
	if _, err := pieces[0].ReadAt(bytes, 0); err == nil {
		t.Fatal("evicted piece returned stale content")
	}
	if _, err := pieces[0].WriteAt([]byte(payloads[0]), 0); err != nil {
		t.Fatal(err)
	}
	if err := pieces[0].MarkComplete(); err != nil {
		t.Fatal(err)
	}
	if _, err := pieces[0].ReadAt(bytes, 0); err != nil || string(bytes) != payloads[0] {
		t.Fatal("republished piece did not recover original bytes")
	}
	if cache.used > cache.budget {
		t.Fatal("native storage exceeded resource budget")
	}
}

func TestPieceCacheEvictsCompletedLRUButProtectsOpenReader(t *testing.T) {
	cache, err := newPieceResourceCache(t.TempDir(), 8)
	if err != nil {
		t.Fatal(err)
	}
	makeResource := func(label string) *cachedPieceResource {
		value, err := cache.NewInstance("completed/" + strings.Repeat(label, 40))
		if err != nil {
			t.Fatal(err)
		}
		return value.(*cachedPieceResource)
	}
	a, b, c := makeResource("a"), makeResource("b"), makeResource("c")
	if err := a.Put(strings.NewReader("aaaa")); err != nil {
		t.Fatal(err)
	}
	if err := b.Put(strings.NewReader("bbbb")); err != nil {
		t.Fatal(err)
	}
	reader, err := a.Get()
	if err != nil {
		t.Fatal(err)
	}
	if err := a.Put(strings.NewReader("aaaa")); err != nil {
		t.Fatal("identical shared piece publication rejected during reading", err)
	}
	if err := c.Put(strings.NewReader("cccc")); err != nil {
		t.Fatal(err)
	}
	if _, err := b.Stat(); !os.IsNotExist(err) {
		t.Fatal("older unleased piece survived cache pressure")
	}
	actual, err := io.ReadAll(reader)
	if err != nil || string(actual) != "aaaa" {
		t.Fatal("eviction invalidated an open reader")
	}
	if err := a.Delete(); err == nil {
		t.Fatal("open piece was deleted")
	}
	reader.Close()
	reader.Close() // A lease must be released only once.
	d := makeResource("d")
	if err := d.Put(strings.NewReader("dddd")); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Stat(); !os.IsNotExist(err) {
		t.Fatal("released least-recently-used piece was not evicted")
	}
	var bytes int64
	err = filepath.WalkDir(cache.root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			bytes += info.Size()
		}
		return nil
	})
	if err != nil || bytes != 8 || cache.used != 8 {
		t.Fatalf("physical cache budget: disk=%d tracked=%d err=%v", bytes, cache.used, err)
	}
}

func TestPieceCachePreservesIncompleteDataAndRejectsEscapingPaths(t *testing.T) {
	cache, err := newPieceResourceCache(t.TempDir(), 8)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"../outside", "/outside", "completed/../../outside", "completed/not-a-hash"} {
		if _, err := cache.NewInstance(name); err == nil {
			t.Fatal("unsafe resource accepted")
		}
	}
	partial, _ := cache.NewInstance("incompleted/" + strings.Repeat("a", 40) + "/0")
	if err := partial.Put(strings.NewReader("12345678")); err != nil {
		t.Fatal(err)
	}
	other, _ := cache.NewInstance("completed/" + strings.Repeat("b", 40))
	if err := other.Put(strings.NewReader("abcdefgh")); err == nil {
		t.Fatal("protected incomplete capacity was exceeded")
	}
	data := make([]byte, 8)
	if _, err := partial.ReadAt(data, 0); err != nil || string(data) != "12345678" {
		t.Fatal("cache pressure discarded incomplete data")
	}
	if err := partial.Delete(); err != nil {
		t.Fatal(err)
	}
	if err := other.Put(strings.NewReader("abcdefgh")); err != nil {
		t.Fatal(err)
	}
	if err := other.Put(strings.NewReader("too large")); err == nil {
		t.Fatal("oversized resource accepted")
	}
}
