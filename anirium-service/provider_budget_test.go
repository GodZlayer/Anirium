package main

import (
	"context"
	"testing"
	"time"
)

func TestProviderSearchBudgetReservesTimeForResponse(t *testing.T) {
	if budget := providerSearchBudgetMS(context.Background()); budget != 7750 {
		t.Fatalf("unbounded context budget: %d", budget)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if budget := providerSearchBudgetMS(ctx); budget < 1 || budget > 400 {
		t.Fatalf("response reserve absent: %d", budget)
	}
	ctx, cancelExpired := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancelExpired()
	if budget := providerSearchBudgetMS(ctx); budget != 1 {
		t.Fatalf("expired budget: %d", budget)
	}
}
