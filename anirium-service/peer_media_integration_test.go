package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// All media is generated here. The test crosses real torrent transport and
// production media helpers, but does not claim authenticated browser playback,
// progressive delivery or compatibility between differently edited releases.
func TestPeerMediaProducesMixedVideoAudioAndSubtitleAlternatives(t *testing.T) {
	root := t.TempDir()
	srt := filepath.Join(root, "fixture.srt")
	if err := os.WriteFile(srt, []byte("1\n00:00:00,000 --> 00:00:04,000\nAuthorized peer media fixture\n"), 0600); err != nil {
		t.Fatal(err)
	}
	payloads := map[string][]byte{"Show S01E04.mkv": []byte("excluded episode")}
	for index, size := range []string{"854x480", "1280x720"} {
		name := fmt.Sprintf("Show S01E03 version-%d.mkv", index)
		path := filepath.Join(root, name)
		args := []string{"-hide_banner", "-loglevel", "error",
			"-f", "lavfi", "-i", "color=c=black:s=" + size + ":r=24",
			"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
			"-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000",
			"-i", srt, "-t", "8", "-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0", "-map", "3:s:0", "-map", "3:s:0",
			"-c:v", "libx264", "-threads:v", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-c:s", "srt",
			"-metadata:s:a:0", "language=jpn", "-metadata:s:a:1", "language=eng",
			"-metadata:s:s:0", "language=por", "-metadata:s:s:1", "language=por", path}
		if output, err := exec.Command(mediaTool("ffmpeg"), args...).CombinedOutput(); err != nil {
			t.Fatalf("generated media: %v %s", err, output)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		payloads[name] = data
	}
	testLocalTorrentPeerSources(t, payloads, func(ctx context.Context, cache *mediaInputCache, ids []string) {
		streams := map[string][]ffprobeStream{}
		probes := map[string]ffprobeOutput{}
		segments := make([][]hlsSegment, len(ids))
		subtitleCount := 0
		for index, id := range ids {
			probe, err := probeCachedInput(ctx, cache, id)
			if err != nil {
				t.Fatal(err)
			}
			streams[id] = probe.Streams
			probes[id] = probe
			if !videoSupportsQuality(probe.Streams, "480p") || videoSupportsQuality(probe.Streams, "1080p") {
				t.Fatalf("incorrect real video qualities: %+v", probe.Streams)
			}
			for _, stream := range probe.Streams {
				if stream.CodecType != "subtitle" {
					continue
				}
				text, err := extractCachedSubtitle(ctx, cache, id, stream.Index)
				if err != nil || canonicalLanguage(stream.Tags.Language) != "por" || !strings.Contains(text, "Authorized peer media fixture") {
					t.Fatalf("embedded subtitle alternative: %q %v", text, err)
				}
				subtitleCount++
			}
			input, release, err := cache.acquire(ctx, id, index)
			if err != nil {
				t.Fatal(err)
			}
			segments[index], err = transcodeSourceToHLS(input, filepath.Join(root, fmt.Sprintf("video-%d", index)), "480p", ctx)
			release()
			if err != nil || len(segments[index]) != 2 {
				t.Fatalf("video segments: %v %v", segments[index], err)
			}
		}
		if compatible := compatibleSourceSet(ids, probes); len(compatible) != len(ids) {
			t.Fatalf("real matching peer containers excluded by timing gate: %v", compatible)
		}
		if subtitleCount != 4 {
			t.Fatalf("same-language alternatives were lost: %d", subtitleCount)
		}
		selected := selectAudioCandidates(audioCandidates(ids, streams), AudioPolicy{})
		if len(selected) != 2 || selected[0].Language == selected[1].Language {
			t.Fatalf("expected one audio output per real language: %+v", selected)
		}
		for index, candidate := range selected {
			input, release, err := cache.acquire(ctx, candidate.Source, index)
			if err != nil {
				t.Fatal(err)
			}
			dir := filepath.Join(root, "audio-"+candidate.Language)
			err = transcodeAudioToHLS(ctx, input, dir, candidate.StreamIndex)
			release()
			if err != nil {
				t.Fatal(err)
			}
			assertPeerPlaylistDecodes(t, ctx, dir)
			frequency := map[string]int{"jpn": 440, "eng": 880}[candidate.Language]
			if frequency == 0 {
				t.Fatalf("unexpected audio language: %s", candidate.Language)
			}
			assertPeerAudioFrequency(t, ctx, dir, frequency)
		}
		// Force actual copy failure on opposite positions. The production mixer
		// must recover with a different source and publish a complete playlist.
		for _, segment := range []hlsSegment{segments[1][0], segments[0][1]} {
			if err := os.Remove(segment.path); err != nil {
				t.Fatal(err)
			}
		}
		mixed := filepath.Join(root, "mixed")
		if err := os.Mkdir(mixed, 0700); err != nil {
			t.Fatal(err)
		}
		if err := writeMixedPlaylist(ctx, mixed, segments); err != nil {
			t.Fatal(err)
		}
		for position := 0; position < 2; position++ {
			got, err := os.ReadFile(filepath.Join(mixed, fmt.Sprintf("segment-%06d.ts", position)))
			want, expectedErr := os.ReadFile(segments[position][position].path)
			if err != nil || expectedErr != nil || !bytes.Equal(got, want) {
				t.Fatalf("source transition at segment %d: %v %v", position, err, expectedErr)
			}
		}
		assertPeerPlaylistDecodes(t, ctx, mixed)
	}, newProgressiveMediaInputCache)
}

func assertPeerAudioFrequency(t *testing.T, ctx context.Context, dir string, expected int) {
	t.Helper()
	data, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", filepath.Join(dir, "index.m3u8"), "-t", "1", "-map", "0:a:0", "-ac", "1", "-ar", "8000", "-f", "s16le", "-").Output()
	if err != nil || len(data) < 15000 {
		t.Fatalf("decoded audio samples: bytes=%d error=%v", len(data), err)
	}
	// Distinct synthesized tones prove the requested container stream was mapped,
	// not merely that some audio playlist decodes successfully.
	crossings := 0
	for offset := 2; offset+1 < len(data); offset += 2 {
		previous := int16(binary.LittleEndian.Uint16(data[offset-2:]))
		current := int16(binary.LittleEndian.Uint16(data[offset:]))
		if previous <= 0 && current > 0 {
			crossings++
		}
	}
	measured := crossings * 8000 / (len(data) / 2)
	if measured < expected-10 || measured > expected+10 {
		t.Fatalf("wrong audio stream: frequency=%d expected=%d", measured, expected)
	}
}

func assertPeerPlaylistDecodes(t *testing.T, ctx context.Context, dir string) {
	t.Helper()
	if bandwidth, err := playlistBandwidth(dir); err != nil || bandwidth <= 0 {
		t.Fatalf("measured HLS bandwidth: %d %v", bandwidth, err)
	}
	if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-xerror", "-i", filepath.Join(dir, "index.m3u8"), "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("HLS decode: %v %s", err, output)
	}
}
