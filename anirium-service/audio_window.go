package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
)

// Bounded audio extraction for a scheduler-selected episode window. Existing
// published playlists are never replaced by this helper.
func transcodeAudioWindow(ctx context.Context, input, dir string, streamIndex int, config audioOutputConfig, start, duration float64) error {
	if streamIndex < 0 || config.BitRate <= 0 || config.SampleRate <= 0 || config.Channels < 0 || math.IsNaN(start) || math.IsInf(start, 0) || start < 0 || start > 86400 || math.Mod(start, 4) != 0 || math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0 || duration > 24 || math.Mod(duration, 4) != 0 {
		return fmt.Errorf("invalid audio window")
	}
	release, err := acquireMediaSlot(ctx, audioTranscodeSlots)
	if err != nil {
		return err
	}
	defer release()
	return transcodeAudioWindowWithOwnedSlot(ctx, input, dir, streamIndex, config, start, duration)
}

func transcodeAudioWindowWithOwnedSlot(ctx context.Context, input, dir string, streamIndex int, config audioOutputConfig, start, duration float64) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	args := []string{"-hide_banner", "-loglevel", "error", "-ss", fmt.Sprint(start), "-i", input, "-t", fmt.Sprint(duration),
		"-map", fmt.Sprintf("0:%d", streamIndex), "-vn", "-af", "aresample=async=1:first_pts=0", "-c:a", "aac", "-b:a", fmt.Sprint(config.BitRate), "-ar", fmt.Sprint(config.SampleRate)}
	if config.Channels > 0 {
		args = append(args, "-ac", fmt.Sprint(config.Channels))
	}
	args = append(args, "-output_ts_offset", fmt.Sprint(start+windowTransportOffset), "-f", "hls", "-hls_time", "4", "-hls_segment_options", "mpegts_copyts=1", "-hls_flags", "temp_file", "-hls_playlist_type", "vod", "-start_number", fmt.Sprint(int(start/4)),
		"-hls_segment_filename", filepath.Join(dir, "audio-%06d.ts"), filepath.Join(dir, "index.m3u8"))
	return mediaCommandContext(ctx, mediaTool("ffmpeg"), boundedTranscodeArgs(args, "1")...).Run()
}
