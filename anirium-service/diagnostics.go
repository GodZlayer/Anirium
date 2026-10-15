package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Diagnose the actual packaged tools without starting GUI, HTTP, torrents,
// providers, or reading account credentials. Missing bundled tools fail closed.
func runServiceDiagnostics(output io.Writer, installDir string) error {
	report := struct {
		Version        string `json:"version"`
		BundledTools   bool   `json:"bundledTools"`
		MediaSmokeTest bool   `json:"mediaSmokeTest"`
		NetworkStarted bool   `json:"networkStarted"`
	}{Version: serviceVersion}
	defer func() { _ = json.NewEncoder(output).Encode(report) }()
	for _, tool := range []string{"ffmpeg.exe", "ffprobe.exe"} {
		path := filepath.Join(installDir, "tools", tool)
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			return fmt.Errorf("required bundled tool unavailable: %s", tool)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		_, err = mediaCommandContext(ctx, path, "-version").CombinedOutput()
		cancel()
		if err != nil {
			return fmt.Errorf("bundled tool execution failed: %s: %w", tool, err)
		}
	}
	report.BundledTools = true
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-f", "null", "-"}
	if _, err := mediaCommandContext(ctx, filepath.Join(installDir, "tools", "ffmpeg.exe"), args...).CombinedOutput(); err != nil {
		return fmt.Errorf("bundled audio/video smoke test failed: %w", err)
	}
	report.MediaSmokeTest = true
	return nil
}
