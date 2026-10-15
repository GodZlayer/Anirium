package main

import "testing"

func TestAudioPolicySelectsOneAllowedTrackPerLanguage(t *testing.T) {
	candidates := []AudioCandidate{
		{Language: "por", Source: "small", Codec: "aac", BitRate: 128000, Channels: 2, SampleRate: 48000},
		{Language: "por", Source: "better", Codec: "aac", BitRate: 256000, Channels: 2, SampleRate: 48000},
		{Language: "por", Source: "too-heavy", Codec: "flac", BitRate: 1500000, Channels: 6, SampleRate: 96000},
		{Language: "eng", Source: "english", Codec: "aac", BitRate: 192000, Channels: 2, SampleRate: 48000},
		{Language: "jpn", Source: "unknown-bitrate", Codec: "aac", Channels: 2},
	}
	selected := selectAudioCandidates(candidates, AudioPolicy{MaxBitRate: 320000, MaxChannels: 2, MaxSampleRate: 48000})
	if len(selected) != 2 || selected[0].Source != "better" || selected[1].Source != "english" {
		t.Fatalf("unexpected selection: %+v", selected)
	}
	unrestricted := selectAudioCandidates(candidates, AudioPolicy{})
	if unrestricted[0].Source != "too-heavy" {
		t.Fatal("highest quality allowed was not preferred")
	}
}

func TestAudioInventoryUsesContainerLanguageAndExactIndex(t *testing.T) {
	stream := ffprobeStream{Index: 7, CodecType: "audio", CodecName: "aac", Channels: 2, BitRate: "192000", SampleRate: "48000"}
	stream.Tags.Language = "pt-BR"
	stream.Tags.Title = "Misleading English Release"
	candidates := audioCandidates([]string{"source"}, map[string][]ffprobeStream{"source": {stream, {Index: 8, CodecType: "video"}}})
	if len(candidates) != 1 || candidates[0].Language != "por" || candidates[0].StreamIndex != 7 || candidates[0].BitRate != 192000 {
		t.Fatalf("bad inventory: %+v", candidates)
	}
}
