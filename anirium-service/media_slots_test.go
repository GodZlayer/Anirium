package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestProductionTranscodersCancelWhileQueuedWithoutCreatingOutput(t *testing.T) {
	for _, audio := range []bool{false, true} {
		name := "video"
		slots := videoTranscodeSlots
		if audio {
			name, slots = "audio", audioTranscodeSlots
		}
		t.Run(name, func(t *testing.T) {
			for index := 0; index < cap(slots); index++ {
				slots <- struct{}{}
			}
			defer func() {
				for index := 0; index < cap(slots); index++ {
					<-slots
				}
			}()
			ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
			defer cancel()
			dir := filepath.Join(t.TempDir(), "must-not-exist")
			var err error
			if audio {
				err = transcodeAudioToHLS(ctx, "unavailable-input", dir, 0)
			} else {
				_, err = transcodeSourceToHLS("unavailable-input", dir, "360p", ctx)
			}
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("queued conversion did not cancel: %v", err)
			}
			if _, err := os.Stat(dir); !os.IsNotExist(err) {
				t.Fatal("queued conversion created output before capacity was available")
			}
			if len(slots) != cap(slots) {
				t.Fatal("queued conversion leaked capacity")
			}
		})
	}
}

func TestTranscodeThreadOptionsBoundInputAndOutput(t *testing.T) {
	args := []string{"-i", "input", "-c:v", "libx264", "output"}
	want := []string{"-threads", "2", "-filter_threads", "1", "-i", "input", "-c:v", "libx264", "-threads", "2", "output"}
	if got := boundedTranscodeArgs(args, "2"); !reflect.DeepEqual(got, want) {
		t.Fatalf("incorrect option scope: %v", got)
	}
	if args[0] != "-i" || args[len(args)-1] != "output" {
		t.Fatal("caller arguments mutated")
	}
}

func TestMediaSlotsBoundWorkAndReserveIndependentAudioCapacity(t *testing.T) {
	video := make(chan struct{}, 1)
	audio := make(chan struct{}, 1)
	releaseVideo, err := acquireMediaSlot(context.Background(), video)
	if err != nil {
		t.Fatal(err)
	}
	defer releaseVideo()
	releaseAudio, err := acquireMediaSlot(context.Background(), audio)
	if err != nil {
		t.Fatal("video blocked independent audio capacity")
	}
	releaseAudio()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := acquireMediaSlot(ctx, video); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("queued work ignored cancellation: %v", err)
	}
	if len(video) != 1 || len(audio) != 0 {
		t.Fatal("canceled work leaked a processing slot")
	}
}
