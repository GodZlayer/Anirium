package main

import (
	"bytes"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

func TestWatchPartySyncAndChatOverBEP10(t *testing.T) {
	dirA, _ := os.MkdirTemp("", "anirium-party-a-*")
	dirB, _ := os.MkdirTemp("", "anirium-party-b-*")
	defer func() {
		_ = os.RemoveAll(dirA)
		_ = os.RemoveAll(dirB)
	}()

	payload := bytes.Repeat([]byte("ANIRIUM-WATCH-PARTY-TEST-"), 2048)
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

	hubA.JoinWatchParty("ANR-TEST", "HostDaniel", true)
	hubB.JoinWatchParty("ANR-TEST", "GuestUser", false)

	var mu sync.Mutex
	var gotSync *meshMessage
	var gotChat *meshMessage
	hubB.onPartySync = func(m meshMessage) {
		mu.Lock()
		cp := m
		gotSync = &cp
		mu.Unlock()
	}
	hubB.onPartyChat = func(m meshMessage) {
		mu.Lock()
		cp := m
		gotChat = &cp
		mu.Unlock()
	}

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

	// Wait until peer connection is established, then broadcast sync & chat
	deadline := time.Now().Add(8 * time.Second)
	sent := false
	for time.Now().Before(deadline) {
		if !sent && hubA.PeerCount() >= 1 {
			hubA.PublishPartySync(124.5, true, 1.0)
			hubA.PublishPartyChat("Começou a estreia!")
			sent = true
		}
		mu.Lock()
		ok := gotSync != nil && gotSync.Position == 124.5 && gotSync.Playing && gotChat != nil && gotChat.Text == "Começou a estreia!"
		mu.Unlock()
		if ok {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	t.Fatalf("Watch Party BEP-10 timed out: sent=%v gotSync=%+v gotChat=%+v", sent, gotSync, gotChat)
}
