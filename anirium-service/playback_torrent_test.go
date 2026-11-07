package main

import (
	"context"
	"errors"
	"testing"
)

func TestCanceledPlaybackCannotOpenTorrent(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if item, err := addPlaybackTorrent(ctx, nil, "magnet:?xt=urn:btih:0123456789012345678901234567890123456789"); item != nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled playback attempted torrent access: %v %v", item, err)
	}
}
