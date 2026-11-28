package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

var (
	probeCacheMu     sync.Mutex
	probeCacheLoaded bool
	probeCacheMap    = map[string]ffprobeOutput{}
)

const maxProbeCacheEntries = 2000

func probeCachePath() string {
	if testing.Testing() || os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		return ""
	}
	base, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(base) == "" {
		return ""
	}
	dir := filepath.Join(base, "Anirium", "data")
	_ = os.MkdirAll(dir, 0o700)
	return filepath.Join(dir, "probe-cache.json")
}

func probeCacheKey(infoHash, filePath string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(infoHash)) + "|" + strings.TrimSpace(filePath)))
	return hex.EncodeToString(sum[:16])
}

func loadProbeCacheLocked() {
	if probeCacheLoaded {
		return
	}
	probeCacheLoaded = true
	path := probeCachePath()
	if path == "" {
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil || len(raw) == 0 {
		return
	}
	var parsed map[string]ffprobeOutput
	if err := json.Unmarshal(raw, &parsed); err == nil && parsed != nil {
		probeCacheMap = parsed
	}
}

func readProbeCache(infoHash, filePath string) (ffprobeOutput, bool) {
	if strings.TrimSpace(infoHash) == "" || strings.TrimSpace(filePath) == "" {
		return ffprobeOutput{}, false
	}
	key := probeCacheKey(infoHash, filePath)
	probeCacheMu.Lock()
	defer probeCacheMu.Unlock()
	loadProbeCacheLocked()
	out, ok := probeCacheMap[key]
	return out, ok && len(out.Streams) > 0
}

func writeProbeCache(infoHash, filePath string, out ffprobeOutput) {
	if strings.TrimSpace(infoHash) == "" || strings.TrimSpace(filePath) == "" || len(out.Streams) == 0 {
		return
	}
	key := probeCacheKey(infoHash, filePath)
	probeCacheMu.Lock()
	loadProbeCacheLocked()
	if len(probeCacheMap) >= maxProbeCacheEntries {
		// Evict one arbitrary entry to keep cache bounded
		for k := range probeCacheMap {
			delete(probeCacheMap, k)
			break
		}
	}
	probeCacheMap[key] = out
	snapshot, err := json.Marshal(probeCacheMap)
	probeCacheMu.Unlock()

	if err != nil {
		return
	}
	if path := probeCachePath(); path != "" {
		_ = os.WriteFile(path, snapshot, 0o600)
	}
}
