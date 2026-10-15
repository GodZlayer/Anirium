package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func probeCachedInput(parent context.Context, cache *mediaInputCache, source string) (ffprobeOutput, error) {
	var parsed ffprobeOutput
	if cache == nil {
		return parsed, fmt.Errorf("media cache unavailable")
	}
	// Discovery's deadline includes acquiring the progressive input. An
	// unavailable peer must not hold an inventory worker for half an hour.
	ctx, cancel := context.WithTimeout(parent, 90*time.Second)
	defer cancel()
	path, release, err := cache.acquire(ctx, source, 0)
	if err != nil {
		return parsed, err
	}
	defer release()
	output, err := mediaCommandContext(ctx, mediaTool("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", path).Output()
	if err != nil {
		return parsed, err
	}
	if err := json.Unmarshal(output, &parsed); err != nil {
		return parsed, err
	}
	if len(parsed.Streams) == 0 {
		return parsed, fmt.Errorf("no media streams")
	}
	return parsed, nil
}

func extractCachedSubtitle(parent context.Context, cache *mediaInputCache, source string, streamIndex int) (string, error) {
	return extractCachedSubtitleWindow(parent, cache, source, streamIndex, -1)
}

func extractCachedSubtitleWindow(parent context.Context, cache *mediaInputCache, source string, streamIndex int, start float64) (string, error) {
	if cache == nil {
		return extractSubtitleWindowInput(parent, cache, source, streamIndex, start)
	}
	key := subtitleWindowKey{source: source, stream: streamIndex, start: start}
	content, err := cache.sharedSubtitleWindow(parent, key, func(shared context.Context) (string, error) {
		return extractSubtitleWindowInput(shared, cache, source, streamIndex, start)
	})
	if err == nil && start >= 0 {
		if next, ok := nextSubtitleWindow(start); ok {
			nextKey := subtitleWindowKey{source: source, stream: streamIndex, start: next}
			if cache.prefetchSubtitleWindow(nextKey, func(shared context.Context) (string, error) {
				return extractSubtitleWindowInput(shared, cache, source, streamIndex, next)
			}) {
				appendLog(fmt.Sprintf("Subtitle window outcome=prefetch-scheduled stream=%d window_start=%.3f", streamIndex, next))
			}
		}
	}
	return content, err
}

func extractSubtitleWindowInput(parent context.Context, cache *mediaInputCache, source string, streamIndex int, start float64) (string, error) {
	started := time.Now()
	// Only stage/index/timing are recorded; source and tool stderr may contain credentials.
	record := func(stage, outcome string) {
		appendLog(fmt.Sprintf("Subtitle extraction stage=%s outcome=%s stream=%d window_start=%.3f elapsed_ms=%d", stage, outcome, streamIndex, start, time.Since(started).Milliseconds()))
	}
	if cache == nil {
		record("input", "cache-unavailable")
		return "", fmt.Errorf("media cache unavailable")
	}
	if err := parent.Err(); err != nil {
		return "", err
	}
	windowKey := subtitleWindowKey{source: source, stream: streamIndex, start: start}
	if content, exists := cache.cachedSubtitleWindow(windowKey); exists {
		record("vtt", "cached")
		return content, nil
	}
	extractionBudget := 90 * time.Second
	if start < 0 {
		// A complete embedded track may require scanning the entire torrent.
		// Its job belongs to playback, not to one short HTTP observation.
		extractionBudget = 15 * time.Minute
	}
	ctx, cancel := context.WithTimeout(parent, extractionBudget)
	defer cancel()
	record("input", "waiting")
	path, release, err := cache.acquire(ctx, source, 0)
	if err != nil {
		outcome := "failed"
		if ctx.Err() == context.DeadlineExceeded {
			outcome = "deadline"
		}
		record("input", outcome)
		return "", err
	}
	defer release()
	record("ffmpeg", "started")
	args := subtitleExtractionArgs(path, streamIndex)
	if start >= 0 {
		args = subtitleWindowExtractionArgs(path, streamIndex, start)
	}
	output, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), args...).Output()
	if err != nil {
		appendLog(fmt.Sprintf("Subtitle extraction output_bytes=%d stream=%d", len(output), streamIndex))
		appendLog(fmt.Sprintf("Subtitle extraction failure_category=%s stream=%d", mediaFailureCategory(err), streamIndex))
		outcome := "failed"
		if ctx.Err() == context.DeadlineExceeded {
			outcome = "deadline"
		}
		record("ffmpeg", outcome)
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", err
	}
	text := string(output)
	// Counts distinguish an empty source window from cues removed by timestamp
	// normalization, without logging subtitle text or private input URLs.
	appendLog(fmt.Sprintf("Subtitle extraction stream=%d raw_bytes=%d raw_cues=%d window_start=%.3f", streamIndex, len(output), strings.Count(text, "-->"), start))
	if !strings.HasPrefix(text, "WEBVTT") || (start < 0 && !strings.Contains(text, "-->")) {
		record("vtt", "invalid")
		return "", fmt.Errorf("invalid embedded subtitle")
	}
	// Normalize timestamps: filter cues outside [start, start+60], clamp overlap,
	// and subtract start to make times relative. This wires the output normalization
	// for absolute FFmpeg subtitle timestamps with -copyts determinism.
	if start >= 0 {
		normalized, err := normalizeWebVTT(text, start)
		if err != nil {
			record("vtt", "normalize-failed")
			return "", fmt.Errorf("webvtt normalization failed: %w", err)
		}
		text = normalized
		appendLog(fmt.Sprintf("Subtitle extraction stream=%d normalized_cues=%d window_start=%.3f", streamIndex, strings.Count(text, "-->"), start))
	}
	record("vtt", "ready")
	cache.rememberSubtitleWindow(windowKey, text)
	return text, nil
}
