package main

import (
	"fmt"
	"os/exec"
	"testing"
)

func TestMediaFailureCategoryDoesNotExposeWorkerDiagnostic(t *testing.T) {
	for _, sample := range []struct{ diagnostic, expected string }{
		{"http://private.example/credential: Connection reset by peer", "transport-reset"},
		{"secret subtitle text: Invalid data found when processing input", "invalid-media"},
		{"Server returned 503 Service Unavailable", "input-http"},
		{"unknown diagnostic containing a private path", "worker-exit"},
	} {
		failure := fmt.Errorf("wrapped: %w", &exec.ExitError{Stderr: []byte(sample.diagnostic)})
		if actual := mediaFailureCategory(failure); actual != sample.expected {
			t.Fatalf("category=%s want=%s", actual, sample.expected)
		}
	}
	if mediaFailureCategory(fmt.Errorf("private executable path")) != "launch" {
		t.Fatal("non-exit error must use the launch category")
	}
}
