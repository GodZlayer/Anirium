package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"testing"
)

func TestProgressiveTorrentRangesReturnBeforeCompleteFileDownload(t *testing.T) {
	payloads := map[string][]byte{
		"Show S01E03 version-a.mkv": bytes.Repeat([]byte("a"), 2<<20),
		"Show S01E03 version-b.mkv": bytes.Repeat([]byte("b"), 2<<20),
		"Show S01E04.mkv":           []byte("excluded episode"),
	}
	// Distinct markers prove seeks return the requested region, not merely
	// repeated bytes from an incorrectly positioned torrent reader.
	for name, payload := range payloads {
		if len(payload) < 2<<20 {
			continue
		}
		for _, offset := range []int{0, 1 << 20, len(payload) - 16} {
			copy(payload[offset:offset+16], fmt.Sprintf("%08x-%s", offset, name))
		}
	}
	testLocalTorrentPeerSources(t, payloads, func(ctx context.Context, cache *mediaInputCache, ids []string) {
		for index, id := range ids {
			url, release, err := cache.acquire(ctx, id, index)
			if err != nil {
				t.Fatal(err)
			}
			defer release()
			for _, region := range []struct {
				header string
				offset int
			}{
				{"bytes=0-15", 0},
				{"bytes=1048576-1048591", 1 << 20},
				{"bytes=-16", (2 << 20) - 16},
				{"bytes=0-15", 0},
			} {
				request, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
				request.Header.Set("Range", region.header)
				response, err := http.DefaultClient.Do(request)
				if err != nil {
					t.Fatal(err)
				}
				data, readErr := io.ReadAll(response.Body)
				response.Body.Close()
				source := resolveMediaSource(id)
				if readErr != nil || response.StatusCode != 206 || !bytes.Equal(data, payloads[filepath.Base(source.FilePath)][region.offset:region.offset+16]) {
					t.Fatalf("real torrent range: %q status=%d error=%v", data, response.StatusCode, readErr)
				}
				swarmMu.RLock()
				client := torrentClient
				swarmMu.RUnlock()
				tor, err := client.AddMagnet(source.Magnet)
				if err != nil {
					t.Fatal(err)
				}
				file, err := selectSourceVideo(ctx, tor.Files(), id)
				if err != nil {
					t.Fatal(err)
				}
				if file.BytesCompleted() >= file.Length() {
					t.Fatalf("range required complete file: downloaded=%d length=%d", file.BytesCompleted(), file.Length())
				}
			}
		}
	}, newProgressiveMediaInputCache)
}
