package main

import "testing"

func TestProbeCacheReadWrite(t *testing.T) {
	probeCacheMu.Lock()
	probeCacheMap = map[string]ffprobeOutput{}
	probeCacheLoaded = true
	probeCacheMu.Unlock()

	sample := ffprobeOutput{
		Streams: []ffprobeStream{
			{CodecType: "video", Height: 1080},
			{CodecType: "subtitle"},
		},
	}

	if _, ok := readProbeCache("abc123", "Show - 01.mkv"); ok {
		t.Fatalf("expected cache miss before write")
	}

	writeProbeCache("abc123", "Show - 01.mkv", sample)

	got, ok := readProbeCache("ABC123", "Show - 01.mkv")
	if !ok {
		t.Fatalf("expected cache hit after write")
	}
	if len(got.Streams) != 2 || got.Streams[0].Height != 1080 {
		t.Fatalf("unexpected cached streams: %+v", got.Streams)
	}
}
