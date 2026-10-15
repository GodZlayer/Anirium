package main

import (
	"errors"
	"os/exec"
	"strings"
)

// Classify worker diagnostics without exposing private input URLs, paths,
// subtitle text or the raw process error in shared logs.
func mediaFailureCategory(err error) string {
	var failure *exec.ExitError
	if !errors.As(err, &failure) {
		return "launch"
	}
	diagnostic := strings.ToLower(string(failure.Stderr))
	for _, category := range []struct{ pattern, label string }{
		{"connection reset", "transport-reset"},
		{"connection timed out", "transport-timeout"},
		{"input/output error", "input-io"},
		{"server returned", "input-http"},
		{"invalid data", "invalid-media"},
		{"matches no streams", "missing-stream"},
		{"error writing", "output-io"},
	} {
		if strings.Contains(diagnostic, category.pattern) {
			return category.label
		}
	}
	return "worker-exit"
}
