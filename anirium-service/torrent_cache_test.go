package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRuntimeTorrentCacheOnlyRetiresOwnedFiles(t *testing.T) {
	first, closeFirst, err := newRuntimeTorrentCache()
	if err != nil {
		t.Fatal(err)
	}
	defer closeFirst()
	second, closeSecond, err := newRuntimeTorrentCache()
	if err != nil {
		t.Fatal(err)
	}
	defer closeSecond()
	if first == second {
		t.Fatal("runtimes share raw torrent cache")
	}
	for _, dir := range []string{first, second} {
		ownerBytes, err := os.ReadFile(filepath.Join(dir, "runtime-owner.json"))
		if err != nil {
			t.Fatal(err)
		}
		var owner struct {
			PID       int       `json:"pid"`
			CreatedAt time.Time `json:"createdAt"`
		}
		if err := json.Unmarshal(ownerBytes, &owner); err != nil || owner.PID != os.Getpid() || owner.CreatedAt.IsZero() {
			t.Fatal("cache ownership is not attributable to its actual runtime")
		}
		if err := os.WriteFile(filepath.Join(dir, "piece"), []byte("owned"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := closeFirst(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(first); !os.IsNotExist(err) {
		t.Fatal("retired cache still exists")
	}
	if _, err := os.Stat(filepath.Join(second, "piece")); err != nil {
		t.Fatal("another runtime cache changed")
	}
	if err := closeFirst(); err != nil {
		t.Fatal("repeated retirement failed", err)
	}
}
