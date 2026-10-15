package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixtureEventSegments(ctx context.Context, dir string, contents []string, complete bool) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	segments := []hlsSegment{}
	for index, content := range contents {
		path := filepath.Join(dir, fmt.Sprintf("segment-%06d.ts", index))
		if err := os.WriteFile(path, []byte(content), 0600); err != nil {
			return err
		}
		segments = append(segments, hlsSegment{path: path, duration: "4", size: int64(len(content))})
	}
	return publishEventPlaylist(ctx, dir, segments, complete)
}

func TestIncrementalMixPublishesImmutablePrefixThenRecoversWithAnotherSource(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	dir := t.TempDir()
	release := make(chan struct{})
	first := make(chan hlsProgress, 8)
	finished := make(chan error, 1)
	producers := []hlsProducer{
		{source: "original", inputStream: "0:V:0", playlist: "index.m3u8", run: func(ctx context.Context, source string) error {
			if err := fixtureEventSegments(ctx, source, []string{"first source"}, false); err != nil {
				return err
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-release:
				return fmt.Errorf("source unavailable after prefix")
			}
		}},
		{source: "recovery", inputStream: "0:V:0", playlist: "index.m3u8", run: func(ctx context.Context, source string) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-release:
			}
			return fixtureEventSegments(ctx, source, []string{"x", "fallback second segment"}, true)
		}},
	}
	go func() {
		finished <- publishIncrementalHLS(ctx, dir, producers, func(state hlsProgress) { first <- state })
	}()
	var initial hlsProgress
	select {
	case initial = <-first:
	case <-ctx.Done():
		t.Fatal("first media not published")
	}
	if initial.complete || initial.bufferedSeconds != 4 || initial.bandwidth <= 0 {
		t.Fatalf("initial progress: %+v", initial)
	}
	if len(initial.provenance) != 1 || initial.provenance[0].source != "original" || initial.provenance[0].start != 0 {
		t.Fatalf("initial interval lost its source: %+v", initial.provenance)
	}
	playlist, err := os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if err != nil || strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
		t.Fatalf("premature completion: %s %v", playlist, err)
	}
	close(release)
	select {
	case err := <-finished:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("fallback stalled")
	}
	var final hlsProgress
	for len(first) > 0 {
		final = <-first
	}
	if len(final.provenance) != 2 || final.provenance[1].source != "recovery" || final.provenance[1].start != 4 || final.provenance[1].duration != 4 {
		t.Fatalf("recovered interval lost its source: %+v", final.provenance)
	}
	if len(initial.provenance) != 1 || initial.provenance[0].source != "original" {
		t.Fatal("later publication mutated the earlier provenance snapshot")
	}
	data, err := os.ReadFile(filepath.Join(dir, "segment-000000.ts"))
	if err != nil || string(data) != "first source" {
		t.Fatal("published prefix was rewritten with a later cheaper candidate")
	}
	data, err = os.ReadFile(filepath.Join(dir, "segment-000001.ts"))
	if err != nil || string(data) != "fallback second segment" {
		t.Fatal("fallback segment missing")
	}
	playlist, err = os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if err != nil || !strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
		t.Fatal("complete fallback not finalized")
	}
}

func TestFailedIncrementalPrefixCannotClaimCompleteEpisode(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	err := publishIncrementalHLS(ctx, dir, []hlsProducer{{playlist: "index.m3u8", run: func(ctx context.Context, source string) error {
		if err := fixtureEventSegments(ctx, source, []string{"valid prefix"}, false); err != nil {
			return err
		}
		return fmt.Errorf("missing rest of episode")
	}}}, nil)
	if err == nil {
		t.Fatal("failed prefix accepted as complete")
	}
	playlist, _ := os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
		t.Fatal("truncated film falsely finalized")
	}
}

func TestIncrementalCancellationWaitsForProducers(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	started, stopped := make(chan struct{}), make(chan struct{})
	go func() { <-started; cancel() }()
	err := publishIncrementalHLS(ctx, t.TempDir(), []hlsProducer{{playlist: "index.m3u8", run: func(ctx context.Context, _ string) error {
		close(started)
		<-ctx.Done()
		close(stopped)
		return ctx.Err()
	}}}, nil)
	if err == nil {
		t.Fatal("cancellation accepted as complete")
	}
	select {
	case <-stopped:
	default:
		t.Fatal("publisher returned while its producer was still active")
	}
}

func TestGeneratedPlaylistRejectsEscapesAndInvalidDurations(t *testing.T) {
	for _, line := range []string{"#EXTINF:NaN,\nsegment.ts", "#EXTINF:4,\n../outside.ts", "#EXTINF:7,\nsegment.ts"} {
		path := filepath.Join(t.TempDir(), "source.m3u8")
		if err := os.WriteFile(path, []byte("#EXTM3U\n"+line+"\n"), 0600); err != nil {
			t.Fatal(err)
		}
		if _, _, err := readGeneratedHLS(path); err == nil {
			t.Fatal("unsafe source playlist accepted")
		}
	}
}

func TestIncrementalMixRejectsCumulativeTimelineShift(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	longer := make(chan struct{})
	publishedCount := 0
	dir := t.TempDir()
	producers := []hlsProducer{
		{playlist: "index.m3u8", run: func(ctx context.Context, source string) error {
			if err := fixtureEventSegments(ctx, source, []string{"baseline", "short tail"}, false); err != nil {
				return err
			}
			segments, _, err := readGeneratedHLS(filepath.Join(source, "index.m3u8"))
			if err != nil {
				return err
			}
			segments[1].duration = "2"
			return publishEventPlaylist(ctx, source, segments, true)
		}},
		{playlist: "index.m3u8", run: func(ctx context.Context, source string) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-longer:
			}
			return fixtureEventSegments(ctx, source, []string{"same start", "four second cut", "starts at eight, not six"}, true)
		}},
	}
	err := publishIncrementalHLS(ctx, dir, producers, func(state hlsProgress) {
		publishedCount++
		if publishedCount == 2 {
			close(longer)
		}
	})
	if err == nil {
		t.Fatal("shifted source falsely completed a mixed timeline")
	}
	playlist, _ := os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if strings.Contains(string(playlist), "#EXT-X-ENDLIST") || strings.Contains(string(playlist), "segment-000002.ts") {
		t.Fatal("shifted segment was published")
	}
}
