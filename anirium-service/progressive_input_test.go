package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type countedInputReader struct {
	*bytes.Reader
	reads, closes *atomic.Int64
	closed        chan<- struct{}
}

func (reader countedInputReader) Read(buffer []byte) (int, error) {
	n, err := reader.Reader.Read(buffer)
	reader.reads.Add(int64(n))
	return n, err
}
func (reader countedInputReader) Close() error {
	reader.closes.Add(1)
	reader.closed <- struct{}{}
	return nil
}

func TestProgressiveInputRangesAreBoundedPrivateAndGenerationScoped(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server, err := newProgressiveInputServer(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var reads, closes atomic.Int64
	closed := make(chan struct{}, 8)
	input := seekableMediaInput{name: "selected.mkv", length: 8, open: func(context.Context) (io.ReadSeekCloser, error) {
		return countedInputReader{bytes.NewReader([]byte("selectedNEIGHBOR MUST NOT LEAK")), &reads, &closes, closed}, nil
	}}
	url, err := server.register("source", input)
	if err != nil {
		t.Fatal(err)
	}
	if again, err := server.register("source", input); err != nil || again != url {
		t.Fatal("workers did not share one input URL")
	}
	client := &http.Client{Timeout: 3 * time.Second}
	for _, test := range []struct {
		method, rangeHeader, body string
		status                    int
	}{
		{"HEAD", "", "", 200},
		{"GET", "bytes=2-4", "lec", 206},
		{"GET", "bytes=-2", "ed", 206},
		{"GET", "bytes=6-100", "ed", 206},
		{"GET", "bytes=8-", "", 416},
		{"POST", "", "", 405},
		{"GET", "", "selected", 200},
	} {
		before := reads.Load()
		request, _ := http.NewRequest(test.method, url, nil)
		request.Header.Set("Range", test.rangeHeader)
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != test.status {
			t.Fatalf("%s %s status=%d err=%v", test.method, test.rangeHeader, response.StatusCode, err)
		}
		if test.status < 400 && string(body) != test.body {
			t.Fatalf("range content leaked/wrong: %q", body)
		}
		if test.status < 400 && reads.Load()-before != int64(len(test.body)) {
			t.Fatal("range fetched bytes outside the request, or HEAD read media")
		}
	}
	request, _ := http.NewRequest("GET", url, nil)
	request.Header.Set("Origin", "https://example.invalid")
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatal("browser origin accepted private worker input")
	}
	response, err = client.Get(server.baseURL + "/input/unknown")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 404 {
		t.Fatal("unregistered input accepted")
	}
	for index := 0; index < 6; index++ {
		select {
		case <-closed:
		case <-time.After(3 * time.Second):
			t.Fatal("request reader not closed")
		}
	}
	if closes.Load() != 6 {
		t.Fatalf("request readers not closed: %d", closes.Load())
	}
	cancel()
	select {
	case <-server.done:
	case <-time.After(3 * time.Second):
		t.Fatal("generation listener did not retire")
	}
	if _, err := server.register("new", input); err == nil {
		t.Fatal("canceled generation accepted input")
	}
	if response, err := client.Get(url); err == nil {
		response.Body.Close()
		t.Fatal("retired worker input still accessible")
	}
}

type contextBlockedInput struct {
	*bytes.Reader
	ctx             context.Context
	started, closed chan struct{}
}

func (reader contextBlockedInput) Read([]byte) (int, error) {
	close(reader.started)
	<-reader.ctx.Done()
	return 0, reader.ctx.Err()
}
func (reader contextBlockedInput) Close() error { close(reader.closed); return nil }

func TestProgressiveInputGenerationCancellationReleasesBlockedReader(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server, err := newProgressiveInputServer(ctx)
	if err != nil {
		t.Fatal(err)
	}
	started, closed := make(chan struct{}), make(chan struct{})
	url, err := server.register("waiting-piece", seekableMediaInput{name: "waiting.mkv", length: 8, open: func(request context.Context) (io.ReadSeekCloser, error) {
		return contextBlockedInput{bytes.NewReader([]byte("selected")), request, started, closed}, nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		client := &http.Client{Timeout: 3 * time.Second}
		if response, err := client.Get(url); err == nil {
			response.Body.Close()
		}
	}()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("request did not wait for a piece")
	}
	cancel()
	select {
	case <-closed:
	case <-time.After(3 * time.Second):
		t.Fatal("generation cancellation did not release its reader")
	}
	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("canceled request remained blocked")
	}
}

func TestBoundedMediaReaderRejectsOverflowAndNeighborSeeks(t *testing.T) {
	reader := &boundedMediaReader{reader: strings.NewReader("fileNEIGHBOR"), length: 4}
	for _, offset := range []int64{-1, 5, 1<<63 - 1} {
		if _, err := reader.Seek(offset, io.SeekStart); err == nil {
			t.Fatal("out-of-file seek accepted")
		}
	}
	data, err := io.ReadAll(reader)
	if err != nil || string(data) != "file" {
		t.Fatalf("bounded read: %q %v", data, err)
	}
	if _, err := reader.Seek(1, io.SeekEnd); err == nil {
		t.Fatal("neighbor seek accepted")
	}
}
