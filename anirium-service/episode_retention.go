package main

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const retentionSubsequentThreshold = 3

type persistedSubtitleBlock struct {
	TrackID  string  `json:"trackId"`
	Language string  `json:"language"`
	Title    string  `json:"title,omitempty"`
	Start    float64 `json:"start"`
	End      float64 `json:"end"`
	Complete bool    `json:"complete,omitempty"`
	VTT      string  `json:"vtt"`
}

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

	// Enforce strict 3-episode LRU: when a 4th episode is accessed, evict the oldest.
	for len(s.entries)-len(evictKeys) > retentionSubsequentThreshold {
		var oldestKey string
		var oldestTime time.Time
		evictSet := map[string]bool{}
		for _, k := range evictKeys {
			evictSet[k] = true
		}
		for key, other := range s.entries {
			if key == episodeKey || evictSet[key] {
				continue
			}
			if oldestKey == "" || other.LastAccessedAt.Before(oldestTime) {
				oldestKey = key
				oldestTime = other.LastAccessedAt
			}
		}
		if oldestKey == "" {
			break
		}
		evictKeys = append(evictKeys, oldestKey)
	}

	if len(evictKeys) == 0 {
		s.saveLocked()
		return nil
	}

	evictedHashes := []string{}
	for _, key := range evictKeys {
		evictedHashes = append(evictedHashes, s.entries[key].InfoHashes...)
		delete(s.entries, key)
		s.removeEpisodeCacheDirLocked(key)
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

func episodeRetentionKeyFor(identity catalogPlaybackIdentity, season, episode int) string {
	if id := strings.TrimSpace(identity.EpisodeID); id != "" {
		return "ep:" + id
	}
	if wid := strings.TrimSpace(identity.WorkID); wid != "" {
		return fmt.Sprintf("work:%s:s%de%d", wid, season, episode)
	}
	return ""
}

func currentEpisodeRetentionKey() string {
	swarmMu.RLock()
	id := currentCatalogIdentity
	ep := requestedEpisode
	swarmMu.RUnlock()
	return episodeRetentionKeyFor(id, ep.Season, ep.Episode)
}

func (s *episodeRetentionStore) episodeCacheDirLocked(episodeKey string) string {
	if s.path == "" || strings.TrimSpace(episodeKey) == "" {
		return ""
	}
	sum := sha1.Sum([]byte(strings.TrimSpace(episodeKey)))
	return filepath.Join(filepath.Dir(s.path), "episode-cache", hex.EncodeToString(sum[:12]))
}

func (s *episodeRetentionStore) removeEpisodeCacheDirLocked(episodeKey string) {
	dir := s.episodeCacheDirLocked(episodeKey)
	if dir != "" {
		_ = os.RemoveAll(dir)
	}
}

type persistedEpisodeMeta struct {
	EpisodeKey string   `json:"episodeKey"`
	Magnets    []string `json:"magnets"`
}

func (s *episodeRetentionStore) saveEpisodeMagnets(episodeKey string, magnets []string) {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" || len(magnets) == 0 {
		return
	}
	s.mu.Lock()
	dir := s.episodeCacheDirLocked(episodeKey)
	s.mu.Unlock()
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return
	}
	if raw, err := json.Marshal(persistedEpisodeMeta{EpisodeKey: episodeKey, Magnets: magnets}); err == nil {
		_ = os.WriteFile(filepath.Join(dir, "meta.json"), raw, 0o600)
	}
}

func (s *episodeRetentionStore) loadEpisodeMagnets(episodeKey string) []string {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" {
		return nil
	}
	s.mu.Lock()
	dir := s.episodeCacheDirLocked(episodeKey)
	s.mu.Unlock()
	if dir == "" {
		return nil
	}
	raw, err := os.ReadFile(filepath.Join(dir, "meta.json"))
	if err != nil {
		return nil
	}
	var meta persistedEpisodeMeta
	if json.Unmarshal(raw, &meta) != nil || len(meta.Magnets) == 0 {
		return nil
	}
	return meta.Magnets
}

func (s *episodeRetentionStore) saveEpisodeSubtitle(episodeKey string, block persistedSubtitleBlock) {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" || strings.TrimSpace(block.VTT) == "" || strings.TrimSpace(block.TrackID) == "" {
		return
	}
	s.mu.Lock()
	dir := s.episodeCacheDirLocked(episodeKey)
	s.mu.Unlock()
	if dir == "" {
		return
	}
	subsDir := filepath.Join(dir, "subs")
	if err := os.MkdirAll(subsDir, 0o700); err != nil {
		return
	}
	keySum := sha1.Sum([]byte(fmt.Sprintf("%s|%.0f|%.0f|%t", block.TrackID, block.Start, block.End, block.Complete)))
	filePath := filepath.Join(subsDir, hex.EncodeToString(keySum[:12])+".json")
	if raw, err := json.Marshal(block); err == nil {
		_ = os.WriteFile(filePath, raw, 0o600)
	}
}

func (s *episodeRetentionStore) loadEpisodeSubtitles(episodeKey string) []persistedSubtitleBlock {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" {
		return nil
	}
	s.mu.Lock()
	dir := s.episodeCacheDirLocked(episodeKey)
	s.mu.Unlock()
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(filepath.Join(dir, "subs"))
	if err != nil {
		return nil
	}
	blocks := make([]persistedSubtitleBlock, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, "subs", entry.Name()))
		if err != nil {
			continue
		}
		var block persistedSubtitleBlock
		if json.Unmarshal(raw, &block) == nil && block.VTT != "" && block.TrackID != "" {
			blocks = append(blocks, block)
		}
	}
	sort.Slice(blocks, func(i, j int) bool {
		if blocks[i].TrackID != blocks[j].TrackID {
			return blocks[i].TrackID < blocks[j].TrackID
		}
		return blocks[i].Start < blocks[j].Start
	})
	return blocks
}
