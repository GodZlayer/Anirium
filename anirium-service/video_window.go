package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
)

// Produce a bounded, independently decodable window on the episode timeline.
// Input must already be episode/source-set selected. This does not publish or
// replace any existing playlist; the demand scheduler owns that decision.
func transcodeVideoWindow(ctx context.Context, input, dir, quality string, start, duration float64) error {
	if qualityPixels(quality) == 0 || math.IsNaN(start) || math.IsInf(start, 0) || start < 0 || start > 86400 || math.Mod(start, 4) != 0 || math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0 || duration > 24 || math.Mod(duration, 4) != 0 {
		return fmt.Errorf("invalid video window")
	}
	return runQueuedVideoInput(ctx, quality, func() error {
		return transcodeVideoWindowWithOwnedSlot(ctx, input, dir, quality, start, duration)
	})
}

func transcodeVideoWindowWithOwnedSlot(ctx context.Context, input, dir, quality string, start, duration float64) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	args := []string{"-hide_banner", "-loglevel", "error", "-ss", fmt.Sprint(start), "-i", input, "-t", fmt.Sprint(duration),
		"-map", "0:V:0", "-an", "-vf", "fps=24,scale=-2:" + qualityHeight(quality), "-pix_fmt", "yuv420p",
		"-c:v", "libx264", "-preset", "veryfast", "-g", "96", "-keyint_min", "96", "-sc_threshold", "0",
		"-force_key_frames", "expr:gte(t,n_forced*4)", "-output_ts_offset", fmt.Sprint(start + windowTransportOffset),
		"-f", "hls", "-hls_time", "4", "-hls_segment_options", "mpegts_copyts=1", "-hls_flags", "independent_segments+temp_file", "-hls_playlist_type", "vod",
		"-start_number", fmt.Sprint(int(start / 4)), "-hls_segment_filename", filepath.Join(dir, "segment-%06d.ts"), filepath.Join(dir, "index.m3u8")}
	return mediaCommandContext(ctx, mediaTool("ffmpeg"), boundedTranscodeArgs(args, "2")...).Run()
}
