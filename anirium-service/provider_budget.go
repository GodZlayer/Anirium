package main

import (
	"context"
	"time"
)

// Leave transport/JSON time inside the caller's deadline. Providers may ignore
// this hint; the Service's own context remains the authoritative limit.
func providerSearchBudgetMS(ctx context.Context) int64 {
	remaining := 8 * time.Second
	if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) < remaining {
		remaining = time.Until(deadline)
	}
	reserve := min(250*time.Millisecond, remaining/5)
	return max(1, (remaining - reserve).Milliseconds())
}
