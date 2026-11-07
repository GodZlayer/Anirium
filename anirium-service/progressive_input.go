package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type seekableMediaInput struct {
	name   string
	length int64
	open   func(context.Context) (io.ReadSeekCloser, error)
}

// This private listener is for media workers, never the Player. Unpredictable
// URLs have generation lifetime; each HTTP range owns an independent reader.
type progressiveInputServer struct {
	ctx      context.Context
	server   *http.Server
	baseURL  string
	mu       sync.Mutex
	inputs   map[string]seekableMediaInput
	urls     map[string]string
	slots    chan struct{}
	done     chan struct{}
	retired  chan struct{}
	closed   bool
	handlers sync.WaitGroup
}

func newProgressiveInputServer(ctx context.Context) (*progressiveInputServer, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	input := &progressiveInputServer{ctx: ctx, baseURL: "http://" + listener.Addr().String(), inputs: map[string]seekableMediaInput{}, urls: map[string]string{}, slots: make(chan struct{}, 8), done: make(chan struct{}), retired: make(chan struct{})}
	input.server = &http.Server{Handler: http.HandlerFunc(input.serveHTTP), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 15 * time.Second, BaseContext: func(net.Listener) context.Context { return ctx }}
	context.AfterFunc(ctx, func() {
		input.mu.Lock()
		input.closed = true
		input.mu.Unlock()
		_ = input.server.Close()
		input.handlers.Wait()
		close(input.retired)
	})
	go func() { defer close(input.done); _ = input.server.Serve(listener) }()
	return input, nil
}

func (server *progressiveInputServer) register(source string, input seekableMediaInput) (string, error) {
	server.mu.Lock()
	defer server.mu.Unlock()
	if err := server.ctx.Err(); err != nil {
		return "", err
	}
	if existing := server.urls[source]; existing != "" {
		return existing, nil
	}
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return "", err
	}
	path := "/input/" + hex.EncodeToString(secret[:])
	server.inputs[path] = input
	server.urls[source] = server.baseURL + path
	return server.urls[source], nil
}

func (server *progressiveInputServer) serveHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if r.Header.Get("Origin") != "" || r.URL.RawQuery != "" {
		http.Error(w, "Private media worker endpoint", http.StatusForbidden)
		return
	}
	server.mu.Lock()
	input, exists := server.inputs[r.URL.Path]
	if server.closed {
		exists = false
	}
	if exists {
		server.handlers.Add(1)
	}
	server.mu.Unlock()
	if !exists {
		http.NotFound(w, r)
		return
	}
	defer server.handlers.Done()
	if strings.Count(r.Header.Get("Range"), ",") > 7 {
		http.Error(w, "Too many ranges", http.StatusRequestedRangeNotSatisfiable)
		return
	}
	select {
	case server.slots <- struct{}{}:
		defer func() { <-server.slots }()
	case <-r.Context().Done():
		return
	}
	reader, err := input.open(r.Context())
	if err != nil {
		http.Error(w, "Media input unavailable", http.StatusServiceUnavailable)
		return
	}
	defer reader.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, input.name, time.Time{}, &boundedMediaReader{
		reader: reader, length: input.length, now: time.Now,
		observeRead: func(offset int64, bytes int, elapsed time.Duration, err error) {
			if elapsed < 2*time.Second {
				return
			}
			outcome := "ready"
			if err != nil {
				outcome = "read-error"
			}
			if r.Context().Err() != nil {
				outcome = "canceled"
			}
			// No path, source title, URL, info hash or raw error is recorded.
			appendLog(fmt.Sprintf("Progressive media read offset=%d bytes=%d elapsed_ms=%d outcome=%s", offset, bytes, elapsed.Milliseconds(), outcome))
		},
	})
}

// File readers in the torrent dependency can read across a file boundary. Do
// not allow a worker to see neighboring files or seek outside its selected one.
type boundedMediaReader struct {
	reader      io.ReadSeeker
	length      int64
	pos         int64
	now         func() time.Time
	observeRead func(int64, int, time.Duration, error)
}

func (reader *boundedMediaReader) Read(buffer []byte) (int, error) {
	if reader.pos >= reader.length {
		return 0, io.EOF
	}
	if int64(len(buffer)) > reader.length-reader.pos {
		buffer = buffer[:reader.length-reader.pos]
	}
	var started time.Time
	if reader.observeRead != nil && reader.now != nil {
		started = reader.now()
	}
	n, err := reader.reader.Read(buffer)
	if !started.IsZero() {
		reader.observeRead(reader.pos, n, reader.now().Sub(started), err)
	}
	reader.pos += int64(n)
	return n, err
}

func (reader *boundedMediaReader) Seek(offset int64, whence int) (int64, error) {
	var base int64
	switch whence {
	case io.SeekStart:
	case io.SeekCurrent:
		base = reader.pos
	case io.SeekEnd:
		base = reader.length
	default:
		return reader.pos, fmt.Errorf("invalid seek mode")
	}
	if offset < -base || offset > reader.length-base {
		return reader.pos, fmt.Errorf("seek outside selected file")
	}
	pos, err := reader.reader.Seek(base+offset, io.SeekStart)
	if err == nil {
		reader.pos = pos
	}
	return pos, err
}

func newProgressiveMediaInputCache(ctx context.Context) *mediaInputCache {
	var once sync.Once
	var server *progressiveInputServer
	var serverErr error
	load := func(waiter context.Context, source string, _ int) (string, error) {
		swarmMu.RLock()
		client := torrentClient
		swarmMu.RUnlock()
		if client == nil {
			return "", fmt.Errorf("torrent client unavailable")
		}
		tor, err := addPlaybackTorrent(waiter, client, resolveMediaSource(source).Magnet)
		if err != nil {
			return "", err
		}
		select {
		case <-tor.GotInfo():
		case <-waiter.Done():
			return "", waiter.Err()
		case <-time.After(25 * time.Second):
			return "", fmt.Errorf("metadata timeout")
		}
		video, err := selectSourceVideo(ctx, tor.Files(), source)
		if err != nil || video == nil {
			return "", fmt.Errorf("selected video unavailable: %v", err)
		}
		once.Do(func() { server, serverErr = newProgressiveInputServer(ctx) })
		if serverErr != nil {
			return "", serverErr
		}
		return server.register(source, seekableMediaInput{name: filepath.Base(video.DisplayPath()), length: video.Length(), open: func(request context.Context) (io.ReadSeekCloser, error) {
			reader := video.NewReader()
			reader.SetContext(request)
			swarmMu.RLock()
			capacity := observedTransferCapacity
			swarmMu.RUnlock()
			reader.SetReadahead(mediaReadahead(capacity))
			return reader, nil
		}})
	}
	// URL inputs own no copied file. Their listener/readers retire with ctx.
	cache := newMediaInputCache(ctx, load, func(string) {})
	cache.waitRetired = func() {
		// Context must already be canceled. Prevent a late loader from opening
		// a listener after retirement, or join an initialization in progress.
		once.Do(func() { serverErr = context.Canceled })
		if server != nil {
			<-server.retired
		}
	}
	return cache
}
