package main

import (
	"bytes"
	"testing"
)

func TestComputeOpenSubtitlesHash(t *testing.T) {
	data := make([]byte, 131072)
	for i := range data {
		data[i] = byte(i % 251)
	}
	h1, err := computeOpenSubtitlesHash(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("computeOpenSubtitlesHash failed: %v", err)
	}
	if len(h1) != 16 {
		t.Fatalf("expected 16 hex chars, got %q", h1)
	}
	h2, err := computeOpenSubtitlesHash(bytes.NewReader(data), int64(len(data)))
	if err != nil || h1 != h2 {
		t.Fatalf("hash not deterministic: %q vs %q (err=%v)", h1, h2, err)
	}
}
