package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"net/url"
	"path/filepath"
	"time"

	"github.com/anacrolix/torrent"
)

const openSubtitlesHashChunk = 65536

// computeOpenSubtitlesHash implements the standard OpenSubtitles moviehash:
// uint64(size) + sum of little-endian uint64s in the first and last 64 KiB.
func computeOpenSubtitlesHash(r io.ReaderAt, size int64) (string, error) {
	if r == nil || size < openSubtitlesHashChunk {
		return "", fmt.Errorf("file too small for opensubtitles hash")
	}
	buf := make([]byte, openSubtitlesHashChunk)
	hash := uint64(size)

	if _, err := r.ReadAt(buf, 0); err != nil && err != io.EOF {
		return "", err
	}
	for i := 0; i < openSubtitlesHashChunk; i += 8 {
		hash += binary.LittleEndian.Uint64(buf[i : i+8])
	}

	if _, err := r.ReadAt(buf, size-openSubtitlesHashChunk); err != nil && err != io.EOF {
		return "", err
	}
	for i := 0; i < openSubtitlesHashChunk; i += 8 {
		hash += binary.LittleEndian.Uint64(buf[i : i+8])
	}

	return fmt.Sprintf("%016x", hash), nil
}

type torrentFileReaderAt struct {
	ctx  context.Context
	file *torrent.File
}

func (t torrentFileReaderAt) ReadAt(p []byte, off int64) (int, error) {
	r := t.file.NewReader()
	defer r.Close()
	r.SetContext(t.ctx)
	r.SetReadahead(int64(len(p)))
	if _, err := r.Seek(off, io.SeekStart); err != nil {
		return 0, err
	}
	return io.ReadFull(r, p)
}

func enrichSubtitlesByVideoHash(parent context.Context, generation uint64, source string, input PlaybackPrepareRequest, subtitleCache *mediaInputCache) {
	if parent == nil || source == "" {
		return
	}
	seqPumpMu.Lock()
	file := seqRegistered[source]
	seqPumpMu.Unlock()
	if file == nil || file.Length() < openSubtitlesHashChunk {
		return
	}

	hashCtx, cancel := context.WithTimeout(parent, 12*time.Second)
	defer cancel()

	videoHash, err := computeOpenSubtitlesHash(torrentFileReaderAt{ctx: hashCtx, file: file}, file.Length())
	if err != nil || videoHash == "" {
		return
	}

	hashQuery := input
	hashQuery.VideoHash = videoHash
	hashQuery.VideoSize = file.Length()
	hashQuery.Filename = filepath.Base(file.DisplayPath())
	if hashQuery.ManifestSnapshots == nil {
		hashQuery.ManifestSnapshots = newProviderSnapshotStore()
	}

	providerMu.RLock()
	servers := append([]ProviderServer(nil), providerServers...)
	providerMu.RUnlock()
	var discovered []ProviderSubtitle
	seen := map[string]bool{}
	for _, server := range servers {
		if hashCtx.Err() != nil {
			break
		}
		if !server.Enabled || !containsString(hashQuery.AuthorizedAddonIDs, server.ID) {
			continue
		}
		if isSubtitleQueryProviderURL(server.ManifestURL) || isRSSProviderURL(server.ManifestURL) {
			continue
		}
		base, parseErr := url.Parse(server.ManifestURL)
		if parseErr != nil || !sameProviderOrigin(base, base) {
			continue
		}
		manifest, snapshotStatus := hashQuery.ManifestSnapshots.manifest(hashCtx, server)
		if snapshotStatus != "ok" || !manifestIdentityAcceptsServer(server, manifest) {
			continue
		}
		if !supportsStremioSubtitleResource(manifest, "movie", "tt0000000") && !supportsStremioSubtitleResource(manifest, "series", "tt0:1:1") {
			continue
		}
		subs, statusCode := searchStremioSubtitlesWithStatus(hashCtx, base, hashQuery)
		appendLog(fmt.Sprintf("Subtitle videoHash lookup hash=%s size=%d candidates=%d status=%d", videoHash, hashQuery.VideoSize, len(subs), statusCode))
		for _, sub := range subs {
			if !seen[sub.URL] {
				seen[sub.URL] = true
				discovered = append(discovered, sub)
			}
		}
	}
	if len(discovered) == 0 {
		return
	}

	swarmMu.Lock()
	if generation != playbackGeneration {
		swarmMu.Unlock()
		return
	}
	existing := map[string]bool{}
	for _, s := range externalSubtitles {
		existing[s.URL] = true
	}
	added := 0
	for _, s := range discovered {
		if !existing[s.URL] {
			existing[s.URL] = true
			externalSubtitles = append(externalSubtitles, s)
			added++
		}
	}
	var catalog []SubtitleTrack
	if added > 0 {
		catalog = subtitleTracksLocked()
	}
	swarmMu.Unlock()

	if added > 0 {
		if subtitleCache != nil {
			subtitleCache.bundle().startExtras(catalog)
		}
		broadcastWSEvent("manifest", buildCurrentManifest())
	}
}
