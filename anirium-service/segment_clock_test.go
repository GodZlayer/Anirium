package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSegmentClockRejectsInternalGapWithValidBeginning(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root := t.TempDir()
	generate := func(name, filter string) string {
		path := filepath.Join(root, name+".ts")
		args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=2", "-vf", filter, "-fps_mode", "passthrough", "-c:v", "libx264", "-bf", "0", "-f", "mpegts", path}
		if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), args...).CombinedOutput(); err != nil {
			t.Fatalf("fixture failed: %v %s", err, output)
		}
		return path
	}
	aligned := generate("aligned", "setpts=PTS")
	shifted := generate("internal-gap", "setpts=PTS+gte(T\\,1)/TB")
	firstPacket := func(path string) string {
		output, err := exec.CommandContext(ctx, mediaTool("ffprobe"), "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-read_intervals", "%+#1", "-of", "csv=p=0", path).Output()
		if err != nil {
			t.Fatal(err)
		}
		return strings.TrimSpace(string(output))
	}
	if firstPacket(aligned) != firstPacket(shifted) {
		t.Fatal("fixture does not preserve first packet PTS")
	}
	if _, err := segmentPacketPTS(ctx, aligned, "v:0"); err != nil {
		t.Fatalf("continuous segment rejected: %v", err)
	}
	if _, err := segmentPacketPTS(ctx, shifted, "v:0"); err == nil {
		t.Fatal("internal timestamp gap accepted")
	}
}

func TestIncrementalPublisherRejectsRealShiftedPacketClock(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	input := filepath.Join(root, "fixture.mp4")
	if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=24:duration=8", "-c:v", "libx264", input).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	alignedDir := filepath.Join(root, "aligned")
	aligned := hlsProducer{playlist: "source.m3u8", clockStream: "v:0", run: func(job context.Context, dir string) error {
		_, err := transcodeSourceToHLS(input, dir, "480p", job)
		return err
	}}
	if err := publishIncrementalHLS(ctx, alignedDir, []hlsProducer{aligned}, nil); err != nil {
		t.Fatalf("aligned packet clock rejected: %v", err)
	}
	alignedPlaylist, err := os.ReadFile(filepath.Join(alignedDir, "index.m3u8"))
	if err != nil || strings.Count(string(alignedPlaylist), "#EXTINF:") != 2 || !strings.Contains(string(alignedPlaylist), "#EXT-X-ENDLIST") {
		t.Fatalf("aligned media did not complete: err=%v playlist=%s", err, alignedPlaylist)
	}
	producer := hlsProducer{playlist: "validated.m3u8", clockStream: "v:0", run: func(job context.Context, dir string) error {
		segments, err := transcodeSourceToHLS(input, dir, "480p", job)
		if err != nil {
			return err
		}
		if len(segments) != 2 {
			t.Errorf("fixture segments=%d", len(segments))
			return context.Canceled
		}
		shifted := filepath.Join(dir, "shifted.ts")
		originalPTS, err := segmentPacketPTS(job, segments[1].path, "v:0")
		if err != nil {
			return err
		}
		if output, err := exec.CommandContext(job, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-itsoffset", "1", "-i", segments[1].path, "-c", "copy", "-copyts", "-mpegts_copyts", "1", shifted).CombinedOutput(); err != nil {
			t.Errorf("shift: %v %s", err, output)
			return err
		}
		shiftedPTS, err := segmentPacketPTS(job, shifted, "v:0")
		if err != nil {
			return err
		}
		if delta := shiftedPTS - originalPTS; delta < 0.9 || delta > 1.1 {
			t.Errorf("fixture did not shift packet clock: %.3f", delta)
			return context.Canceled
		}
		if err := os.Remove(segments[1].path); err != nil {
			return err
		}
		if err := os.Rename(shifted, segments[1].path); err != nil {
			return err
		}
		return os.Rename(filepath.Join(dir, "source.m3u8"), filepath.Join(dir, "validated.m3u8"))
	}}
	dir := filepath.Join(root, "output")
	if err := publishIncrementalHLS(ctx, dir, []hlsProducer{producer}, nil); err == nil {
		t.Fatal("shifted second segment certified a complete timeline")
	}
	playlist, err := os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(playlist), "#EXTINF:") != 1 || strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
		t.Fatalf("shifted media published: %s", playlist)
	}
}
