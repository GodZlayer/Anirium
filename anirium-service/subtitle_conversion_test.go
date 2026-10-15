package main

import (
	"context"
	"strings"
	"testing"
)

func TestSidecarConversionUsesRealMediaParser(t *testing.T) {
	input := []byte("1\r\n00:00:01,250 --> 00:00:02,750\r\nTest caption\r\n")
	text, err := convertSidecarVTT(context.Background(), input, ".srt")
	if err != nil || !strings.Contains(text, "00:01.250 --> 00:02.750") || !strings.Contains(text, "Test caption") {
		t.Fatalf("conversion: %q %v", text, err)
	}
	if _, err := convertSidecarVTT(context.Background(), []byte("not a subtitle"), ".srt"); err == nil {
		t.Fatal("invalid subtitle accepted")
	}
}

func TestASSConversionPreservesTimingAndMultilineText(t *testing.T) {
	input := []byte("[Script Info]\nScriptType: v4.00+\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.25,0:00:02.75,Default,,0,0,0,,First line\\NSecond line\n")
	text, err := convertSidecarVTT(context.Background(), input, ".ass")
	if err != nil || !strings.Contains(text, "00:01.250 --> 00:02.750") || !strings.Contains(text, "First line\nSecond line") {
		t.Fatalf("ASS conversion: %q %v", text, err)
	}
}
