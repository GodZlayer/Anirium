package main

import (
	"encoding/hex"
	"math"
	"strconv"
	"strings"
)

// Protected by swarmMu. Metadata compatibility does not prove edit identity;
// segment recovery retains its content/clock checks.
var probedFormats = map[string]ffprobeOutput{}

func existingVideoQualities(streams []ffprobeStream) []string {
	for _, stream := range streams {
		if stream.CodecType == "video" && stream.Disposition.AttachedPic == 0 {
			if quality := qualityForHeight(stream.Height); quality != "unknown" {
				return []string{quality}
			}
			return nil
		}
	}
	return nil
}

func sourceTiming(probe ffprobeOutput) (float64, float64, bool) {
	duration, err := strconv.ParseFloat(probe.Format.Duration, 64)
	start, startErr := strconv.ParseFloat(probe.Format.StartTime, 64)
	if probe.Format.StartTime == "" {
		start, startErr = 0, nil
	}
	return start, duration, err == nil && startErr == nil && duration > 0 && !math.IsNaN(duration) && !math.IsInf(duration, 0) && !math.IsNaN(start) && !math.IsInf(start, 0)
}

func compatibleSourceSet(sources []string, probes map[string]ffprobeOutput) []string {
	var selected []string
	var reference ffprobeOutput
	for _, source := range sources {
		probe, found := probes[source]
		if !found || len(existingVideoQualities(probe.Streams)) == 0 {
			continue
		}
		if len(selected) == 0 {
			selected, reference = append(selected, source), probe
			continue
		}
		start, duration, valid := sourceTiming(probe)
		refStart, refDuration, refValid := sourceTiming(reference)
		if valid && refValid && math.Abs(start-refStart) <= 0.05 && math.Abs(duration-refDuration) <= 0.25 {
			selected = append(selected, source)
		}
	}
	return selected
}

func freezeCompatibleSourceSetLocked() {
	activeLinks = compatibleSourceSet(activeLinks, probedFormats)
	externalSubtitles = subtitlesForSourceSet(externalSubtitles, activeTorrentHashes(activeLinks))
	currentMixQualities = nil
	for _, source := range activeLinks {
		for _, quality := range existingVideoQualities(probedStreams[source]) {
			if !containsString(currentMixQualities, quality) {
				currentMixQualities = append(currentMixQualities, quality)
			}
		}
	}
	// Rebuild legacy language telemetry from the filtered real inventory too;
	// probing excluded sources must not leave phantom subtitle options behind.
	currentMixSubs = nil
	for _, track := range subtitleTracksLocked() {
		if !containsString(currentMixSubs, track.Language) {
			currentMixSubs = append(currentMixSubs, track.Language)
		}
	}
}

// Caller holds swarmMu after all discovery probes have returned. Retiring
// readers may still own a rejected swarm, so retain those until retirement.
func releaseExcludedSourceTorrentsLocked() {
	retained := make([]string, 0, len(activeLinks))
	for _, source := range activeLinks {
		retained = append(retained, resolveMediaSource(source).Magnet)
	}
	for _, job := range retiringPlaybacks {
		retained = append(retained, job.magnets...)
	}
	dropPlaybackTorrents(torrentClient, unretainedMagnets(playbackMagnets, retained))
}

func requiredCurrentPlaybackMagnetsLocked() []string {
	if !playbackDiscoveryComplete {
		return append([]string(nil), playbackMagnets...)
	}
	retained := make([]string, 0, len(activeLinks))
	for _, source := range activeLinks {
		retained = append(retained, resolveMediaSource(source).Magnet)
	}
	return retained
}

// An explicit release binding must match the selected set. Legacy episode-only
// results remain available, but this does not certify their timing compatibility.
func subtitlesForSourceSet(subtitles []ProviderSubtitle, hashes map[string]bool) []ProviderSubtitle {
	result := make([]ProviderSubtitle, 0, len(subtitles))
	for _, subtitle := range subtitles {
		hash := strings.ToLower(strings.TrimSpace(subtitle.InfoHash))
		if hash != "" {
			decoded, err := hex.DecodeString(hash)
			if err != nil || len(decoded) != 20 || !hashes[hash] {
				continue
			}
		}
		result = append(result, subtitle)
	}
	return result
}
