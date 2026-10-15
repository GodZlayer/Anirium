package main

func activeTorrentHashes(sources []string) map[string]bool {
	hashes := map[string]bool{}
	for _, source := range sources {
		if hash, valid := normalizedMagnetHash(resolveMediaSource(source).Magnet); valid {
			hashes[hash] = true
		}
	}
	return hashes
}
