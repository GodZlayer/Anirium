package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSwarmInventoryDeduplicatesFilesAndHidesMagnets(t *testing.T) {
	magnet := "magnet:?xt=urn:btih:" + strings.Repeat("ab", 20)
	mediaSourceMu.Lock()
	old := mediaSources
	mediaSources = map[string]mediaSource{"first": {Magnet: magnet, FilePath: "first.mkv"}, "second": {Magnet: magnet, FilePath: "second.mp4"}}
	mediaSourceMu.Unlock()
	defer func() { mediaSourceMu.Lock(); mediaSources = old; mediaSourceMu.Unlock() }()
	if hashes := activeTorrentHashes([]string{"first", "second", magnet}); len(hashes) != 1 {
		t.Fatalf("duplicate swarm count: %v", hashes)
	}
	payload, err := json.Marshal(StatsResponse{ActiveLinks: []string{magnet}, ActiveTorrents: 1})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "magnet:") || strings.Contains(string(payload), "activeLinks") {
		t.Fatal("media provider information exposed to Player")
	}
}
