package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

// Only accepts a direct, Service-created temporary directory. Wait for both
// playback cancellation and the worker exit before removing encoded segments.
func retireMediaDirectory(parent context.Context, dir string) func() {
	finished := make(chan struct{})
	absolute, err := filepath.Abs(dir)
	tempRoot, rootErr := filepath.Abs(os.TempDir())
	safe := err == nil && rootErr == nil && strings.EqualFold(filepath.Dir(absolute), tempRoot) && strings.HasPrefix(filepath.Base(absolute), "anirium-")
	if safe {
		go func() {
			<-parent.Done()
			<-finished
			if err := os.RemoveAll(absolute); err != nil {
				appendLog("Media cache cleanup failed")
			}
		}()
	}
	return func() { close(finished) }
}
