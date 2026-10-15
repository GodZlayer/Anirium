package main

import (
	"sort"
	"strconv"
	"strings"
)

type AudioPolicy struct {
	MaxBitRate    int64
	MaxChannels   int
	MaxSampleRate int64
}

// Protected by swarmMu; input selection for the audio media workers.
var selectedAudioCandidates []AudioCandidate
var selectedAudioPolicy AudioPolicy // protected by swarmMu; fixed for the current preparation
var audioSelectionFrozen bool       // published track IDs must retain their language and layout

// Caller holds swarmMu. Collect inventory freely before producers start, but
// never replace a published track's meaning during later probing.
func refreshAudioSelectionLocked() {
	if audioSelectionFrozen {
		return
	}
	selectedAudioPolicy = connectionAudioPolicy(observedTransferCapacity)
	selectedAudioCandidates = selectConnectionAudioCandidates(audioCandidates(activeLinks, probedStreams), selectedAudioPolicy)
	selectedAudioPolicy = sharedAudioPolicy(selectedAudioPolicy, len(selectedAudioCandidates))
	currentMixAudios = nil
	for _, candidate := range selectedAudioCandidates {
		currentMixAudios = append(currentMixAudios, candidate.Language)
	}
}

// All language outputs are produced concurrently. The measured audio budget
// belongs to the preparation, not independently to every language.
func sharedAudioPolicy(policy AudioPolicy, tracks int) AudioPolicy {
	if policy.MaxBitRate > 0 && tracks > 1 {
		policy.MaxBitRate /= int64(tracks)
		if policy.MaxBitRate < 1 {
			policy.MaxBitRate = 1
		}
	}
	return policy
}

func connectionAudioPolicy(capacity transferCapacity) AudioPolicy {
	if capacity.Samples < 3 || capacity.BytesPerSecond <= 0 {
		return AudioPolicy{}
	}
	// Reserve most observed payload throughput for video and scheduling overhead.
	// This is a preparation-time budget, not a guarantee of future network speed.
	return AudioPolicy{MaxBitRate: int64(capacity.BytesPerSecond * 8 * 0.2)}
}

func selectConnectionAudioCandidates(candidates []AudioCandidate, policy AudioPolicy) []AudioCandidate {
	// Source quality and delivered bitrate are different constraints. All
	// candidates are decoded and converted by audioOutputFor, including channel
	// and sample-rate normalization. Never discard a language or select an
	// inferior input solely because its original format exceeds the AAC budget.
	return selectAudioCandidates(candidates, AudioPolicy{})
}

func connectionAudioPool(preferred AudioCandidate, candidates []AudioCandidate) []AudioCandidate {
	// The budget describes delivered AAC, not the bitrate of demuxed inputs.
	// Every producer uses the same audioOutputFor configuration. Keep compatible
	// lossless/unknown-rate inputs available for recovery instead of dropping
	// them before their pieces can contribute. Input scheduling must account for
	// torrent transfer separately; source bitrate alone is not that measurement.
	return compatibleAudioPool(preferred, candidates)
}

type AudioCandidate struct {
	Commentary  bool
	Language    string
	Source      string
	StreamIndex int
	Codec       string
	BitRate     int64
	Channels    int
	SampleRate  int64
}

func compatibleAudioPool(preferred AudioCandidate, candidates []AudioCandidate) []AudioCandidate {
	pool := []AudioCandidate{preferred}
	seen := map[string]bool{fmtAudioKey(preferred): true}
	for _, candidate := range candidates {
		key := fmtAudioKey(candidate)
		if seen[key] || candidate.Language != preferred.Language || candidate.Commentary != preferred.Commentary || candidate.Channels != preferred.Channels || candidate.Channels <= 0 {
			continue
		}
		seen[key] = true
		pool = append(pool, candidate)
	}
	sort.SliceStable(pool[1:], func(i, j int) bool {
		a, b := pool[i+1], pool[j+1]
		if losslessAudio(a.Codec) != losslessAudio(b.Codec) {
			return losslessAudio(a.Codec)
		}
		if a.SampleRate != b.SampleRate {
			return a.SampleRate > b.SampleRate
		}
		return a.BitRate > b.BitRate
	})
	return pool
}

func fmtAudioKey(candidate AudioCandidate) string {
	return candidate.Source + "\x00" + strconv.Itoa(candidate.StreamIndex)
}

func audioCandidates(sources []string, streams map[string][]ffprobeStream) []AudioCandidate {
	result := []AudioCandidate{}
	for _, source := range sources {
		for _, stream := range streams[source] {
			if stream.CodecType != "audio" {
				continue
			}
			language := canonicalLanguage(stream.Tags.Language)
			if language == "" {
				language = "und"
			}
			bitrate, _ := strconv.ParseInt(stream.BitRate, 10, 64)
			sampleRate, _ := strconv.ParseInt(stream.SampleRate, 10, 64)
			if bitrate < 0 {
				bitrate = 0
			}
			if sampleRate < 0 {
				sampleRate = 0
			}
			result = append(result, AudioCandidate{Commentary: stream.Disposition.Comment != 0, Language: language, Source: source, StreamIndex: stream.Index, Codec: stream.CodecName, BitRate: bitrate, Channels: stream.Channels, SampleRate: sampleRate})
		}
	}
	return result
}

func losslessAudio(codec string) bool {
	switch codec {
	case "flac", "alac", "truehd", "mlp", "wavpack":
		return true
	}
	return strings.HasPrefix(codec, "pcm_")
}

// Policy is supplied by the media worker from its output/bandwidth constraints.
// No language is inferred from release titles. Ties preserve stable source order.
func selectAudioCandidates(candidates []AudioCandidate, policy AudioPolicy) []AudioCandidate {
	selected := []AudioCandidate{}
	positions := map[string]int{}
	for _, candidate := range candidates {
		if policy.MaxBitRate > 0 && (candidate.BitRate == 0 || candidate.BitRate > policy.MaxBitRate) {
			continue
		}
		if policy.MaxChannels > 0 && candidate.Channels > policy.MaxChannels {
			continue
		}
		if policy.MaxSampleRate > 0 && candidate.SampleRate > policy.MaxSampleRate {
			continue
		}
		position, exists := positions[candidate.Language]
		if !exists {
			positions[candidate.Language] = len(selected)
			selected = append(selected, candidate)
			continue
		}
		previous := selected[position]
		better := false
		if candidate.Commentary != previous.Commentary {
			better = !candidate.Commentary
		} else if losslessAudio(candidate.Codec) != losslessAudio(previous.Codec) {
			better = losslessAudio(candidate.Codec)
		} else if candidate.Channels != previous.Channels {
			better = candidate.Channels > previous.Channels
		} else if candidate.SampleRate != previous.SampleRate {
			better = candidate.SampleRate > previous.SampleRate
		} else {
			better = candidate.BitRate > previous.BitRate
		}
		if better {
			selected[position] = candidate
		}
	}
	return selected
}
