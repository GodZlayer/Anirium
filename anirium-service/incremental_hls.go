package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type hlsProducer struct {
	source      string
	inputStream string
	playlist    string
	clockStream string
	preference  int
	run         func(context.Context, string) error
}

func chooseProducerSegment(sources [][]hlsSegment, producers []hlsProducer, position int) (hlsSegment, bool) {
	bestPreference := int(^uint(0) >> 1)
	for index, source := range sources {
		if position < len(source) && source[position].size > 0 && producers[index].preference < bestPreference {
			bestPreference = producers[index].preference
		}
	}
	eligible := make([][]hlsSegment, len(sources))
	for index, source := range sources {
		if producers[index].preference == bestPreference {
			eligible[index] = source
		}
	}
	return chooseBestSegment(eligible, position)
}

type hlsProgress struct {
	provenance      []mediaSourceSpan
	bandwidth       int64
	bufferedSeconds float64
	sources         int
	complete        bool
}

// Output-relative provenance only: this is not a claim that an input edit has
// been aligned. Keep provider/source identities private to the Service.
type mediaSourceSpan struct {
	start, duration     float64
	source, inputStream string
}

// FFmpeg publishes source playlists only after their referenced temp segments
// have been renamed. Never admit partial files or arbitrary playlist paths.
func readGeneratedHLS(path string) ([]hlsSegment, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, false, err
	}
	if !strings.HasPrefix(string(data), "#EXTM3U") {
		return nil, false, fmt.Errorf("invalid source playlist")
	}
	var segments []hlsSegment
	var duration string
	ended := false
	for _, line := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#EXTINF:") {
			duration = strings.TrimSuffix(strings.TrimPrefix(line, "#EXTINF:"), ",")
			seconds, err := strconv.ParseFloat(duration, 64)
			if err != nil || math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds <= 0 || seconds > 6 {
				return nil, false, fmt.Errorf("invalid source segment duration")
			}
		} else if line == "#EXT-X-ENDLIST" {
			ended = true
		} else if line != "" && !strings.HasPrefix(line, "#") {
			if duration == "" || filepath.Base(line) != line || strings.ContainsAny(line, "\\/?#") || !strings.HasSuffix(line, ".ts") {
				return nil, false, fmt.Errorf("invalid source segment reference")
			}
			segmentPath := filepath.Join(filepath.Dir(path), line)
			info, err := os.Stat(segmentPath)
			if err != nil || info.Size() == 0 {
				return nil, false, fmt.Errorf("source segment unavailable")
			}
			segments = append(segments, hlsSegment{duration: duration, path: segmentPath, size: info.Size()})
			duration = ""
		}
	}
	if duration != "" {
		return nil, false, fmt.Errorf("incomplete source playlist entry")
	}
	return segments, ended, nil
}

func publishEventPlaylist(ctx context.Context, dir string, segments []hlsSegment, complete bool) error {
	var body strings.Builder
	body.WriteString("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXT-X-INDEPENDENT-SEGMENTS\n")
	for _, segment := range segments {
		fmt.Fprintf(&body, "#EXTINF:%s,\n%s\n", segment.duration, filepath.Base(segment.path))
	}
	if complete {
		body.WriteString("#EXT-X-ENDLIST\n")
	}
	pending := filepath.Join(dir, "index.m3u8.pending")
	if err := os.WriteFile(pending, []byte(body.String()), 0600); err != nil {
		return err
	}
	// A concurrent Windows playlist read can briefly deny replacement. Retry
	// the atomic rename; never truncate the currently published playlist.
	for attempt := 0; attempt < 10; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		err := os.Rename(pending, filepath.Join(dir, "index.m3u8"))
		if err == nil {
			return nil
		}
		if attempt == 9 {
			return err
		}
		timer := time.NewTimer(25 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return nil
}

// Transcode the provided normalized pool concurrently (up to four workers),
// but publish immutable closed segments as soon as they become available. A
// failed producer can supply a valid prefix; it cannot certify a complete film.
func publishIncrementalHLS(parent context.Context, dir string, producers []hlsProducer, progress func(hlsProgress)) error {
	if len(producers) == 0 {
		return fmt.Errorf("no HLS producers")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(parent)
	var workers sync.WaitGroup
	defer func() { cancel(); workers.Wait() }()
	type result struct {
		index int
		err   error
	}
	results := make(chan result, len(producers))
	jobs := make(chan int, len(producers))
	for index := range producers {
		jobs <- index
	}
	close(jobs)
	count := min(4, len(producers))
	for worker := 0; worker < count; worker++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := range jobs {
				if ctx.Err() != nil {
					return
				}
				err := producers[index].run(ctx, filepath.Join(dir, fmt.Sprintf("source-%d", index)))
				results <- result{index, err}
			}
		}()
	}
	finished, successful := make([]bool, len(producers)), make([]bool, len(producers))
	completed := 0
	published := []hlsSegment{}
	contributors := map[int]bool{}
	state := hlsProgress{}
	clockStarts := map[string]float64{}
	invalidClocks := map[string]bool{}
	contentSignatures := map[string][]byte{}
	contentMatches := func(a, b, stream string) bool {
		for _, path := range []string{a, b} {
			if _, known := contentSignatures[path]; !known {
				var signature []byte
				var err error
				if stream == "a:0" {
					signature, err = audioContentSignature(ctx, path)
				} else {
					signature, err = videoContentSignature(ctx, path)
				}
				if err != nil {
					contentSignatures[path] = nil
				} else {
					contentSignatures[path] = signature
				}
			}
		}
		if stream == "a:0" {
			return matchingAudioContent(contentSignatures[a], contentSignatures[b])
		}
		return matchingVideoContent(contentSignatures[a], contentSignatures[b])
	}
	lastVideoProducer := -1
	var clockOrigin float64
	clockEstablished := false
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		snapshots := make([][]hlsSegment, len(producers))
		maxObserved, maxComplete := 0, 0
		for index, producer := range producers {
			segments, ended, err := readGeneratedHLS(filepath.Join(dir, fmt.Sprintf("source-%d", index), producer.playlist))
			if err != nil {
				if finished[index] && successful[index] {
					return fmt.Errorf("completed producer has invalid media: %w", err)
				}
				continue
			}
			snapshots[index] = segments
			maxObserved = max(maxObserved, len(segments))
			if finished[index] && successful[index] {
				if !ended || len(segments) == 0 {
					return fmt.Errorf("producer completed without a full playlist")
				}
				maxComplete = max(maxComplete, len(segments))
			}
		}
		for len(published) < maxObserved {
			position := len(published)
			// Matching only the duration at this index is insufficient: a
			// shorter earlier cut shifts every later segment. Never switch to
			// a candidate whose cumulative start differs from our published PTS.
			for index, source := range snapshots {
				if position >= len(source) {
					continue
				}
				start := 0.0
				for _, previous := range source[:position] {
					seconds, _ := strconv.ParseFloat(previous.duration, 64)
					start += seconds
				}
				if math.Abs(start-state.bufferedSeconds) > 0.05 {
					snapshots[index][position].size = 0
				}
			}
			copied := false
			for {
				best, found := chooseProducerSegment(snapshots, producers, position)
				if !found {
					break
				}
				clockStream := ""
				producerIndex := -1
				for index, source := range snapshots {
					if position < len(source) && source[position].path == best.path {
						clockStream = producers[index].clockStream
						producerIndex = index
						break
					}
				}
				if (clockStream == "v:0" || clockStream == "a:0") && lastVideoProducer >= 0 && producerIndex != lastVideoProducer {
					compatible := false
					if position < len(snapshots[lastVideoProducer]) {
						compatible = contentMatches(best.path, snapshots[lastVideoProducer][position].path, clockStream)
					} else if position > 0 && position-1 < len(snapshots[producerIndex]) {
						compatible = true
					}
					// A matching final overlap can be a shared opening or recap.
					// Check the entire available published prefix before admitting
					// another edit, not just its most recent segment. Signatures
					// are cached and cancellation remains owned by this playback.
					for previous := 0; compatible && previous < position; previous++ {
						compatible = previous < len(snapshots[producerIndex]) && contentMatches(published[previous].path, snapshots[producerIndex][previous].path, clockStream)
					}
					if !compatible {
						snapshots[producerIndex][position].size = 0
						continue
					}
				}
				if clockStream != "" {
					pts, known := clockStarts[best.path]
					var clockErr error
					if invalidClocks[best.path] {
						clockErr = fmt.Errorf("previously rejected segment clock")
					} else if !known {
						pts, clockErr = segmentPacketPTS(ctx, best.path, clockStream)
						if clockErr == nil {
							clockStarts[best.path] = pts
						} else {
							invalidClocks[best.path] = true
						}
					}
					if clockErr != nil || (clockEstablished && math.Abs(pts-(clockOrigin+state.bufferedSeconds)) > 0.05) {
						for index := range snapshots {
							if position < len(snapshots[index]) && snapshots[index][position].path == best.path {
								snapshots[index][position].size = 0
							}
						}
						continue
					}
					if !clockEstablished {
						clockOrigin, clockEstablished = pts, true
					}
				}
				name := fmt.Sprintf("segment-%06d.ts", position)
				pending := filepath.Join(dir, name+".pending")
				final := filepath.Join(dir, name)
				err := copyFile(best.path, pending)
				if err == nil {
					err = os.Rename(pending, final)
				}
				for index := range snapshots {
					if position < len(snapshots[index]) && snapshots[index][position].path == best.path {
						if err != nil {
							snapshots[index][position].size = 0
						} else {
							contributors[index] = true
						}
					}
				}
				if err != nil {
					continue
				}
				best.path = final
				if clockStream == "v:0" || clockStream == "a:0" {
					lastVideoProducer = producerIndex
				}
				published = append(published, best)
				seconds, _ := strconv.ParseFloat(best.duration, 64)
				state.provenance = append(append([]mediaSourceSpan(nil), state.provenance...), mediaSourceSpan{
					start: state.bufferedSeconds, duration: seconds,
					source: producers[producerIndex].source, inputStream: producers[producerIndex].inputStream,
				})
				state.bufferedSeconds += seconds
				state.bandwidth = max(state.bandwidth, int64(math.Ceil(float64(best.size)*8/seconds)))
				state.sources = len(contributors)
				if err := publishEventPlaylist(ctx, dir, published, false); err != nil {
					return err
				}
				if progress != nil {
					progress(state)
				}
				copied = true
				break
			}
			if !copied {
				break
			}
		}
		if completed == len(producers) {
			if maxComplete == 0 || len(published) != maxComplete || maxObserved > maxComplete {
				return fmt.Errorf("no complete compatible media coverage")
			}
			if err := publishEventPlaylist(ctx, dir, published, true); err != nil {
				return err
			}
			state.complete = true
			if progress != nil {
				progress(state)
			}
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case result := <-results:
			finished[result.index], successful[result.index] = true, result.err == nil
			completed++
		case <-ticker.C:
		}
	}
}

func publishRuntimeProgress(ctx context.Context, id, playlist string, progress hlsProgress) {
	variantMu.Lock()
	defer variantMu.Unlock()
	if runtime, exists := variantRuntimes[id]; exists && ctx.Err() == nil {
		runtime.Status = "ready"
		runtime.PlaylistURL = "/hls/" + id + "/" + playlist
		runtime.Bandwidth = progress.bandwidth
		runtime.BufferedSeconds = progress.bufferedSeconds
		runtime.ProcessingComplete = progress.complete
		runtime.SourceCount = progress.sources
		runtime.provenance = append([]mediaSourceSpan(nil), progress.provenance...)
		if progress.complete {
			runtime.BufferPercent = 100
		}
	}
}
