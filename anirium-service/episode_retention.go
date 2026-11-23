package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const retentionSubsequentThreshold = 3

type episodeRetentionEntry struct {
	EpisodeKey        string    `json:"episodeKey"`
	InfoHashes        []string  `json:"infoHashes,omitempty"`
	Completed         bool      `json:"completed"`
	CompletedAt       time.Time `json:"completedAt,omitempty"`
	SubsequentWatches []string  `json:"subsequentWatches,omitempty"`
	LastAccessedAt    time.Time `json:"lastAccessedAt"`
}

type episodeRetentionStore struct {
	mu      sync.Mutex
	path    string
	entries map[string]*episodeRetentionEntry
}

var globalEpisodeRetention = newEpisodeRetentionStore("")

func newEpisodeRetentionStore(cacheDir string) *episodeRetentionStore {
	s := &episodeRetentionStore{
		entries: map[string]*episodeRetentionEntry{},
	}
	if strings.TrimSpace(cacheDir) != "" {
		s.path = filepath.Join(cacheDir, "episodes-retention.json")
		s.loadLocked()
	}
	return s
}

func (s *episodeRetentionStore) initDir(cacheDir string) {
	if strings.TrimSpace(cacheDir) == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.path = filepath.Join(cacheDir, "episodes-retention.json")
	s.entries = map[string]*episodeRetentionEntry{}
	s.loadLocked()
}

func (s *episodeRetentionStore) loadLocked() {
	if s.path == "" {
		return
	}
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var list []*episodeRetentionEntry
	if err := json.Unmarshal(raw, &list); err != nil {
		return
	}
	for _, entry := range list {
		if entry != nil && entry.EpisodeKey != "" {
			s.entries[entry.EpisodeKey] = entry
		}
	}
}

func (s *episodeRetentionStore) saveLocked() {
	if s.path == "" {
		return
	}
	list := make([]*episodeRetentionEntry, 0, len(s.entries))
	for _, entry := range s.entries {
		list = append(list, entry)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.path, data, 0o600)
}

func appendUniqueString(slice []string, value string) []string {
	if value == "" {
		return slice
	}
	for _, item := range slice {
		if item == value {
			return slice
		}
	}
	return append(slice, value)
}

// recordAccess registers an active episode + torrent infoHash and returns any
// infoHashes that belong exclusively to completed episodes now eligible for
// eviction (watched completely + at least 2 different subsequent episodes).
func (s *episodeRetentionStore) recordAccess(episodeKey, infoHash string) []string {
	episodeKey = strings.TrimSpace(episodeKey)
	infoHash = strings.ToLower(strings.TrimSpace(infoHash))
	if episodeKey == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	entry, ok := s.entries[episodeKey]
	if !ok {
		entry = &episodeRetentionEntry{EpisodeKey: episodeKey}
		s.entries[episodeKey] = entry
	}
	entry.LastAccessedAt = now
	if infoHash != "" {
		entry.InfoHashes = appendUniqueString(entry.InfoHashes, infoHash)
	}

	// Increment subsequent watch counter for every OTHER completed episode.
	evictKeys := []string{}
	for key, other := range s.entries {
		if key == episodeKey || !other.Completed {
			continue
		}
		other.SubsequentWatches = appendUniqueString(other.SubsequentWatches, episodeKey)
		if len(other.SubsequentWatches) >= retentionSubsequentThreshold {
			evictKeys = append(evictKeys, key)
		}
	}

	if len(evictKeys) == 0 {
		s.saveLocked()
		return nil
	}

	evictedHashes := []string{}
	for _, key := range evictKeys {
		evictedHashes = append(evictedHashes, s.entries[key].InfoHashes...)
		delete(s.entries, key)
	}

	// Keep any hash still referenced by a retained episode.
	retained := map[string]bool{}
	for _, other := range s.entries {
		for _, h := range other.InfoHashes {
			retained[h] = true
		}
	}

	dropHashes := []string{}
	seen := map[string]bool{}
	for _, h := range evictedHashes {
		if h == "" || retained[h] || seen[h] {
			continue
		}
		seen[h] = true
		dropHashes = append(dropHashes, h)
	}

	s.saveLocked()
	return dropHashes
}

func (s *episodeRetentionStore) markCompleted(episodeKey string) {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	entry, ok := s.entries[episodeKey]
	if !ok {
		entry = &episodeRetentionEntry{EpisodeKey: episodeKey}
		s.entries[episodeKey] = entry
	}
	if !entry.Completed {
		entry.Completed = true
		entry.CompletedAt = now
	}
	entry.LastAccessedAt = now
	s.saveLocked()
}

func dropRetainedHashes(hashes []string) {
	if len(hashes) == 0 {
		return
	}
	swarmMu.RLock()
	client := torrentClient
	swarmMu.RUnlock()
	if client == nil {
		return
	}
	want := map[string]bool{}
	for _, h := range hashes {
		want[strings.ToLower(strings.TrimSpace(h))] = true
	}
	for _, tor := range client.Torrents() {
		if want[strings.ToLower(tor.InfoHash().HexString())] {
			tor.Drop()
		}
	}
}
