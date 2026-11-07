package main

import (
	"bytes"
	"io"
	"testing"
	"time"
)

func TestBoundedMediaReadDiagnosticsPreserveOffsetsAndBounds(t *testing.T) {
	clock := time.Unix(1, 0)
	var offsets []int64
	var sizes []int
	reader := &boundedMediaReader{
		reader: bytes.NewReader([]byte("abcdefgh")), length: 5,
		now: func() time.Time { clock = clock.Add(3 * time.Second); return clock },
		observeRead: func(offset int64, size int, elapsed time.Duration, err error) {
			offsets = append(offsets, offset)
			sizes = append(sizes, size)
			if elapsed != 3*time.Second || err != nil {
				t.Fatalf("unexpected diagnostic: %v %v", elapsed, err)
			}
		},
	}
	if _, err := reader.Seek(2, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	buffer := make([]byte, 8)
	n, err := reader.Read(buffer)
	if err != nil || n != 3 || string(buffer[:n]) != "cde" {
		t.Fatalf("bounds changed: %d %v", n, err)
	}
	if len(offsets) != 1 || offsets[0] != 2 || sizes[0] != 3 {
		t.Fatalf("incorrect observations: %v %v", offsets, sizes)
	}
	if _, err := reader.Read(buffer); err != io.EOF {
		t.Fatalf("expected EOF: %v", err)
	}
	if len(offsets) != 1 {
		t.Fatal("EOF without input read must not emit a diagnostic")
	}
}
