package main

import "net/url"

// Canonicalize identity from the magnet itself, never the provider's claimed
// hash. Merge tracker announcements across duplicate results in stable order.
func pooledMagnets(results []ProviderSearchResult) []string {
	hashes := []string{}
	values := map[string]url.Values{}
	announcements := map[string]map[string]map[string]bool{}
	for _, result := range results {
		hash, valid := normalizedMagnetHash(result.Magnet)
		if !valid {
			continue
		}
		uri, err := url.Parse(result.Magnet)
		if err != nil {
			continue
		}
		query := uri.Query()
		if _, exists := values[hash]; !exists {
			hashes = append(hashes, hash)
			values[hash] = url.Values{"xt": []string{"urn:btih:" + hash}}
			if name := query.Get("dn"); name != "" {
				values[hash].Set("dn", name)
			}
			announcements[hash] = map[string]map[string]bool{}
		}
		// Trackers, web seeds and explicit peers are independent discovery
		// hints. Deduplicating the hash must not discard any provider's hints.
		for _, key := range []string{"tr", "ws", "x.pe"} {
			if announcements[hash][key] == nil {
				announcements[hash][key] = map[string]bool{}
			}
			for _, hint := range query[key] {
				if hint != "" && !announcements[hash][key][hint] {
					values[hash].Add(key, hint)
					announcements[hash][key][hint] = true
				}
			}
		}
	}
	magnets := make([]string, 0, len(hashes))
	for _, hash := range hashes {
		magnets = append(magnets, "magnet:?"+values[hash].Encode())
	}
	return magnets
}
