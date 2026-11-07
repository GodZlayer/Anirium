package main

import (
	"context"
	"fmt"

	"github.com/anacrolix/torrent"
)

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
	return client.AddMagnet(magnet)
}
