package main

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const maxEpisodeStorageEntries = 3

var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

type episodeHLSRange struct {
	Quality string  `json:"quality"`
	Start   float64 `json:"start"`
	RelPath string  `json:"relPath"`
}

type episodeIndexEntry struct {
	EpisodeKey      string            `json:"episodeKey"`
	WorkID          string            `json:"workId,omitempty"`
	EpisodeID       string            `json:"episodeId,omitempty"`
	WorkTitle       string            `json:"workTitle,omitempty"`
	Season          int               `json:"season,omitempty"`
	Episode         int               `json:"episode,omitempty"`
	RelDir          string            `json:"relDir"`
	Magnets         []string          `json:"magnets,omitempty"`
	InfoHashes      []string          `json:"infoHashes,omitempty"`
	Qualities       []string          `json:"qualities,omitempty"`
	Duration        float64           `json:"duration,omitempty"`
	HLSRanges       []episodeHLSRange `json:"hlsRanges,omitempty"`
	SubtitleCount   int               `json:"subtitleCount,omitempty"`
	DownloadedBytes int64             `json:"downloadedBytes,omitempty"`
	LastAccessedAt  time.Time         `json:"lastAccessedAt"`
}

type episodeStorageManager struct {
	mu      sync.Mutex
	rootDir string
	entries map[string]*episodeIndexEntry
}

var globalEpisodeStorage = &episodeStorageManager{
	entries: map[string]*episodeIndexEntry{},
}

func slugifyFolderSegment(raw string, maxLen int) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = nonSlugChars.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "work"
	}
	if maxLen > 0 && len(s) > maxLen {
		s = strings.TrimRight(s[:maxLen], "-")
	}
	return s
}

func shortStableID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "00000000"
	}
	sum := sha1.Sum([]byte(raw))
	return hex.EncodeToString(sum[:4])
}

func episodeRelativeDir(workTitle, workID string, season, episode int, episodeID string) string {
	workSlug := slugifyFolderSegment(workTitle, 40)
	workFolder := fmt.Sprintf("%s_%s", workSlug, shortStableID(workID+workTitle))
	if season <= 0 {
		season = 1
	}
	epFolder := fmt.Sprintf("S%02dE%02d_%s", season, episode, shortStableID(episodeID+fmt.Sprintf(":%d:%d", season, episode)))
	return filepath.Join(workFolder, epFolder)
}

func (m *episodeStorageManager) init(baseDir string) {
	baseDir = strings.TrimSpace(baseDir)
	if baseDir == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rootDir = filepath.Join(baseDir, "episodes")
	_ = os.MkdirAll(m.rootDir, 0o700)
	m.entries = map[string]*episodeIndexEntry{}
	m.loadIndexLocked()
}

func (m *episodeStorageManager) indexPathLocked() string {
	if m.rootDir == "" {
		return ""
	}
	return filepath.Join(m.rootDir, "index.json")
}

func (m *episodeStorageManager) loadIndexLocked() {
	p := m.indexPathLocked()
	if p == "" {
		return
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		return
	}
	var list []*episodeIndexEntry
	if json.Unmarshal(raw, &list) != nil {
		return
	}
	for _, entry := range list {
		if entry != nil && entry.EpisodeKey != "" {
			m.entries[entry.EpisodeKey] = entry
		}
	}
}

func (m *episodeStorageManager) saveIndexLocked() {
	p := m.indexPathLocked()
	if p == "" {
		return
	}
	list := make([]*episodeIndexEntry, 0, len(m.entries))
	for _, entry := range m.entries {
		list = append(list, entry)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].LastAccessedAt.After(list[j].LastAccessedAt)
	})
	if raw, err := json.MarshalIndent(list, "", "  "); err == nil {
		_ = os.WriteFile(p, raw, 0o600)
	}
}

func (m *episodeStorageManager) ensureEpisodeDir(episodeKey, workTitle, workID string, season, episode int, episodeID string) (string, *episodeIndexEntry) {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" {
		return "", nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.rootDir == "" {
		return "", nil
	}
	now := time.Now().UTC()
	entry, ok := m.entries[episodeKey]
	if !ok {
		rel := episodeRelativeDir(workTitle, workID, season, episode, episodeID)
		entry = &episodeIndexEntry{
			EpisodeKey: episodeKey,
			WorkID:     workID,
			EpisodeID:  episodeID,
			WorkTitle:  workTitle,
			Season:     season,
			Episode:    episode,
			RelDir:     rel,
		}
		m.entries[episodeKey] = entry
	}
	entry.LastAccessedAt = now
	if workTitle != "" && entry.WorkTitle == "" {
		entry.WorkTitle = workTitle
	}
	fullDir := filepath.Join(m.rootDir, entry.RelDir)
	_ = os.MkdirAll(filepath.Join(fullDir, "subtitles"), 0o700)
	_ = os.MkdirAll(filepath.Join(fullDir, "pieces"), 0o700)
	_ = os.MkdirAll(filepath.Join(fullDir, "hls"), 0o700)

	// Enforce strict 3-episode LRU: when a 4th episode enters, remove the oldest folder.
	for len(m.entries) > maxEpisodeStorageEntries {
		var oldestKey string
		var oldestTime time.Time
		for k, e := range m.entries {
			if k == episodeKey {
				continue
			}
			if oldestKey == "" || e.LastAccessedAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = e.LastAccessedAt
			}
		}
		if oldestKey == "" {
			break
		}
		evicted := m.entries[oldestKey]
		delete(m.entries, oldestKey)
		if evicted != nil && evicted.RelDir != "" {
			evictedFull := filepath.Join(m.rootDir, evicted.RelDir)
			_ = os.RemoveAll(evictedFull)
			// Remove parent work folder if now empty.
			parent := filepath.Dir(evictedFull)
			if parent != m.rootDir {
				_ = os.Remove(parent)
			}
			appendLog(fmt.Sprintf("[EpisodeCache] EVICT oldest=%s dir=%s", oldestKey, evicted.RelDir))
		}
	}

	m.saveEpisodeGuideLocked(fullDir, entry)
	m.saveIndexLocked()
	cp := *entry
	return fullDir, &cp
}

func (m *episodeStorageManager) saveEpisodeGuideLocked(fullDir string, entry *episodeIndexEntry) {
	if fullDir == "" || entry == nil {
		return
	}
	if raw, err := json.MarshalIndent(entry, "", "  "); err == nil {
		_ = os.WriteFile(filepath.Join(fullDir, "episode.json"), raw, 0o600)
	}
}

func (m *episodeStorageManager) lookup(episodeKey string) (string, *episodeIndexEntry, bool) {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" {
		return "", nil, false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.rootDir == "" {
		return "", nil, false
	}
	entry, ok := m.entries[episodeKey]
	if !ok || entry == nil || entry.RelDir == "" {
		return "", nil, false
	}
	fullDir := filepath.Join(m.rootDir, entry.RelDir)
	if _, err := os.Stat(fullDir); err != nil {
		return "", nil, false
	}
	cp := *entry
	return fullDir, &cp, true
}

func (m *episodeStorageManager) recordMagnets(episodeKey, workTitle, workID string, season, episode int, episodeID string, magnets []string) {
	if len(magnets) == 0 {
		return
	}
	fullDir, _ := m.ensureEpisodeDir(episodeKey, workTitle, workID, season, episode, episodeID)
	if fullDir == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if entry, ok := m.entries[episodeKey]; ok && entry != nil {
		entry.Magnets = append([]string(nil), magnets...)
		entry.LastAccessedAt = time.Now().UTC()
		m.saveEpisodeGuideLocked(fullDir, entry)
		m.saveIndexLocked()
	}
}

func (m *episodeStorageManager) saveSubtitle(episodeKey string, block persistedSubtitleBlock) {
	episodeKey = strings.TrimSpace(episodeKey)
	if episodeKey == "" || strings.TrimSpace(block.VTT) == "" || strings.TrimSpace(block.TrackID) == "" {
		return
	}
	fullDir, _, ok := m.lookup(episodeKey)
	if !ok {
		return
	}
	subsDir := filepath.Join(fullDir, "subtitles")
	_ = os.MkdirAll(subsDir, 0o700)
	keySum := sha1.Sum([]byte(fmt.Sprintf("%s|%.0f|%.0f|%t", block.TrackID, block.Start, block.End, block.Complete)))
	filePath := filepath.Join(subsDir, hex.EncodeToString(keySum[:12])+".json")
	if raw, err := json.Marshal(block); err == nil {
		if os.WriteFile(filePath, raw, 0o600) == nil {
			m.mu.Lock()
			if entry, exists := m.entries[episodeKey]; exists && entry != nil {
				if entries, err := os.ReadDir(subsDir); err == nil {
					entry.SubtitleCount = len(entries)
				}
				m.saveEpisodeGuideLocked(fullDir, entry)
				m.saveIndexLocked()
			}
			m.mu.Unlock()
		}
	}
}

func (m *episodeStorageManager) loadSubtitles(episodeKey string) []persistedSubtitleBlock {
	fullDir, _, ok := m.lookup(episodeKey)
	if !ok {
		return nil
	}
	subsDir := filepath.Join(fullDir, "subtitles")
	entries, err := os.ReadDir(subsDir)
	if err != nil {
		return nil
	}
	blocks := make([]persistedSubtitleBlock, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(subsDir, e.Name()))
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

func (m *episodeStorageManager) hlsWindowDir(episodeKey, quality string, start float64) string {
	fullDir, _, ok := m.lookup(episodeKey)
	if !ok {
		return ""
	}
	q := slugifyFolderSegment(quality, 16)
	winDir := filepath.Join(fullDir, "hls", fmt.Sprintf("%s_%d", q, int(start)))
	_ = os.MkdirAll(winDir, 0o700)
	return winDir
}

func (m *episodeStorageManager) hasLocalHLSWindow(episodeKey, quality string, start float64) (string, bool) {
	fullDir, _, ok := m.lookup(episodeKey)
	if !ok {
		return "", false
	}
	q := slugifyFolderSegment(quality, 16)
	winDir := filepath.Join(fullDir, "hls", fmt.Sprintf("%s_%d", q, int(start)))
	playlist := filepath.Join(winDir, "index.m3u8")
	info, err := os.Stat(playlist)
	if err != nil || info.Size() < 32 {
		return "", false
	}
	entries, err := os.ReadDir(winDir)
	if err != nil {
		return "", false
	}
	for _, e := range entries {
		if !e.IsDir() && (strings.HasSuffix(e.Name(), ".ts") || strings.HasSuffix(e.Name(), ".m4s")) {
			return winDir, true
		}
	}
	return "", false
}

func (m *episodeStorageManager) recordLocalHLSWindow(episodeKey, quality string, start float64, duration float64) {
	fullDir, _, ok := m.lookup(episodeKey)
	if !ok {
		return
	}
	q := slugifyFolderSegment(quality, 16)
	relPath := filepath.Join("hls", fmt.Sprintf("%s_%d", q, int(start)))
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, exists := m.entries[episodeKey]
	if !exists || entry == nil {
		return
	}
	if duration > 0 && entry.Duration <= 0 {
		entry.Duration = duration
	}
	if quality != "" && !containsString(entry.Qualities, quality) {
		entry.Qualities = append(entry.Qualities, quality)
	}
	found := false
	for _, r := range entry.HLSRanges {
		if r.Quality == quality && int(r.Start) == int(start) {
			found = true
			break
		}
	}
	if !found {
		entry.HLSRanges = append(entry.HLSRanges, episodeHLSRange{Quality: quality, Start: start, RelPath: relPath})
	}
	entry.LastAccessedAt = time.Now().UTC()
	m.saveEpisodeGuideLocked(fullDir, entry)
	m.saveIndexLocked()
}

func cleanupLegacyTempWindows() {
	tmpDir := os.TempDir()
	entries, err := os.ReadDir(tmpDir)
	if err != nil {
		return
	}
	removed := 0
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "anirium-window-") {
			if os.RemoveAll(filepath.Join(tmpDir, e.Name())) == nil {
				removed++
			}
		}
	}
	if removed > 0 {
		appendLog(fmt.Sprintf("[EpisodeCache] Cleaned %d legacy anirium-window-* temp directories", removed))
	}
}

func cleanupLegacyOwnedPieceDirs(torrentCacheDir string) {
	if strings.TrimSpace(torrentCacheDir) == "" {
		return
	}
	entries, err := os.ReadDir(torrentCacheDir)
	if err != nil {
		return
	}
	removed := 0
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "owned-pieces-") {
			if os.RemoveAll(filepath.Join(torrentCacheDir, e.Name())) == nil {
				removed++
			}
		}
	}
	if removed > 0 {
		appendLog(fmt.Sprintf("[EpisodeCache] Cleaned %d legacy owned-pieces-* directories", removed))
	}
}
