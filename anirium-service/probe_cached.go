package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
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
	probeTimeout := 14 * time.Second
	if os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		probeTimeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(parent, probeTimeout)
	defer cancel()
	path, release, err := cache.acquire(ctx, source, 0)
	if err != nil {
		return parsed, err
	}
	defer release()
	output, err := mediaCommandContext(ctx, mediaTool("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-show_chapters", "-of", "json", path).Output()
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

type partialSubtitleError struct {
	content string
}

func (e *partialSubtitleError) Error() string {
	return "partial subtitle recovered"
}

func extractCachedSubtitleSpan(parent context.Context, cache *mediaInputCache, source string, streamIndex int, start, span float64) (string, error) {
	if cache == nil {
		return "", fmt.Errorf("media cache unavailable")
	}
	blockStart := math.Floor(start/60) * 60
	if content, ok := cache.cachedSubtitleWindow(subtitleWindowKey{source: source, stream: streamIndex, start: blockStart}); ok {
		if math.Abs(start-blockStart) < 0.05 {
			return content, nil
		}
		if normalized, normErr := normalizeWebVTTWindow(content, start-blockStart, span); normErr == nil {
			return normalized, nil
		}
	}
	if content, ok := cache.cachedSubtitleWindow(subtitleWindowKey{source: source, stream: streamIndex, start: -1}); ok {
		if normalized, err := normalizeWebVTTWindow(content, start, span); err == nil {
			return normalized, nil
		}
	}
	ctx, cancel := context.WithTimeout(parent, 12*time.Second)
	defer cancel()
	path, release, err := cache.acquire(ctx, source, 0)
	if err != nil {
		return "", err
	}
	defer release()
	args := subtitleWindowSpanExtractionArgs(path, streamIndex, start, span)
	output, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), args...).Output()
	if err != nil {
		return "", err
	}
	text := string(output)
	if !strings.HasPrefix(text, "WEBVTT") {
		return "", fmt.Errorf("invalid embedded subtitle")
	}
	return normalizeWebVTTWindow(text, start, span)
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
	extractionBudget := 30 * time.Second
	if start < 0 {
		// Legenda de arquivo inteiro não pode sequestrar a rede nem gastar 15 minutos travando o stream
		extractionBudget = 10 * time.Second
	} else if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		extractionBudget = 20 * time.Second
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
		if ctx.Err() == context.DeadlineExceeded && start >= 0 && os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
			partial := string(output)
			if strings.HasPrefix(partial, "WEBVTT") && strings.Contains(partial, "-->") {
				if normalized, normErr := normalizeWebVTT(partial, start); normErr == nil {
					appendLog(fmt.Sprintf("Subtitle extraction partial_recovered stream=%d bytes=%d normalized_cues=%d window_start=%.3f", streamIndex, len(output), strings.Count(normalized, "-->"), start))
					return normalized, &partialSubtitleError{content: normalized}
				}
			}
		}
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
	if strings.Contains(text, "-->") {
		cache.rememberSubtitleWindow(windowKey, text)
	}
	return text, nil
}
