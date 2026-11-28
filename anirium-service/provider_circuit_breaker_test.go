package main

import (
	"testing"
	"time"
)

func TestProviderCircuitBreaker(t *testing.T) {
	prevSpan := providerCooldownSpan
	providerCooldownSpan = 50 * time.Millisecond
	defer func() { providerCooldownSpan = prevSpan }()

	id := "remote-test-offline"
	markProviderOnline(id)
	if isProviderInCooldown(id) {
		t.Fatalf("expected provider not in cooldown initially")
	}

	markProviderOffline(id)
	if !isProviderInCooldown(id) {
		t.Fatalf("expected provider in cooldown after markProviderOffline")
	}

	time.Sleep(70 * time.Millisecond)
	if isProviderInCooldown(id) {
		t.Fatalf("expected cooldown to expire")
	}
}
