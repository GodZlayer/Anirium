package main

import (
	"context"
	"fmt"
	"testing"
)

func TestExplicitRetryPreservesPendingAndUsableInputs(t *testing.T) {
	finished := make(chan struct{})
	close(finished)
	pending := &sharedInput{done: make(chan struct{})}
	usable := &sharedInput{done: finished, path: "usable", users: 1}
	failed := &sharedInput{done: finished, err: fmt.Errorf("unavailable")}
	cache := &mediaInputCache{ctx: context.Background(), entries: map[string]*sharedInput{
		"pending": pending, "usable": usable, "failed": failed,
	}}
	cache.retryFailed([]string{"pending", "usable", "failed", "missing"})
	if cache.entries["pending"] != pending || cache.entries["usable"] != usable {
		t.Fatal("retry displaced an active or usable input")
	}
	if _, exists := cache.entries["failed"]; exists {
		t.Fatal("terminal failure was not cleared for explicit retry")
	}
}
