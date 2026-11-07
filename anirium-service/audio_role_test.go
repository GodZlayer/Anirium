package main

import (
	"context"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestAudioRoleComesFromContainerAndCannotReplaceMainTrack(t *testing.T) {
	var probe ffprobeOutput
	if err := json.Unmarshal([]byte(`{"streams":[{"index":1,"codec_type":"audio","codec_name":"flac","channels":2,"sample_rate":"48000","disposition":{"comment":1},"tags":{"language":"eng"}},{"index":2,"codec_type":"audio","codec_name":"aac","channels":2,"bit_rate":"128000","sample_rate":"48000","tags":{"language":"eng"}}]}`), &probe); err != nil {
		t.Fatal(err)
	}
	candidates := audioCandidates([]string{"fixture"}, map[string][]ffprobeStream{"fixture": probe.Streams})
	selected := selectAudioCandidates(candidates, AudioPolicy{})
	if len(selected) != 1 || selected[0].Commentary || selected[0].StreamIndex != 2 {
		t.Fatalf("high-quality commentary replaced main audio: %+v", selected)
	}
	pool := compatibleAudioPool(selected[0], candidates)
	if len(pool) != 1 || pool[0].Commentary {
		t.Fatal("commentary admitted as main-track recovery")
	}
}

func TestRealContainerCommentaryDoesNotBecomePreferredAudio(t *testing.T) {
	input := filepath.Join(t.TempDir(), "authorized-audio-roles.mkv")
	output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-f", "lavfi", "-i", "sine=frequency=880:duration=1",
		"-map", "0:a", "-map", "1:a", "-c:a:0", "flac", "-c:a:1", "aac",
		"-metadata:s:a:0", "language=eng", "-metadata:s:a:1", "language=eng",
		"-disposition:a:0", "comment", "-disposition:a:1", "default", input).CombinedOutput()
	if err != nil {
		t.Fatalf("role fixture failed: %v %s", err, output)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cache := newMediaInputCache(ctx, func(context.Context, string, int) (string, error) { return input, nil }, func(string) {})
	probe, err := probeCachedInput(ctx, cache, "roles")
	if err != nil || len(probe.Streams) != 2 || probe.Streams[0].Disposition.Comment != 1 {
		t.Fatalf("container role not discovered: %+v %v", probe, err)
	}
	selected := selectAudioCandidates(audioCandidates([]string{"roles"}, map[string][]ffprobeStream{"roles": probe.Streams}), AudioPolicy{})
	if len(selected) != 1 || selected[0].Commentary || selected[0].StreamIndex != probe.Streams[1].Index {
		t.Fatalf("real commentary selected instead of main audio: %+v", selected)
	}
}
