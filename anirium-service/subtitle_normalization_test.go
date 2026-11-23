package main

import (
	"strings"
	"testing"
)

func TestWebVTTWindowNormalization(t *testing.T) {
	input := "WEBVTT\r\n\r\nNOTE preserve\r\nmetadata\r\n\r\n00:00.000 --> 00:01.000\r\nold\r\n\r\n00:07.000 --> 00:09.000 align:start\r\noverlap\r\n\r\narbitrary-id\r\n00:10.000 --> 00:11.000 position:50%\r\n123\r\n  text\r\n\r\n01:07.000 --> 01:09.000\r\ntail\r\n\r\n01:08.000 --> 01:09.000\r\noutside\r\n"
	got, err := normalizeWebVTT(input, 8)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"NOTE preserve\nmetadata", "00:00.000 --> 00:01.000 align:start\noverlap", "arbitrary-id\n00:02.000 --> 00:03.000 position:50%\n123\n  text", "00:59.000 --> 01:00.000\ntail"} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in %s", want, got)
		}
	}
	if strings.Contains(got, "old") || strings.Contains(got, "outside") {
		t.Fatalf("out of window cues: %s", got)
	}
	full, err := normalizeWebVTT(input, -1)
	if err != nil || full != input {
		t.Fatal("full track changed")
	}
	empty, err := normalizeWebVTT("WEBVTT\n\n", 8)
	if err != nil || empty != "WEBVTT\n\n" {
		t.Fatalf("empty window: %q %v", empty, err)
	}
	for _, stamp := range []string{"00:61.000", "00:01.12", "00:00:-1.000", "garbage"} {
		if _, err := parseWebVTTMillis(stamp); err == nil {
			t.Fatalf("accepted %q", stamp)
		}
	}
}

func TestWebVTTWindowNormalizationToleratesZeroDurationAndMultiParagraphCues(t *testing.T) {
	input := "WEBVTT\n\n04:05.000 --> 04:05.000\nzero-duration sign\n\n04:10.000 --> 04:14.000\nTop sign\n\nBottom dialogue\n\n05:00.000 --> 05:00.000\nboundary clamp\n"
	got, err := normalizeWebVTT(input, 240)
	if err != nil {
		t.Fatalf("normalizeWebVTT failed on zero-duration/multi-paragraph cue: %v", err)
	}
	if !strings.Contains(got, "00:10.000 --> 00:14.000\nTop sign\nBottom dialogue") {
		t.Fatalf("expected preserved multi-paragraph cue at 240s offset, got:\n%s", got)
	}
	cues, err := parseBundleCues(got, 240)
	if err != nil || len(cues) != 1 || cues[0].Start != 250 || cues[0].End != 254 {
		t.Fatalf("unexpected parsed cues: err=%v cues=%+v", err, cues)
	}
}
