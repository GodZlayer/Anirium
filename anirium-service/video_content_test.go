package main

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestVideoSignatureQueueIsCancelable(t *testing.T) {
	videoSignatureSlots <- struct{}{}
	videoSignatureSlots <- struct{}{}
	defer func() { <-videoSignatureSlots; <-videoSignatureSlots }()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := videoContentSignature(ctx, "must-not-start-decoder"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("queued validation ignored cancellation: %v", err)
	}
}

func TestVideoMixerRejectsDifferentContentWhenRecoveringMissingSegment(t *testing.T) {
	t.Run("different-edit", func(t *testing.T) { verifyVideoRecoveryContent(t, "white", false) })
	t.Run("matching-edit", func(t *testing.T) { verifyVideoRecoveryContent(t, "black", true) })
}

func verifyVideoRecoveryContent(t *testing.T, alternativeColor string, wantComplete bool) {
	verifyVideoRecoveryPrefix(t, "color="+alternativeColor+":size=160x120:rate=24:duration=8", 8, 1, wantComplete)
}

func TestVideoRecoveryRejectsEarlierDifferentEditDespiteMatchingLastOverlap(t *testing.T) {
	verifyVideoRecoveryPrefix(t, "color=black:size=160x120:rate=24:duration=12,drawbox=color=white:t=fill:enable='lt(t,4)'", 12, 2, false)
}

func verifyVideoRecoveryPrefix(t *testing.T, alternativeFilter string, duration, prefix int, wantComplete bool) {
	t.Helper()
	root := t.TempDir()
	ctx := context.Background()
	inputs := []string{filepath.Join(root, "reference.mp4"), filepath.Join(root, "other-edit.mp4")}
	for index, filter := range []string{fmt.Sprintf("color=black:size=160x120:rate=24:duration=%d", duration), alternativeFilter} {
		output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-c:v", "libx264", inputs[index]).CombinedOutput()
		if err != nil {
			t.Fatalf("fixture: %v %s", err, output)
		}
	}
	producers := []hlsProducer{}
	prefixPublished := make(chan struct{})
	var signal sync.Once
	for index, input := range inputs {
		producers = append(producers, hlsProducer{playlist: "index.m3u8", clockStream: "v:0", preference: index, run: func(job context.Context, dir string) error {
			if index == 1 {
				select {
				case <-prefixPublished:
				case <-job.Done():
					return job.Err()
				}
			}
			segments, err := transcodeSourceToHLS(input, dir, "120p", job)
			if err != nil {
				return err
			}
			if index == 0 {
				if err := publishEventPlaylist(job, dir, segments[:prefix], false); err != nil {
					return err
				}
				return fmt.Errorf("reference unavailable after prefix")
			}
			return publishEventPlaylist(job, dir, segments, true)
		}})
	}
	dir := filepath.Join(root, "mixed")
	err := publishIncrementalHLS(ctx, dir, producers, func(hlsProgress) { signal.Do(func() { close(prefixPublished) }) })
	if (err == nil) != wantComplete {
		t.Fatalf("recovery completion=%t, want=%t: %v", err == nil, wantComplete, err)
	}
	segments, complete, readErr := readGeneratedHLS(filepath.Join(dir, "index.m3u8"))
	wantSegments := prefix
	if wantComplete {
		wantSegments = duration / 4
	}
	if readErr != nil || complete != wantComplete || len(segments) != wantSegments {
		t.Fatalf("incompatible recovery published: segments=%d complete=%t err=%v", len(segments), complete, readErr)
	}
}

func TestDecodedVideoSignatureDistinguishesContentWithSameTimeline(t *testing.T) {
	root := t.TempDir()
	makeSignature := func(name, filter, quality string) []byte {
		path := filepath.Join(root, name+".mp4")
		output, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-t", "2", "-c:v", "libx264", "-crf", quality, path).CombinedOutput()
		if err != nil {
			t.Fatalf("fixture: %v %s", err, output)
		}
		signature, err := videoContentSignature(context.Background(), path)
		if err != nil {
			t.Fatal(err)
		}
		return signature
	}
	a := makeSignature("reference", "testsrc2=size=320x240:rate=24", "18")
	b := makeSignature("compressed", "testsrc2=size=320x240:rate=24", "30")
	c := makeSignature("different-edit", "color=white:size=320x240:rate=24", "18")
	if !matchingVideoContent(a, b) {
		t.Fatal("different encoding of matching content rejected")
	}
	if matchingVideoContent(a, c) {
		t.Fatal("different content with equal duration accepted")
	}
	if matchingVideoContent(a, nil) {
		t.Fatal("missing evidence accepted")
	}
	red := makeSignature("red", "color=0x600000:size=320x240:rate=24", "18")
	blue := makeSignature("blue", "color=0x0000ff:size=320x240:rate=24", "18")
	if matchingVideoContent(red, blue) {
		t.Fatal("similar luminance concealed different color content")
	}
}
