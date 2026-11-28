package main

import (
	"context"
	"strings"
	"sync"
	"time"
)

func providerTimeout(server ProviderServer) time.Duration {
	if server.TimeoutMS <= 0 {
		return 30 * time.Second
	}
	if server.TimeoutMS < 100 {
		return 100 * time.Millisecond
	}
	if server.TimeoutMS > 30000 {
		return 30 * time.Second
	}
	return time.Duration(server.TimeoutMS) * time.Millisecond
}

// Limit active network workers without dropping authorized providers. Preserve
// configured order so repeated searches do not reorder subtitle alternatives.
func parallelProviderSearch[T any](query PlaybackPrepareRequest, parents []context.Context, search func(PlaybackPrepareRequest, context.Context, []ProviderServer) []T) []T {
	return parallelProviderSearchWithGrace(query, parents, 1800*time.Millisecond, search)
}

func parallelProviderSearchWithGrace[T any](query PlaybackPrepareRequest, parents []context.Context, graceDelay time.Duration, search func(PlaybackPrepareRequest, context.Context, []ProviderServer) []T) []T {
	parent := context.Background()
	if len(parents) > 0 {
		parent = parents[0]
	}
	searchCtx, cancelSearch := context.WithCancel(parent)
	defer cancelSearch()

	providerMu.RLock()
	servers := append([]ProviderServer(nil), providerServers...)
	providerMu.RUnlock()
	servers = mergeAccountProviderServers(servers, query.AccountProviderServers)
	results := make([][]T, len(servers))
	slots := make(chan struct{}, 12)
	var workers sync.WaitGroup
	for index, server := range servers {
		if !server.Enabled || !containsString(query.AuthorizedAddonIDs, server.ID) {
			continue
		}
		workers.Add(1)
		go func(index int, server ProviderServer) {
			defer workers.Done()
			select {
			case slots <- struct{}{}:
			case <-searchCtx.Done():
				return
			}
			defer func() { <-slots }()
			ctx, cancel := context.WithTimeout(searchCtx, providerTimeout(server))
			defer cancel()
			results[index] = search(query, ctx, []ProviderServer{server})
		}(index, server)
	}
	workers.Wait()
	flattened := []T{}
	for _, result := range results {
		flattened = append(flattened, result...)
	}
	return flattened
}

func searchProviderServers(query PlaybackPrepareRequest, parents ...context.Context) []ProviderSearchResult {
	setCurrentSkipTarget(query.MALID, query.Episode)
	all := parallelProviderSearchWithGrace(query, parents, 1800*time.Millisecond, searchProviderServersSubset)
	if len(all) == 0 {
		return all
	}
	strict := make([]ProviderSearchResult, 0, len(all))
	for _, r := range all {
		if strings.TrimSpace(r.Title) != "" && rssItemMatchesRequest(r.Title, query) {
			strict = append(strict, r)
		}
	}
	return strict
}

func searchSubtitleProviders(query PlaybackPrepareRequest, parents ...context.Context) []ProviderSubtitle {
	results := parallelProviderSearchWithGrace(query, parents, 3500*time.Millisecond, searchSubtitleProvidersSubset)
	unique := []ProviderSubtitle{}
	seen := map[string]bool{}
	for _, result := range results {
		if !seen[result.URL] {
			seen[result.URL] = true
			unique = append(unique, result)
		}
	}
	return unique
}
