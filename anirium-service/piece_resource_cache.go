package main

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/anacrolix/missinggo/v2/resource"
)

const maximumCachedResource = 64 << 20

var pieceResourceName = regexp.MustCompile(`^(completed/[a-f0-9]{40,64}|incompleted/[a-f0-9]{40,64}(/[0-9]+)?)$`)

type cachedResourceEntry struct {
	size    int64
	touched uint64
	readers int
}

// Adapter for the torrent library's resource storage. Only completed pieces
// are evicted; incomplete chunks and open readers remain protected. A single
// bounded temporary write can add at most 64MiB to the published byte budget.
type pieceResourceCache struct {
	root         string
	budget, used int64
	mu           sync.Mutex
	writes       sync.Mutex
	clock        uint64
	entries      map[string]*cachedResourceEntry
}

func newPieceResourceCache(parent string, budget int64) (*pieceResourceCache, error) {
	if budget <= 0 {
		return nil, fmt.Errorf("invalid piece cache capacity")
	}
	root, err := os.MkdirTemp(parent, "owned-pieces-")
	if err != nil {
		return nil, err
	}
	return &pieceResourceCache{root: root, budget: budget, entries: map[string]*cachedResourceEntry{}}, nil
}

func (cache *pieceResourceCache) NewInstance(name string) (resource.Instance, error) {
	if !pieceResourceName.MatchString(name) {
		return nil, fmt.Errorf("invalid piece resource")
	}
	path := filepath.Join(cache.root, filepath.FromSlash(name))
	relative, err := filepath.Rel(cache.root, path)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return nil, fmt.Errorf("piece resource outside cache")
	}
	base, err := (resource.OSFileProvider{}).NewInstance(path)
	if err != nil {
		return nil, err
	}
	return &cachedPieceResource{Instance: base, cache: cache, name: name, path: path}, nil
}

type cachedPieceResource struct {
	resource.Instance
	cache      *pieceResourceCache
	name, path string
}

func (instance *cachedPieceResource) Readdirnames() ([]string, error) {
	file, err := os.Open(instance.path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return file.Readdirnames(-1)
}

type leasedPieceReader struct {
	io.ReadCloser
	release func()
	once    sync.Once
}

func (reader *leasedPieceReader) Close() error {
	err := reader.ReadCloser.Close()
	reader.once.Do(reader.release)
	return err
}

func (instance *cachedPieceResource) Get() (io.ReadCloser, error) {
	cache := instance.cache
	cache.mu.Lock()
	defer cache.mu.Unlock()
	reader, err := os.Open(instance.path)
	if err != nil {
		return nil, err
	}
	entry := cache.entries[instance.name]
	if entry == nil {
		reader.Close()
		return nil, os.ErrNotExist
	}
	cache.clock++
	entry.touched, entry.readers = cache.clock, entry.readers+1
	return &leasedPieceReader{ReadCloser: reader, release: func() { cache.mu.Lock(); entry.readers--; cache.mu.Unlock() }}, nil
}

func (instance *cachedPieceResource) ReadAt(bytes []byte, offset int64) (int, error) {
	reader, err := instance.Get()
	if err != nil {
		return 0, err
	}
	defer reader.Close()
	file := reader.(*leasedPieceReader).ReadCloser.(*os.File)
	return file.ReadAt(bytes, offset)
}

func (instance *cachedPieceResource) Put(source io.Reader) error {
	cache := instance.cache
	cache.writes.Lock()
	defer cache.writes.Unlock()
	temporary, err := os.CreateTemp(cache.root, "pending-")
	if err != nil {
		return err
	}
	defer os.Remove(temporary.Name())
	digest := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(temporary, digest), io.LimitReader(source, maximumCachedResource+1))
	closeErr := temporary.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if size > maximumCachedResource || size > cache.budget {
		return fmt.Errorf("piece exceeds cache capacity")
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	previous := int64(0)
	if entry := cache.entries[instance.name]; entry != nil {
		// Several torrent pieces can share the same content hash and chunk
		// offset. Re-publishing identical immutable bytes must succeed even
		// while another piece is reading this shared resource.
		if entry.size == size {
			current, openErr := os.Open(instance.path)
			if openErr == nil {
				currentDigest := sha256.New()
				_, readErr := io.Copy(currentDigest, current)
				current.Close()
				if readErr == nil && string(currentDigest.Sum(nil)) == string(digest.Sum(nil)) {
					return nil
				}
			}
		}
		if entry.readers > 0 {
			return fmt.Errorf("piece is being read")
		}
		previous = entry.size
	}
	for cache.used-previous+size > cache.budget {
		name := ""
		var oldest uint64
		for candidate, entry := range cache.entries {
			if candidate == instance.name || entry.readers > 0 || !strings.HasPrefix(candidate, "completed/") {
				continue
			}
			if name == "" || entry.touched < oldest {
				name, oldest = candidate, entry.touched
			}
		}
		if name == "" {
			return fmt.Errorf("piece cache protected capacity reached")
		}
		if err := os.Remove(filepath.Join(cache.root, filepath.FromSlash(name))); err != nil && !os.IsNotExist(err) {
			return err
		}
		cache.used -= cache.entries[name].size
		delete(cache.entries, name)
	}
	if err := os.MkdirAll(filepath.Dir(instance.path), 0700); err != nil {
		return err
	}
	if err := os.Rename(temporary.Name(), instance.path); err != nil {
		return err
	}
	cache.clock++
	cache.entries[instance.name] = &cachedResourceEntry{size: size, touched: cache.clock}
	cache.used += size - previous
	return nil
}

func (instance *cachedPieceResource) WriteAt([]byte, int64) (int, error) {
	// NewResourcePieces writes whole immutable chunk resources through Put.
	return 0, fmt.Errorf("piece resources require atomic Put")
}

func (instance *cachedPieceResource) Delete() error {
	cache := instance.cache
	cache.mu.Lock()
	defer cache.mu.Unlock()
	entry := cache.entries[instance.name]
	if entry != nil && entry.readers > 0 {
		return fmt.Errorf("piece is being read")
	}
	if err := os.Remove(instance.path); err != nil && !os.IsNotExist(err) {
		return err
	}
	if entry != nil {
		cache.used -= entry.size
		delete(cache.entries, instance.name)
	}
	return nil
}
