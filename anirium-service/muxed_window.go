package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// Join already normalized, episode-aligned streams without another encode.
// Publication is owned by the window builder only after both streams decode.
func muxPlaybackWindow(ctx context.Context, videoDir, audioDir, outputDir string, start float64) error {
	if !isFiniteWindowPosition(start) {
		return fmt.Errorf("invalid mux position")
	}
	if err := os.MkdirAll(outputDir, 0700); err != nil {
		return err
	}
	args := []string{"-hide_banner", "-loglevel", "error", "-copyts",
		"-i", filepath.Join(videoDir, "index.m3u8"), "-i", filepath.Join(audioDir, "index.m3u8"),
		"-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
		"-f", "hls", "-hls_time", "4", "-hls_segment_options", "mpegts_copyts=1",
		"-hls_flags", "independent_segments+temp_file", "-hls_playlist_type", "vod",
		"-start_number", fmt.Sprint(int(start / 4)), "-hls_segment_filename", filepath.Join(outputDir, "segment-%06d.ts"), filepath.Join(outputDir, "index.m3u8")}
	if err := mediaCommandContext(ctx, mediaTool("ffmpeg"), args...).Run(); err != nil {
		return err
	}
	segments, complete, err := readGeneratedHLS(filepath.Join(outputDir, "index.m3u8"))
	if err != nil || !complete || len(segments) == 0 {
		return fmt.Errorf("incomplete muxed window")
	}
	for _, segment := range segments {
		videoPTS, err := segmentPacketPTS(ctx, segment.path, "v:0")
		if err != nil {
			return err
		}
		audioPTS, err := segmentPacketPTS(ctx, segment.path, "a:0")
		if err != nil {
			return err
		}
		if videoPTS < audioPTS-0.25 || videoPTS > audioPTS+0.25 {
			return fmt.Errorf("muxed stream clocks differ")
		}
	}
	return nil
}
