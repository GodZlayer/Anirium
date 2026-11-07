package main

import (
	"context"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
	"golang.org/x/time/rate"
)

func TestProgressiveMediaSurvivesPeerReplacement(t *testing.T) {
	if os.Getenv("ANIRIUM_RECOVERY_CHILD") != "1" {
		ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
		defer cancel()
		command := mediaCommandContext(ctx, os.Args[0], "-test.run=^TestProgressiveMediaSurvivesPeerReplacement$", "-test.timeout=120s", "-test.v")
		command.Env = append(os.Environ(), "ANIRIUM_RECOVERY_CHILD=1")
		output, err := command.CombinedOutput()
		if err != nil {
			t.Fatalf("isolated recovery: %v\n%s", err, output)
		}
		t.Log(string(output))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	root := t.TempDir()
	input := filepath.Join(root, "Show S01E03.mp4")
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=640x480:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "40", "-c:v", "libx264", "-threads:v", "2", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", input}
	if out, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, out)
	}
	info := metainfo.Info{PieceLength: 16 << 10}
	if err := info.BuildFromFilePath(input); err != nil {
		t.Fatal(err)
	}
	if info.Length < 2<<20 {
		t.Fatal("fixture too small to prove incomplete transfer")
	}
	encoded, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	mi := metainfo.MetaInfo{InfoBytes: encoded}
	makeClient := func(dir string, seed bool) (*torrent.Client, func()) {
		cfg := torrent.NewDefaultClientConfig()
		cfg.DataDir = dir
		cfg.Seed = seed
		cfg.NoDHT = true
		cfg.DisableTrackers = true
		cfg.DisablePEX = true
		cfg.DisableUTP = true
		cfg.DisableIPv6 = true
		cfg.NoDefaultPortForwarding = true
		cfg.ListenPort = 0
		cfg.ListenHost = func(string) string { return "127.0.0.1" }
		cfg.DropMutuallyCompletePeers = false
		if seed {
			cfg.UploadRateLimiter = rate.NewLimiter(128<<10, 64<<10)
		}
		factory := newManagedTorrentClient
		if !seed {
			factory = newBoundedRuntimeTorrentClient
		}
		client, closeClient, err := factory(cfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(closeClient)
		return client, closeClient
	}
	seed, closeSeed := makeClient(root, true)
	verify := func(client *torrent.Client) {
		tor, err := client.AddTorrent(&mi)
		if err != nil {
			t.Fatal(err)
		}
		tor.VerifyData()
		select {
		case <-tor.Complete().On():
		case <-ctx.Done():
			t.Fatal("seeder not verified")
		}
	}
	verify(seed)
	leecher, _ := makeClient(t.TempDir(), false)
	torrentClient = leecher
	tor, err := leecher.AddTorrent(&mi)
	if err != nil {
		t.Fatal(err)
	}
	connect := func(peer *torrent.Client) {
		magnet := "magnet:?xt=urn:btih:" + mi.HashInfoBytes().HexString() + "&x.pe=" + url.QueryEscape(peer.ListenAddrs()[0].String())
		if _, err := leecher.AddMagnet(magnet); err != nil {
			t.Fatal(err)
		}
	}
	connect(seed)
	// Use the production seekable torrent input and range server.
	progressive, err := newProgressiveInputServer(ctx)
	if err != nil {
		t.Fatal(err)
	}
	mediaURL, err := progressive.register("fixture", seekableMediaInput{name: filepath.Base(input), length: info.Length, open: func(request context.Context) (io.ReadSeekCloser, error) {
		reader := tor.Files()[0].NewReader()
		reader.SetContext(request)
		reader.SetReadahead(64 << 10)
		return reader, nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	first := make(chan hlsProgress, 1)
	result := make(chan error, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		result <- publishIncrementalHLS(ctx, dir, []hlsProducer{{playlist: "source.m3u8", run: func(ctx context.Context, dir string) error {
			_, err := transcodeSourceToHLS(mediaURL, dir, "480p", ctx)
			return err
		}}}, func(progress hlsProgress) {
			select {
			case first <- progress:
			default:
			}
		})
	}()
	t.Cleanup(func() {
		cancel()
		select {
		case <-finished:
		case <-time.After(5 * time.Second):
			t.Error("worker did not retire")
		}
	})
	select {
	case progress := <-first:
		if progress.complete || progress.bufferedSeconds <= 0 {
			t.Fatal("no incremental buffer")
		}
	case <-ctx.Done():
		t.Fatal("first segment timeout")
	}
	if tor.BytesCompleted() >= info.Length {
		t.Fatal("fixture already cached before outage")
	}
	closeSeed()
	segment := filepath.Join(dir, "segment-000000.ts")
	if out, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-xerror", "-i", segment, "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("buffer cannot decode during peer outage: %v %s", err, out)
	}
	downloaded := tor.BytesCompleted()
	t.Logf("peer removed while bytes=%d/%d; published segment decodes", downloaded, info.Length)
	// The whole file must still be incomplete, and EOF must not be advertised.
	select {
	case err := <-result:
		t.Fatalf("producer terminated before replacement: %v", err)
	case <-time.After(500 * time.Millisecond):
	}
	playlist, err := os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if err != nil || strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
		t.Fatal("outage falsely finalized media")
	}
	replacement, _ := makeClient(root, true)
	verify(replacement)
	connect(replacement)
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("replacement peer did not resume media")
	}
	assertPeerPlaylistDecodes(t, ctx, dir)
	playlist, err = os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if err != nil || !strings.Contains(string(playlist), "#EXT-X-ENDLIST") {
		t.Fatal("recovered media not finalized")
	}
	if tor.BytesCompleted() <= downloaded {
		t.Fatal("no additional pieces after replacement")
	}
}
