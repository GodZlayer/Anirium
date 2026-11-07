package main

import (
	"bytes"
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type gatedMediaReader struct {
	*bytes.Reader
	ctx  context.Context
	gate <-chan struct{}
	cut  int64
}

func (reader gatedMediaReader) Read(buffer []byte) (int, error) {
	pos, _ := reader.Reader.Seek(0, io.SeekCurrent)
	if pos >= reader.cut {
		select {
		case <-reader.ctx.Done():
			return 0, reader.ctx.Err()
		case <-reader.gate:
		}
	} else if int64(len(buffer)) > reader.cut-pos {
		buffer = buffer[:reader.cut-pos]
	}
	return reader.Reader.Read(buffer)
}
func (gatedMediaReader) Close() error { return nil }

// The tail cannot be read until the test explicitly releases it. Publishing
// and decoding a segment before that release proves actual incremental output,
// not merely that an HTTP range request itself completed early.
func TestRealVideoAndAudioPublishBeforeInputTailIsAvailable(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "authorized.mp4")
	cmd := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=640x480:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "12", "-c:v", "libx264", "-threads:v", "2", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", input)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("generated input: %v %s", err, output)
	}
	data, err := os.ReadFile(input)
	if err != nil || len(data) < 512<<10 {
		t.Fatalf("fixture insufficient for blocked-tail test: size=%d error=%v", len(data), err)
	}
	for _, mode := range []string{"video", "audio"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			server, err := newProgressiveInputServer(ctx)
			if err != nil {
				t.Fatal(err)
			}
			gate := make(chan struct{})
			url, err := server.register("authorized", seekableMediaInput{name: "authorized.mp4", length: int64(len(data)), open: func(request context.Context) (io.ReadSeekCloser, error) {
				return gatedMediaReader{bytes.NewReader(data), request, gate, int64(len(data)) * 2 / 3}, nil
			}})
			if err != nil {
				t.Fatal(err)
			}
			var producers []hlsProducer
			if mode == "video" {
				for index := 0; index < 2; index++ {
					producers = append(producers, hlsProducer{playlist: "source.m3u8", run: func(ctx context.Context, dir string) error {
						_, err := transcodeSourceToHLS(url, dir, "480p", ctx)
						return err
					}})
				}
			} else {
				producers = []hlsProducer{{playlist: "index.m3u8", run: func(ctx context.Context, dir string) error { return transcodeAudioToHLS(ctx, url, dir, 1) }}}
			}
			dir := t.TempDir()
			first := make(chan hlsProgress, 1)
			result := make(chan error, 1)
			finished := make(chan struct{})
			go func() {
				defer close(finished)
				result <- publishIncrementalHLS(ctx, dir, producers, func(state hlsProgress) {
					select {
					case first <- state:
					default:
					}
				})
			}()
			t.Cleanup(func() {
				cancel()
				select {
				case <-finished:
				case <-time.After(5 * time.Second):
					t.Error("incremental workers did not retire")
				}
			})
			select {
			case progress := <-first:
				if progress.complete || progress.bufferedSeconds <= 0 {
					t.Fatalf("not incremental: %+v", progress)
				}
			case <-ctx.Done():
				t.Fatal("media waited for the blocked input tail")
			}
			select {
			case <-finished:
				t.Fatal("producer finished despite blocked tail")
			default:
			}
			playlist, err := os.ReadFile(filepath.Join(dir, "index.m3u8"))
			if err != nil || strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
				t.Fatal("blocked media falsely complete")
			}
			segment := filepath.Join(dir, "segment-000000.ts")
			if output, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-xerror", "-i", segment, "-f", "null", "-").CombinedOutput(); err != nil {
				t.Fatalf("early segment cannot decode: %v %s", err, output)
			}
			close(gate)
			select {
			case err := <-result:
				if err != nil {
					t.Fatal(err)
				}
			case <-ctx.Done():
				t.Fatal("released media did not finish")
			}
			assertPeerPlaylistDecodes(t, ctx, dir)
			playlist, err = os.ReadFile(filepath.Join(dir, "index.m3u8"))
			if err != nil || !strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
				t.Fatal("complete media not finalized")
			}
		})
	}
}
