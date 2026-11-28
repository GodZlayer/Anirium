package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// All text streams share one demuxer/input read. Outputs remain private until
// the bounded process completes; silence is a successful empty interval.
func extractSubtitleBatch(ctx context.Context, cache *mediaInputCache, source string, tracks []SubtitleTrack, start float64) map[int]string {
	return extractSubtitleSpan(ctx, cache, source, tracks, start, 60)
}

func extractSubtitleSpan(ctx context.Context, cache *mediaInputCache, source string, tracks []SubtitleTrack, start, span float64) map[int]string {
	result := map[int]string{}
	if span <= 0 {
		return result
	}
	missing := []SubtitleTrack{}
	for _, track := range tracks {
		if span == 60 {
			if content, ok := cache.cachedSubtitleWindow(subtitleWindowKey{source, track.StreamIndex, start}); ok {
				result[track.StreamIndex] = content
				continue
			}
		}
		if content, ok := cache.cachedSubtitleWindow(subtitleWindowKey{source, track.StreamIndex, -1}); ok {
			if normalized, err := normalizeWebVTTWindow(content, start, span); err == nil {
				result[track.StreamIndex] = normalized
				continue
			}
		}
		missing = append(missing, track)
	}
	tracks = missing
	if len(tracks) == 0 {
		return result
	}
	path, release, err := cache.acquire(ctx, source, 0)
	if err != nil {
		return result
	}
	defer release()
	dir, err := os.MkdirTemp("", "anirium-subtitles-")
	if err != nil {
		return result
	}
	defer os.RemoveAll(dir)
	// Limit input demuxing too: sparse subtitle streams must not force a scan
	// to the next distant subtitle packet merely to close their output.
	// -vn -an skip decoding video/audio streams while demuxing subtitle packets.
	args := []string{"-hide_banner", "-loglevel", "error", "-nostdin", "-copyts", "-ss", fmt.Sprintf("%.3f", start), "-t", fmt.Sprintf("%.3f", span), "-i", path, "-vn", "-an"}
	for _, track := range tracks {
		args = append(args, "-map", fmt.Sprintf("0:%d", track.StreamIndex), "-to", fmt.Sprintf("%.3f", start+span), "-c:s", "webvtt", "-f", "webvtt", filepath.Join(dir, fmt.Sprintf("%d.vtt", track.StreamIndex)))
	}
	if len(tracks) == 0 {
		return result
	}
	err = mediaCommandContext(ctx, mediaTool("ffmpeg"), args...).Run()
	if err != nil && ctx.Err() != context.DeadlineExceeded {
		return result
	}
	if ctx.Err() == context.Canceled {
		return result
	}
	for _, track := range tracks {
		path := filepath.Join(dir, fmt.Sprintf("%d.vtt", track.StreamIndex))
		info, err := os.Stat(path)
		if err != nil || info.Size() > 512<<10 {
			continue
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if normalized, err := normalizeWebVTTWindow(string(raw), start, span); err == nil {
			result[track.StreamIndex] = normalized
		}
	}
	return result
}

func parseBundleCues(vtt string, offset float64) ([]subtitleCue, error) {
	if len(vtt) > 16<<20 || !strings.HasPrefix(strings.TrimPrefix(vtt, "\ufeff"), "WEBVTT") {
		return nil, fmt.Errorf("invalid subtitle")
	}
	cues := []subtitleCue{}
	for _, block := range strings.Split(strings.ReplaceAll(vtt, "\r\n", "\n"), "\n\n") {
		lines := strings.Split(block, "\n")
		for index, line := range lines {
			if !strings.Contains(line, "-->") {
				continue
			}
			times := strings.SplitN(line, "-->", 2)
			endFields := strings.Fields(times[1])
			if len(endFields) == 0 {
				return nil, fmt.Errorf("invalid timing")
			}
			a, e1 := parseWebVTTMillis(strings.TrimSpace(times[0]))
			z, e2 := parseWebVTTMillis(endFields[0])
			if e1 != nil || e2 != nil || a < 0 || z > 86400000 {
				return nil, fmt.Errorf("invalid timing")
			}
			if z <= a {
				break
			}
			text := strings.TrimSpace(strings.Join(lines[index+1:], "\n"))
			if text != "" {
				if len(cues) >= 100000 {
					return nil, fmt.Errorf("subtitle cue limit exceeded")
				}
				cues = append(cues, subtitleCue{float64(a)/1000 + offset, float64(z)/1000 + offset, text})
			}
			break
		}
	}
	return cues, nil
}
