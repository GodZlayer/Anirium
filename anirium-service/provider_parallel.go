package main

import (
	"context"
	"sync"
	"sync/atomic"
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
	var (
		workers              sync.WaitGroup
		graceOnce            sync.Once
		timerMu              sync.Mutex
		graceTmr             *time.Timer
		totalResults         atomic.Int32
		providersWithResults atomic.Int32
	)
	defer func() {
		timerMu.Lock()
		if graceTmr != nil {
			graceTmr.Stop()
		}
		timerMu.Unlock()
	}()
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
			res := search(query, ctx, []ProviderServer{server})
			results[index] = res
			if len(res) > 0 {
				total := totalResults.Add(int32(len(res)))
				providers := providersWithResults.Add(1)
				if (total >= 6 && providers >= 2) || (total >= 12 && providers >= 1) {
					graceOnce.Do(func() {
						delay := graceDelay
						if delay <= 0 {
							delay = 1800 * time.Millisecond
						}
						t := time.AfterFunc(delay, cancelSearch)
						timerMu.Lock()
						graceTmr = t
						timerMu.Unlock()
					})
				}
			}
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
	return parallelProviderSearchWithGrace(query, parents, 1800*time.Millisecond, searchProviderServersSubset)
}

func searchSubtitleProviders(query PlaybackPrepareRequest, parents ...context.Context) []ProviderSubtitle {
	results := parallelProviderSearchWithGrace(query, parents, 4500*time.Millisecond, searchSubtitleProvidersSubset)
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
