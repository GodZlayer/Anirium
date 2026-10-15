package main

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"
)

func convertSidecarVTT(parent context.Context, content []byte, extension string) (string, error) {
	format := map[string]string{".srt": "srt", ".ass": "ass", ".vtt": "webvtt"}[strings.ToLower(extension)]
	if format == "" {
		return "", fmt.Errorf("unsupported subtitle format")
	}
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	cmd := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", format, "-i", "pipe:0", "-map", "0:s:0", "-c:s", "webvtt", "-f", "webvtt", "pipe:1")
	cmd.Stdin = bytes.NewReader(content)
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	text := string(output)
	if !strings.HasPrefix(text, "WEBVTT") || !strings.Contains(text, "-->") {
		return "", fmt.Errorf("empty or invalid subtitle")
	}
	return text, nil
}
