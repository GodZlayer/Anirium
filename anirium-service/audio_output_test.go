package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestRealAudioOutputHonorsFormatAndReducesSegmentWeight(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "authorized-generated-noise.flac")
	if output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anoisesrc=sample_rate=48000:duration=8:seed=42", "-ac", "2", "-c:a", "flac", input).CombinedOutput(); err != nil {
		t.Fatalf("fixture failed: %v %s", err, output)
	}
	segmentBytes := func(name string, bitrate int64) int64 {
		dir := filepath.Join(root, name)
		config := audioOutputFor(AudioCandidate{Codec: "flac", Channels: 2, SampleRate: 44100}, AudioPolicy{MaxBitRate: bitrate})
		if err := transcodeAudioToHLS(context.Background(), input, dir, 0, config); err != nil {
			t.Fatal(err)
		}
		playlist := filepath.Join(dir, "index.m3u8")
		output, err := exec.Command(mediaTool("ffprobe"), "-v", "error", "-show_streams", "-of", "json", playlist).Output()
		if err != nil {
			t.Fatal(err)
		}
		var probe ffprobeOutput
		if json.Unmarshal(output, &probe) != nil || len(probe.Streams) != 1 {
			t.Fatalf("unexpected output streams: %s", output)
		}
		stream := probe.Streams[0]
		if stream.CodecName != "aac" || stream.Channels != 2 || stream.SampleRate != "44100" {
			t.Fatalf("output format ignored: %+v", stream)
		}
		if output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", playlist, "-f", "null", "-").CombinedOutput(); err != nil {
			t.Fatalf("output cannot decode: %v %s", err, output)
		}
		files, err := filepath.Glob(filepath.Join(dir, "audio-*.ts"))
		if err != nil || len(files) == 0 {
			t.Fatal("no audio segments produced")
		}
		var total int64
		for _, file := range files {
			info, err := os.Stat(file)
			if err != nil {
				t.Fatal(err)
			}
			total += info.Size()
		}
		return total
	}
	low, high := segmentBytes("low", 64000), segmentBytes("high", 256000)
	segmentBytes("restricted", 16000)
	if high <= low*2 {
		t.Fatalf("bitrate reduction not reflected in delivered segments: low=%d high=%d", low, high)
	}
}

func TestAudioOutputUsesInputAndConnectionConstraints(t *testing.T) {
	candidate := AudioCandidate{Codec: "flac", Channels: 6, SampleRate: 96000}
	config := audioOutputFor(candidate, AudioPolicy{})
	if config.Channels != 6 || config.BitRate != 960000 || config.SampleRate != 48000 {
		t.Fatalf("layout/quality lost: %+v", config)
	}
	limited := audioOutputFor(candidate, AudioPolicy{MaxBitRate: 128000})
	if limited.BitRate != 128000 || limited.Channels != 6 {
		t.Fatalf("budget ignored: %+v", limited)
	}
	compressed := audioOutputFor(AudioCandidate{Codec: "aac", Channels: 2, SampleRate: 44100, BitRate: 192000}, AudioPolicy{})
	if compressed.BitRate != 192000 || compressed.SampleRate != 44100 {
		t.Fatalf("unnecessary output expansion: %+v", compressed)
	}
}

func TestAudioOutputNormalizesAACFormatWithoutExceedingBitrateBudget(t *testing.T) {
	candidate := AudioCandidate{Codec: "flac", Channels: 64, SampleRate: 47999}
	config := audioOutputFor(candidate, AudioPolicy{MaxChannels: 2, MaxSampleRate: 30000, MaxBitRate: 16000})
	if config.Channels != 2 || config.SampleRate != 24000 || config.BitRate != 16000 {
		t.Fatalf("output constraints ignored: %+v", config)
	}
	if config := audioOutputFor(candidate, AudioPolicy{}); config.Channels != 8 || config.SampleRate != 44100 {
		t.Fatalf("invalid AAC format retained: %+v", config)
	}
}
