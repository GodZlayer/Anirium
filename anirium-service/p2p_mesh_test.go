package main

import (
	"bytes"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

func TestMeshValidation(t *testing.T) {
	if validateMeshSkipTimes(nil) {
		t.Fatal("expected nil skip times to be invalid")
	}
	if validateMeshSkipTimes(&SkipTimes{OP: &SkipInterval{Start: 100, End: 50}}) {
		t.Fatal("expected inverted interval to be invalid")
	}
	if !validateMeshSkipTimes(&SkipTimes{OP: &SkipInterval{Start: 10, End: 100, Source: "mesh"}}) {
		t.Fatal("expected valid OP interval to pass")
	}
	if validateMeshVTT("not a subtitle") {
		t.Fatal("expected invalid VTT to be rejected")
	}
	if !validateMeshVTT("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nOlá mundo!\n") {
		t.Fatal("expected valid VTT to pass")
	}
}

func TestTwoAniriumServicesExchangeSkipTimesAndSubtitleOverBEP10(t *testing.T) {
	dirA, _ := os.MkdirTemp("", "anirium-mesh-a-*")
	dirB, _ := os.MkdirTemp("", "anirium-mesh-b-*")
	defer func() {
		_ = os.RemoveAll(dirA)
		_ = os.RemoveAll(dirB)
	}()

	// Create a tiny test file to seed from Node A
	payload := bytes.Repeat([]byte("ANIRIUM-MESH-TEST-DATA-"), 2048)
	filePath := filepath.Join(dirA, "ep1.mkv")
	if err := os.WriteFile(filePath, payload, 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	info := metainfo.Info{PieceLength: 16384}
	if err := info.BuildFromFilePath(filePath); err != nil {
		t.Fatalf("build metainfo: %v", err)
	}
	mi := metainfo.MetaInfo{}
	var err error
	mi.InfoBytes, err = bencode.Marshal(info)
	if err != nil {
		t.Fatalf("marshal info: %v", err)
	}

	hubA := newAniriumMeshHub()
	hubB := newAniriumMeshHub()

	expectedSkip := &SkipTimes{
		OP: &SkipInterval{Start: 12, End: 102, Source: "mesh"},
		ED: &SkipInterval{Start: 1320, End: 1410, Source: "mesh"},
	}
	expectedVTT := "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nTeste P2P Anirium Mesh!\n"
	hubA.PublishSkipTimes(61014, 1, expectedSkip)
	hubA.PublishSubtitle(61014, 1, "por", expectedVTT)

	makeClient := func(dir string, hub *aniriumMeshHub, seed bool) *torrent.Client {
		cfg := torrent.NewDefaultClientConfig()
		cfg.Slogger = slog.New(slog.NewTextHandler(io.Discard, nil))
		cfg.DataDir = dir
		cfg.ListenPort = 0
		cfg.ListenHost = func(string) string { return "127.0.0.1" }
		cfg.NoDHT = true
		cfg.DisableTrackers = true
		cfg.DisablePEX = true
		cfg.DisableUTP = true
		cfg.DisableIPv6 = true
		cfg.NoDefaultPortForwarding = true
		cfg.Seed = seed
		hub.attachCallbacks(&cfg.Callbacks)
		c, err := torrent.NewClient(cfg)
		if err != nil {
			t.Fatalf("new torrent client: %v", err)
		}
		return c
	}

	clientA := makeClient(dirA, hubA, true)
	clientB := makeClient(dirB, hubB, false)
	defer func() {
		clientB.Close()
		clientA.Close()
		time.Sleep(150 * time.Millisecond)
	}()

	torA, err := clientA.AddTorrent(&mi)
	if err != nil {
		t.Fatalf("add torrent A: %v", err)
	}
	<-torA.GotInfo()

	torB, err := clientB.AddTorrent(&mi)
	if err != nil {
		t.Fatalf("add torrent B: %v", err)
	}
	<-torB.GotInfo()

	torB.DownloadAll()
	torB.AddPeers([]torrent.PeerInfo{{
		Addr: &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: clientA.LocalPort()},
	}})

	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		gotSkip := hubB.GetSkipTimes(61014, 1)
		gotVTT, okVTT := hubB.GetSubtitle(61014, 1, "por")
		if gotSkip != nil && gotSkip.OP != nil && gotSkip.OP.Start == 12 && gotSkip.ED != nil && okVTT && gotVTT == expectedVTT {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}

	t.Fatalf("BEP-10 mesh exchange timed out: peersB=%d skipB=%+v subB=%q",
		hubB.PeerCount(), hubB.GetSkipTimes(61014, 1), func() string { s, _ := hubB.GetSubtitle(61014, 1, "por"); return s }())
}
