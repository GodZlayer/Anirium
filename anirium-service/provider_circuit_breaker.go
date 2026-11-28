package main

import (
	"sync"
	"time"
)

var (
	providerBreakerMu    sync.Mutex
	providerCooldownMap  = map[string]time.Time{}
	providerCooldownSpan = 5 * time.Minute
)

func isProviderInCooldown(serverID string) bool {
	if serverID == "" {
		return false
	}
	providerBreakerMu.Lock()
	defer providerBreakerMu.Unlock()
	until, ok := providerCooldownMap[serverID]
	if !ok {
		return false
	}
	if time.Now().After(until) {
		delete(providerCooldownMap, serverID)
		return false
	}
	return true
}

func markProviderOffline(serverID string) {
	if serverID == "" {
		return
	}
	providerBreakerMu.Lock()
	providerCooldownMap[serverID] = time.Now().Add(providerCooldownSpan)
	providerBreakerMu.Unlock()
}

func markProviderOnline(serverID string) {
	if serverID == "" {
		return
	}
	providerBreakerMu.Lock()
	delete(providerCooldownMap, serverID)
	providerBreakerMu.Unlock()
}
