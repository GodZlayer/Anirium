package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type AudioTrack struct {
	ProcessingFailed   bool    `json:"processingFailed"`
	ProcessingComplete bool    `json:"processingComplete"`
	BufferedSeconds    float64 `json:"bufferedSeconds"`
	Bandwidth          int64   `json:"bandwidth,omitempty"`
	ID                 string  `json:"id"`
	Language           string  `json:"language"`
	PlaylistURL        string  `json:"playlistUrl,omitempty"`
	Status             string  `json:"status"`
}

func audioTrackID(generation uint64, index int) string {
	return fmt.Sprintf("audio-%d-%d", generation, index)
}

// Caller holds swarmMu. The active ready window, not intentionally stopped
// whole-episode encoders, defines the current playback's audio availability.
func manifestAudioTracksLocked() []AudioTrack {
	if currentPlaybackWindow != nil && currentPlaybackWindow.ctx.Err() == nil && currentPlaybackWindow.Status == "ready" {
		return append([]AudioTrack(nil), currentPlaybackWindow.AudioTracks...)
	}
	return audioTracksLocked()
}

// Caller holds swarmMu. Runtime publication follows swarmMu -> variantMu.
func audioTracksLocked() []AudioTrack {
	tracks := []AudioTrack{}
	variantMu.RLock()
	defer variantMu.RUnlock()
	for index, candidate := range selectedAudioCandidates {
		id := audioTrackID(playbackGeneration, index)
		track := AudioTrack{ID: id, Language: candidate.Language, Status: "preparing"}
		if runtime, ok := variantRuntimes[id]; ok {
			track.Status = runtime.Status
			track.ProcessingFailed = runtime.ProcessingFailed
			track.ProcessingComplete = runtime.ProcessingComplete
			track.BufferedSeconds = runtime.BufferedSeconds
			if runtime.Status == "ready" {
				track.Bandwidth = runtime.Bandwidth
				track.PlaylistURL = runtime.PlaylistURL
			}
		}
		tracks = append(tracks, track)
	}
	return tracks
}

func transcodeAudioToHLS(ctx context.Context, input, dir string, streamIndex int, configs ...audioOutputConfig) error {
	releaseSlot, err := acquireMediaSlot(ctx, audioTranscodeSlots)
	if err != nil {
		return err
	}
	defer releaseSlot()
	return transcodeAudioWithOwnedSlot(ctx, input, dir, streamIndex, configs...)
}

func transcodeAudioWithOwnedSlot(ctx context.Context, input, dir string, streamIndex int, configs ...audioOutputConfig) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	// Retain the demuxer's relative timestamps. Resetting each track to its own
	// first packet removes intentional start delays; fill that gap with silence.
	config := audioOutputConfig{BitRate: 320000, SampleRate: 48000}
	if len(configs) > 0 {
		config = configs[0]
	}
	args := []string{"-hide_banner", "-loglevel", "error", "-i", input, "-map", fmt.Sprintf("0:%d", streamIndex), "-vn", "-af", "aresample=async=1:first_pts=0", "-c:a", "aac", "-b:a", fmt.Sprint(config.BitRate), "-ar", fmt.Sprint(config.SampleRate)}
	if config.Channels > 0 {
		args = append(args, "-ac", fmt.Sprint(config.Channels))
	}
	args = append(args, "-f", "hls", "-hls_time", "4", "-hls_flags", "temp_file", "-hls_playlist_type", "event", "-hls_list_size", "0", "-hls_segment_filename", filepath.Join(dir, "audio-%06d.ts"), filepath.Join(dir, "index.m3u8"))
	return mediaCommandContext(ctx, mediaTool("ffmpeg"), boundedTranscodeArgs(args, "1")...).Run()
}

func buildAudioTrack(candidate AudioCandidate, index int, generation uint64) {
	swarmMu.RLock()
	if generation != playbackGeneration {
		swarmMu.RUnlock()
		return
	}
	ctx, cancel := context.WithTimeout(continuousContextLocked(), 30*time.Minute)
	inputCache := playbackInputs
	pool := connectionAudioPool(candidate, audioCandidates(activeLinks, probedStreams))
	outputConfig := audioOutputFor(candidate, selectedAudioPolicy)
	defer cancel()
	id := audioTrackID(generation, index)
	variantMu.Lock()
	variantRuntimes[id] = &variantRuntime{MixVariant: MixVariant{ID: id, Status: "preparing"}}
	variantMu.Unlock()
	dir, err := os.MkdirTemp("", "anirium-"+id+"-")
	if err != nil {
		markVariantStalled(id, err)
		swarmMu.RUnlock()
		return
	}
	defer retireMediaDirectory(playbackContext, dir)()
	variantMu.Lock()
	variantRuntimes[id].Dir = dir
	variantMu.Unlock()
	swarmMu.RUnlock()
	producers := make([]hlsProducer, 0, len(pool))
	for rank, alternative := range pool {
		producers = append(producers, hlsProducer{source: alternative.Source, inputStream: fmt.Sprintf("0:%d", alternative.StreamIndex), playlist: "index.m3u8", clockStream: "a:0", preference: rank, run: func(jobContext context.Context, sourceDir string) error {
			releaseSlot, err := acquireMediaSlot(jobContext, audioTranscodeSlots)
			if err != nil {
				return err
			}
			defer releaseSlot()
			input, release, err := inputCache.acquire(jobContext, alternative.Source, index)
			if err != nil {
				return err
			}
			defer release()
			return transcodeAudioWithOwnedSlot(jobContext, input, sourceDir, alternative.StreamIndex, outputConfig)
		}})
	}
	if err := publishIncrementalHLS(ctx, dir, producers, func(progress hlsProgress) { publishRuntimeProgress(ctx, id, "index.m3u8", progress) }); err != nil {
		markVariantStalled(id, err)
	}
}
