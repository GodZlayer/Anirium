package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
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
	checkSegments := segments
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" && len(segments) > 2 {
		checkSegments = segments[:1]
	}
	for _, segment := range checkSegments {
		if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
			videoPTS, audioPTS, err := muxedSegmentFirstPacketPTS(ctx, segment.path)
			if err != nil {
				return err
			}
			if videoPTS < audioPTS-0.25 || videoPTS > audioPTS+0.25 {
				return fmt.Errorf("muxed stream clocks differ")
			}
			continue
		}
		var (
			videoPTS, audioPTS float64
			vErr, aErr         error
			wg                 sync.WaitGroup
		)
		wg.Add(2)
		go func(path string) {
			defer wg.Done()
			videoPTS, vErr = segmentPacketPTS(ctx, path, "v:0")
		}(segment.path)
		go func(path string) {
			defer wg.Done()
			audioPTS, aErr = segmentPacketPTS(ctx, path, "a:0")
		}(segment.path)
		wg.Wait()
		if vErr != nil {
			return vErr
		}
		if aErr != nil {
			return aErr
		}
		if videoPTS < audioPTS-0.25 || videoPTS > audioPTS+0.25 {
			return fmt.Errorf("muxed stream clocks differ")
		}
	}
	return nil
}
