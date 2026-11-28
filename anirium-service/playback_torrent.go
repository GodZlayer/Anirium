package main

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/anacrolix/torrent"
)

var fastPublicTrackers = [][]string{
	{"udp://tracker.opentrackr.org:1337/announce"},
	{"udp://open.stealth.si:80/announce"},
	{"udp://tracker.torrent.eu.org:451/announce"},
	{"udp://exodus.desync.com:6969/announce"},
	{"http://nyaa.tracker.wf:7777/announce"},
}

// Serialize opening against generation cancellation under swarmMu. Do not
// call this while holding swarmMu; AddMagnet does not wait for metadata.
func addPlaybackTorrent(ctx context.Context, client *torrent.Client, magnet string) (*torrent.Torrent, error) {
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if client == nil {
		return nil, fmt.Errorf("torrent client unavailable")
	}
	t, err := client.AddMagnet(magnet)
	if err != nil {
		return nil, err
	}
	if !testing.Testing() && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		t.AddTrackers(fastPublicTrackers)
	}
	return t, nil
}
