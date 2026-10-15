package main

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func alignmentFixture(offset, drift float64, cut bool) string {
	var out strings.Builder
	out.WriteString("WEBVTT\n\n")
	for index := 0; index < 10; index++ {
		start := 30 + float64(index*20) + offset + float64(index)*drift
		if cut && index >= 5 {
			start += 4
		}
		stamp := func(value float64) string {
			ms := int(value * 1000)
			return fmt.Sprintf("00:%02d:%02d.%03d", ms/60000, (ms/1000)%60, ms%1000)
		}
		fmt.Fprintf(&out, "%s --> %s\nUnique dialogue sentence number %d\n\n", stamp(start), stamp(start+2), index)
	}
	return out.String()
}

func TestSubtitleAlignmentRequiresSharedContentAndStableTiming(t *testing.T) {
	ref := alignmentFixture(0, 0, false)
	if offset, ok := confidentSubtitleOffset(ref, alignmentFixture(3.5, 0, false)); !ok || offset != -3.5 {
		t.Fatalf("constant offset lost: %v %v", offset, ok)
	}
	for _, candidate := range []string{alignmentFixture(3.5, 0.1, false), alignmentFixture(3.5, 0, true), strings.ReplaceAll(ref, "Unique dialogue", "Different speech"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nToo few matches\n"} {
		if _, ok := confidentSubtitleOffset(ref, candidate); ok {
			t.Fatal("unverified drift/cut/different or sparse dialogue auto-aligned")
		}
	}
}

func TestVerifiedOffsetRewritesWholeSubtitleAndPreservesPayload(t *testing.T) {
	reference := alignmentFixture(0, 0, false)
	candidate := alignmentFixture(3.5, 0, false)
	offset, ok := confidentSubtitleOffset(reference, candidate)
	if !ok {
		t.Fatal("fixture alignment rejected")
	}
	adjusted, ok := shiftCompleteWebVTT(candidate, offset)
	if !ok || !reflect.DeepEqual(subtitleAlignmentAnchors(adjusted), subtitleAlignmentAnchors(reference)) {
		t.Fatal("whole subtitle did not return to reference clock")
	}
	settings := "WEBVTT\n\ncue-id\n00:00:02.000 --> 00:00:04.000 align:start\n<i>Speech preserved</i>\n"
	shifted, ok := shiftCompleteWebVTT(settings, 1)
	if !ok || !strings.Contains(shifted, "00:03.000 --> 00:05.000 align:start") || !strings.Contains(shifted, "cue-id") || !strings.Contains(shifted, "<i>Speech preserved</i>") {
		t.Fatal("cue payload/settings changed")
	}
	if unchanged, ok := shiftCompleteWebVTT(settings, -3); ok || unchanged != settings {
		t.Fatal("negative cue start silently discarded")
	}
}
