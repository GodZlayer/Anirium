package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExtractSkipTimesFromChapters(t *testing.T) {
	mkChapter := func(start, end, title string) ffprobeChapter {
		var ch ffprobeChapter
		ch.StartTime = start
		ch.EndTime = end
		ch.Tags.Title = title
		return ch
	}

	chapters := []ffprobeChapter{
		mkChapter("0.000", "62.500", "Prologue"),
		mkChapter("62.500", "152.500", "OP"),
		mkChapter("152.500", "1290.000", "Part A"),
		mkChapter("1290.000", "1380.000", "Ending"),
		mkChapter("1380.000", "1420.000", "Preview"),
	}

	got := extractSkipTimesFromChapters(chapters)
	if got == nil || got.OP == nil || got.ED == nil {
		t.Fatalf("expected OP and ED intervals, got %+v", got)
	}
	if got.OP.Start != 62.5 || got.OP.End != 152.5 || got.OP.Source != "chapter" {
		t.Fatalf("unexpected OP interval: %+v", got.OP)
	}
	if got.ED.Start != 1290 || got.ED.End != 1380 || got.ED.Source != "chapter" {
		t.Fatalf("unexpected ED interval: %+v", got.ED)
	}
}

func TestFetchAniSkipTimes(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/12345/3" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"found": true,
			"results": [
				{"interval": {"startTime": 80.5, "endTime": 170.5}, "skipType": "op"},
				{"interval": {"startTime": 1310.0, "endTime": 1400.0}, "skipType": "ed"}
			]
		}`))
	}))
	defer srv.Close()

	prevURL := aniSkipBaseURL
	prevClient := aniSkipClient
	aniSkipBaseURL = srv.URL
	aniSkipClient = srv.Client()
	defer func() {
		aniSkipBaseURL = prevURL
		aniSkipClient = prevClient
	}()

	got := fetchAniSkipTimes(context.Background(), 12345, 3)
	if got == nil || got.OP == nil || got.ED == nil {
		t.Fatalf("expected AniSkip OP and ED, got %+v", got)
	}
	if got.OP.Start != 80.5 || got.OP.End != 170.5 || got.OP.Source != "aniskip" {
		t.Fatalf("unexpected OP: %+v", got.OP)
	}
	if got.ED.Start != 1310 || got.ED.End != 1400 || got.ED.Source != "aniskip" {
		t.Fatalf("unexpected ED: %+v", got.ED)
	}
}
