package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Protected by swarmMu. Windows have their own immutable URLs; seeking never
// rewrites the full-episode prefix already consumed by another media request.
var currentPlaybackWindow *playbackWindow
var prefetchedPlaybackWindow *playbackWindow

// Preserve a small back buffer while the decoder finishes outstanding segment
// requests. A seek/revocation retires every retained window immediately.
var retainedPlaybackWindows []*playbackWindow
var playbackWindowSequence uint64

// Caller holds swarmMu. Retired windows must not keep routable runtime entries
// after their cancellation removes the corresponding private media directory.
func cancelPlaybackWindowLocked() {
	for _, window := range retainedPlaybackWindows {
		retirePlaybackWindowLocked(window)
	}
	retainedPlaybackWindows = nil
	retirePlaybackWindowLocked(currentPlaybackWindow)
	retirePlaybackWindowLocked(prefetchedPlaybackWindow)
	currentPlaybackWindow, prefetchedPlaybackWindow = nil, nil
}

func retirePlaybackWindowLocked(window *playbackWindow) {
	if window == nil {
		return
	}
	window.cancel()
	variantMu.Lock()
	for id := range variantRuntimes {
		if strings.HasPrefix(id, window.ID+"-") {
			delete(variantRuntimes, id)
		}
	}
	variantMu.Unlock()
}

type playbackWindow struct {
	preparationStarted    time.Time
	cacheBytes            int64
	timelineID            string
	playlistCursor        slidingPlaylistCursor
	videoSegmentCount     uint64
	audioPlaylistCursors  map[string]slidingPlaylistCursor
	audioSegmentCounts    map[string]uint64
	ID                    string       `json:"id"`
	Start                 float64      `json:"start"`
	Duration              float64      `json:"duration"`
	DeliveredDuration     float64      `json:"deliveredDuration"`
	EndOfEpisode          bool         `json:"endOfEpisode"`
	EpisodeDuration       float64      `json:"episodeDuration"`
	Quality               string       `json:"quality"`
	Audio                 string       `json:"audio,omitempty"`
	MuxedAudio            bool         `json:"muxedAudio"`
	Status                string       `json:"status"`
	PlaylistURL           string       `json:"playlistUrl,omitempty"`
	ContinuousPlaylistURL string       `json:"continuousPlaylistUrl,omitempty"`
	TimelineStart         float64      `json:"timelineStart"`
	AudioTracks           []AudioTrack `json:"audioTracks"`
	cancel                context.CancelFunc
	ctx                   context.Context
}

func decodeWindowRequest(values url.Values) (string, float64, error) {
	for key, entries := range values {
		if (key != "quality" && key != "position" && key != "playbackTicket" && key != "mode") || len(entries) != 1 {
			return "", 0, fmt.Errorf("invalid window request")
		}
	}
	quality := values.Get("quality")
	if mode := values.Get("mode"); mode != "" && mode != "prefetch" {
		return "", 0, fmt.Errorf("invalid window mode")
	}
	position, err := strconv.ParseFloat(values.Get("position"), 64)
	if err != nil || qualityPixels(quality) == 0 || math.IsNaN(position) || math.IsInf(position, 0) || position < 0 || position > 86400 {
		return "", 0, fmt.Errorf("invalid window position or quality")
	}
	return quality, math.Floor(position/4) * 4, nil
}

func playbackWindowSnapshot(prefetch ...bool) (playbackWindow, bool) {
	swarmMu.RLock()
	defer swarmMu.RUnlock()
	window := currentPlaybackWindow
	if len(prefetch) > 0 && prefetch[0] {
		window = prefetchedPlaybackWindow
	}
	if window == nil || window.ctx.Err() != nil {
		return playbackWindow{}, false
	}
	snapshot := *window
	snapshot.AudioTracks = append([]AudioTrack(nil), snapshot.AudioTracks...)
	return snapshot, true
}

func requestPlaybackWindow(quality string, start float64, prefetch ...bool) bool {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	if !playbackDiscoveryComplete || playbackContext.Err() != nil || playbackInputs == nil || !containsString(currentMixQualities, quality) {
		return false
	}
	episodeDuration := playbackEpisodeDurationLocked()
	selectedAudio := ""
	if currentPlaybackSession.Generation == playbackGeneration && currentPlaybackSession.Revision > 0 {
		selectedAudio = currentPlaybackSession.Audio
	}
	if episodeDuration > 0 && start >= episodeDuration {
		return false
	}
	isPrefetch := len(prefetch) > 0 && prefetch[0]
	if isPrefetch {
		if currentPlaybackWindow == nil || currentPlaybackWindow.Status != "ready" || currentPlaybackWindow.EndOfEpisode || currentPlaybackWindow.Quality != quality || currentPlaybackWindow.Audio != selectedAudio || math.Abs(start-(currentPlaybackWindow.Start+currentPlaybackWindow.DeliveredDuration)) > 0.05 {
			return false
		}
		if prefetchedPlaybackWindow != nil && prefetchedPlaybackWindow.ctx.Err() == nil && prefetchedPlaybackWindow.Start == start && prefetchedPlaybackWindow.Quality == quality && prefetchedPlaybackWindow.Audio == selectedAudio && prefetchedPlaybackWindow.Status != "stalled" {
			return true
		}
	} else if prefetchedPlaybackWindow != nil && prefetchedPlaybackWindow.ctx.Err() == nil && prefetchedPlaybackWindow.Start == start && prefetchedPlaybackWindow.Quality == quality && prefetchedPlaybackWindow.Audio == selectedAudio && prefetchedPlaybackWindow.Status != "stalled" {
		retainPlaybackWindowLocked(currentPlaybackWindow)
		currentPlaybackWindow, prefetchedPlaybackWindow = prefetchedPlaybackWindow, nil
		return true
	}
	if currentPlaybackWindow != nil && currentPlaybackWindow.ctx.Err() == nil && currentPlaybackWindow.Start == start && currentPlaybackWindow.Quality == quality && currentPlaybackWindow.Audio == selectedAudio && currentPlaybackWindow.Status != "stalled" {
		return true
	}
	if isPrefetch {
		retirePlaybackWindowLocked(prefetchedPlaybackWindow)
		prefetchedPlaybackWindow = nil
	} else {
		cancelPlaybackWindowLocked()
		stopContinuousPlaybackLocked()
	}
	playbackWindowSequence++
	ctx, cancel := context.WithCancel(playbackContext)
	window := &playbackWindow{ID: fmt.Sprintf("window-%d-%d", playbackGeneration, playbackWindowSequence), Start: start, Duration: 24, Quality: quality, Status: "preparing", AudioTracks: []AudioTrack{}, cancel: cancel, ctx: ctx}
	window.EpisodeDuration = episodeDuration
	window.preparationStarted = time.Now()
	window.Audio = selectedAudio
	window.timelineID = window.ID
	window.TimelineStart = start
	if isPrefetch {
		window.timelineID = currentPlaybackWindow.timelineID
		window.TimelineStart = currentPlaybackWindow.TimelineStart
		window.playlistCursor = slidingPlaylistCursor{
			MediaSequence:         currentPlaybackWindow.playlistCursor.MediaSequence + currentPlaybackWindow.videoSegmentCount,
			DiscontinuitySequence: currentPlaybackWindow.playlistCursor.DiscontinuitySequence + 1,
		}
		window.audioPlaylistCursors = nextAudioPlaylistCursors(currentPlaybackWindow)
	}
	if isPrefetch {
		prefetchedPlaybackWindow = window
	} else {
		currentPlaybackWindow = window
	}
	sources := orderedSustainableVideoSources(activeLinks, probedStreams, probedFormats, quality, observedTransferCapacity)
	inputs := playbackInputs
	candidates := append([]AudioCandidate(nil), selectedAudioCandidates...)
	if selectedAudio != "" {
		candidates = nil
		for _, candidate := range selectedAudioCandidates {
			if candidate.Language == selectedAudio {
				candidates = append(candidates, candidate)
				break
			}
		}
		if len(candidates) == 0 {
			window.Status = "stalled"
			return false
		}
	}
	alternatives := audioCandidates(activeLinks, probedStreams)
	if selectedAudio != "" && len(sources) > 0 {
		candidates = preferVideoSourceAudio(candidates, alternatives, sources[0])
	}
	policy := sharedAudioPolicy(connectionAudioPolicy(observedTransferCapacity), len(candidates))
	workers := playbackWorkers
	workers.Add(1)
	go func() {
		defer workers.Done()
		buildPlaybackWindow(window, inputs, sources, candidates, policy, alternatives)
	}()
	return true
}

// Caller holds swarmMu. Keep at most two completed preceding windows, never
// unlimited episode media. Their contexts still belong to playbackContext.
func retainPlaybackWindowLocked(window *playbackWindow) {
	if window == nil {
		return
	}
	retainedPlaybackWindows = append(retainedPlaybackWindows, window)
	if !sessionContinuousPreparationLocked() && len(retainedPlaybackWindows) > 2 {
		retirePlaybackWindowLocked(retainedPlaybackWindows[0])
		retainedPlaybackWindows = retainedPlaybackWindows[1:]
	}
}

func buildPlaybackWindow(window *playbackWindow, inputs *mediaInputCache, sources []string, candidates []AudioCandidate, policy AudioPolicy, alternatives ...[]AudioCandidate) {
	dir, err := os.MkdirTemp("", "anirium-"+window.ID+"-")
	if err != nil {
		finishPlaybackWindow(window, nil, nil, err)
		return
	}
	defer retireMediaDirectory(window.ctx, dir)()
	videoID := window.ID + "-video"
	workContext, cancelWork := context.WithCancel(window.ctx)
	defer cancelWork()
	type videoResult struct {
		runtime *variantRuntime
		err     error
	}
	videoDone := make(chan videoResult, 1)
	go func() {
		runtime, err := buildPlaybackWindowVideo(workContext, window, inputs, sources, dir)
		videoDone <- videoResult{runtime: runtime, err: err}
	}()
	runtimes := map[string]*variantRuntime{}
	tracks := make([]AudioTrack, len(candidates))
	var jobs sync.WaitGroup
	var resultsMu sync.Mutex
	for index, candidate := range candidates {
		jobs.Add(1)
		go func(index int, candidate AudioCandidate) {
			defer jobs.Done()
			id := fmt.Sprintf("%s-audio-%d", window.ID, index)
			track := AudioTrack{ID: id, Language: candidate.Language, Status: "stalled", ProcessingFailed: true}
			releaseSlot, err := acquireMediaSlot(workContext, audioTranscodeSlots)
			if err != nil {
				tracks[index] = track
				return
			}
			defer releaseSlot()
			pool := []AudioCandidate{candidate}
			if len(alternatives) > 0 {
				pool = connectionAudioPool(candidate, alternatives[0])
			}
			config := audioOutputFor(candidate, policy)
			for rank, alternative := range pool {
				if workContext.Err() != nil {
					break
				}
				input, release, err := inputs.acquire(workContext, alternative.Source, index)
				if err != nil {
					continue
				}
				audioDir := filepath.Join(dir, fmt.Sprintf("audio-%d-%d", index, rank))
				err = transcodeAudioWindowWithOwnedSlot(workContext, input, audioDir, alternative.StreamIndex, config, window.Start, window.Duration)
				release()
				if err == nil {
					segments, complete, readErr := readGeneratedHLS(filepath.Join(audioDir, "index.m3u8"))
					if readErr == nil && complete && len(segments) > 0 {
						delivered, durationErr := windowSegmentDuration(segments)
						if durationErr != nil {
							continue
						}
						track.Status, track.ProcessingFailed, track.ProcessingComplete = "ready", false, true
						track.PlaylistURL = "/hls/" + id + "/index.m3u8"
						resultsMu.Lock()
						runtimes[id] = &variantRuntime{MixVariant: MixVariant{ID: id, Status: "ready", ProcessingComplete: true, BufferedSeconds: delivered}, Dir: audioDir}
						resultsMu.Unlock()
						break
					}
				}
			}
			tracks[index] = track
		}(index, candidate)
	}
	video := <-videoDone
	if video.err != nil {
		cancelWork()
	}
	jobs.Wait()
	if video.err != nil {
		finishPlaybackWindow(window, nil, tracks, video.err)
		return
	}
	runtimes[videoID] = video.runtime
	if !audioPlaybackReady(tracks) {
		finishPlaybackWindow(window, nil, tracks, fmt.Errorf("window audio unavailable"))
		return
	}
	if window.Audio != "" {
		if len(tracks) != 1 || tracks[0].Status != "ready" || runtimes[tracks[0].ID] == nil {
			finishPlaybackWindow(window, nil, tracks, fmt.Errorf("selected audio unavailable"))
			return
		}
		audio := runtimes[tracks[0].ID]
		combinedDir := filepath.Join(dir, "combined")
		if err := muxPlaybackWindow(workContext, video.runtime.Dir, audio.Dir, combinedDir, window.Start); err != nil {
			finishPlaybackWindow(window, nil, tracks, err)
			return
		}
		segments, _, _ := readGeneratedHLS(filepath.Join(combinedDir, "index.m3u8"))
		delivered, err := windowSegmentDuration(segments)
		if err != nil {
			finishPlaybackWindow(window, nil, tracks, err)
			return
		}
		video.runtime.Dir, video.runtime.BufferedSeconds, video.runtime.muxedAudio = combinedDir, delivered, true
		audio.Dir, audio.BufferedSeconds = combinedDir, delivered
	}
	finishPlaybackWindow(window, runtimes, tracks, nil)
}

// Audio and video retain their separate bounded worker pools. Their outputs
// join before publication; neither incomplete media nor retired work is served.
func buildPlaybackWindowVideo(ctx context.Context, window *playbackWindow, inputs *mediaInputCache, sources []string, dir string) (*variantRuntime, error) {
	videoDir := filepath.Join(dir, "video")
	var videoErr error = fmt.Errorf("no compatible video source")
	chosenSource := ""
	// Keep a stable source, with compatible-source fallback only on failure.
	for index, source := range sources {
		videoDir = filepath.Join(dir, fmt.Sprintf("video-%d", index))
		videoErr = runQueuedVideoInput(ctx, window.Quality, func() error {
			input, release, err := inputs.acquire(ctx, source, index)
			if err != nil {
				return err
			}
			defer release()
			if err := transcodeVideoWindowWithOwnedSlot(ctx, input, videoDir, window.Quality, window.Start, window.Duration); err != nil {
				return err
			}
			segments, complete, err := readGeneratedHLS(filepath.Join(videoDir, "index.m3u8"))
			if err != nil || !complete || len(segments) == 0 {
				return fmt.Errorf("source produced no complete window segments")
			}
			_, err = windowSegmentDuration(segments)
			return err
		})
		if videoErr == nil || ctx.Err() != nil {
			if videoErr == nil {
				chosenSource = source
			}
			break
		}
	}
	if videoErr != nil {
		return nil, videoErr
	}
	segments, complete, err := readGeneratedHLS(filepath.Join(videoDir, "index.m3u8"))
	if err != nil || !complete || len(segments) == 0 {
		return nil, fmt.Errorf("video window has no complete segments")
	}
	delivered, err := windowSegmentDuration(segments)
	if err != nil {
		return nil, err
	}
	return &variantRuntime{MixVariant: MixVariant{ID: window.ID + "-video", Quality: window.Quality, Status: "ready", ProcessingComplete: true, BufferedSeconds: delivered}, Dir: videoDir, videoSource: chosenSource}, nil
}

func finishPlaybackWindow(window *playbackWindow, runtimes map[string]*variantRuntime, tracks []AudioTrack, err error) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	if (currentPlaybackWindow != window && prefetchedPlaybackWindow != window) || window.ctx.Err() != nil {
		return
	}
	window.AudioTracks = tracks
	if err != nil {
		window.Status = "stalled"
		return
	}
	variantMu.Lock()
	for id, runtime := range runtimes {
		variantRuntimes[id] = runtime
	}
	variantMu.Unlock()
	window.Status = "ready"
	// Include intermediate outputs as well as the published muxed media.
	if video := runtimes[window.ID+"-video"]; video != nil {
		cacheErr := filepath.WalkDir(filepath.Dir(video.Dir), func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.Type().IsRegular() {
				info, statErr := entry.Info()
				if statErr != nil {
					return statErr
				}
				window.cacheBytes += info.Size()
			}
			return nil
		})
		if cacheErr != nil {
			window.Status = "stalled"
			return
		}
	}
	if video := runtimes[window.ID+"-video"]; video != nil {
		window.MuxedAudio = video.muxedAudio
		if segments, complete, readErr := readGeneratedHLS(filepath.Join(video.Dir, "index.m3u8")); readErr == nil && complete {
			window.videoSegmentCount = uint64(len(segments))
		}
		window.DeliveredDuration = video.BufferedSeconds
		window.EndOfEpisode = window.DeliveredDuration < window.Duration-0.05
		if window.EpisodeDuration > 0 {
			// A shorter completed final window is authoritative even when
			// container metadata slightly overestimates the episode duration.
			requestedFinal := window.Start+window.Duration >= window.EpisodeDuration-0.05
			window.EndOfEpisode = (window.EndOfEpisode && requestedFinal) || window.Start+window.DeliveredDuration >= window.EpisodeDuration-0.05
		}
	}
	window.PlaylistURL = "/hls/" + window.ID + "-video/master.m3u8"
	if sessionContinuousPreparationLocked() && !window.preparationStarted.IsZero() && !window.EndOfEpisode && window.DeliveredDuration >= 20 && time.Since(window.preparationStarted).Seconds() >= window.DeliveredDuration/2 {
		currentPlaybackSession.adaptiveReserve = true
		currentPlaybackSession.BufferSeconds = 60
	}
	window.ContinuousPlaylistURL = "/hls/" + window.timelineID + "-video/continuous-master.m3u8"
	window.audioSegmentCounts = map[string]uint64{}
	for id, runtime := range runtimes {
		identity := continuousWindowMediaID.FindStringSubmatch(id)
		if len(identity) != 2 || identity[1] == "video" {
			continue
		}
		if segments, complete, readErr := readGeneratedHLS(filepath.Join(runtime.Dir, "index.m3u8")); readErr == nil && complete {
			window.audioSegmentCounts[identity[1]] = uint64(len(segments))
		}
	}
}

func nextAudioPlaylistCursors(window *playbackWindow) map[string]slidingPlaylistCursor {
	result := map[string]slidingPlaylistCursor{}
	for suffix, count := range window.audioSegmentCounts {
		previous := window.audioPlaylistCursors[suffix]
		result[suffix] = slidingPlaylistCursor{MediaSequence: previous.MediaSequence + count, DiscontinuitySequence: previous.DiscontinuitySequence + 1}
	}
	return result
}

// Caller holds swarmMu. The reference file, not a release-title estimate,
// supplies the episode timeline. Zero explicitly means probing was inconclusive.
func playbackEpisodeDurationLocked() float64 {
	if len(activeLinks) == 0 {
		return 0
	}
	_, duration, valid := sourceTiming(probedFormats[activeLinks[0]])
	if !valid {
		return 0
	}
	return duration
}

func windowSegmentDuration(segments []hlsSegment) (float64, error) {
	var total float64
	for _, segment := range segments {
		seconds, err := strconv.ParseFloat(segment.duration, 64)
		if err != nil || seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
			return 0, fmt.Errorf("invalid window segment duration")
		}
		total += seconds
	}
	if total <= 0 || math.IsInf(total, 0) {
		return 0, fmt.Errorf("empty or invalid window")
	}
	return total, nil
}

func handlePlaybackWindow(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		quality, start, err := decodeWindowRequest(r.URL.Query())
		if err != nil {
			http.Error(w, "Invalid window request", http.StatusBadRequest)
			return
		}
		preparePlaybackMu.Lock()
		accepted := !playbackShuttingDown && requestPlaybackWindow(quality, start, r.URL.Query().Get("mode") == "prefetch")
		preparePlaybackMu.Unlock()
		if !accepted {
			http.Error(w, "Window not available", http.StatusConflict)
			return
		}
	} else if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "GET or POST required", http.StatusMethodNotAllowed)
		return
	}
	snapshot, exists := playbackWindowSnapshot(r.URL.Query().Get("mode") == "prefetch")
	if !exists {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodPost {
		w.WriteHeader(http.StatusAccepted)
	}
	_ = json.NewEncoder(w).Encode(snapshot)
}
