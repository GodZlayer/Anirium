package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Each desktop runtime owns only the directory it created. Call cleanup after
// all torrent readers and mmap handles have closed; never sweep shared caches.
func newRuntimeTorrentCache() (string, func() error, error) {
	dir, err := os.MkdirTemp("", "anirium-torrent-runtime-")
	if err != nil {
		return "", nil, err
	}
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return "", nil, err
	}
	owner, err := json.Marshal(struct {
		PID       int       `json:"pid"`
		CreatedAt time.Time `json:"createdAt"`
	}{os.Getpid(), time.Now().UTC()})
	if err == nil {
		err = os.WriteFile(filepath.Join(absolute, "runtime-owner.json"), owner, 0600)
	}
	if err != nil {
		_ = os.Remove(absolute)
		return "", nil, err
	}
	cleanup := func() error {
		parent, pathErr := filepath.Abs(os.TempDir())
		if pathErr != nil || filepath.Dir(absolute) != parent || !strings.HasPrefix(filepath.Base(absolute), "anirium-torrent-runtime-") {
			return fmt.Errorf("torrent cache ownership invalid")
		}
		info, statErr := os.Lstat(absolute)
		if os.IsNotExist(statErr) {
			return nil
		}
		if statErr != nil {
			return statErr
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("torrent cache root replaced")
		}
		return os.RemoveAll(absolute)
	}
	return absolute, cleanup, nil
}
