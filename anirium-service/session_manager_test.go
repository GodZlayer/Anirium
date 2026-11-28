package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTwoConcurrentSessionsStayIsolated(t *testing.T) {
	baseDir, err := os.MkdirTemp("", "anirium-sess-test-*")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(baseDir)

	sm := newSessionManager(baseDir, 4)
	slotA := sm.CreateOrReplace("tab-ep1", "ticket-A", 1)
	slotB := sm.CreateOrReplace("tab-ep2", "ticket-B", 2)

	if sm.ActiveCount() != 2 {
		t.Fatalf("expected 2 active sessions, got %d", sm.ActiveCount())
	}
	if slotA.HLSDir == slotB.HLSDir {
		t.Fatalf("expected isolated HLS directories, both were %q", slotA.HLSDir)
	}
	if _, err := os.Stat(slotA.HLSDir); err != nil {
		t.Fatalf("expected slotA HLSDir to exist: %v", err)
	}
	if _, err := os.Stat(slotB.HLSDir); err != nil {
		t.Fatalf("expected slotB HLSDir to exist: %v", err)
	}

	// Verify ticket lookup resolves the exact slot
	gotA, okA := sm.GetByTicket("ticket-A")
	gotB, okB := sm.GetByTicket("ticket-B")
	if !okA || !okB || gotA.ID != "tab-ep1" || gotB.ID != "tab-ep2" {
		t.Fatalf("unexpected ticket lookup: A=(%v,%v) B=(%v,%v)", gotA, okA, gotB, okB)
	}

	// Verify broadcastToSession only delivers to clients bound to that session
	prevSM := globalSessionManager
	globalSessionManager = sm
	defer func() { globalSessionManager = prevSM }()

	clientA := &wsClient{send: make(chan []byte, 4), sessionID: "tab-ep1"}
	clientB := &wsClient{send: make(chan []byte, 4), sessionID: "tab-ep2"}

	globalHub.mu.Lock()
	globalHub.clients[clientA] = true
	globalHub.clients[clientB] = true
	globalHub.mu.Unlock()
	defer func() {
		globalHub.mu.Lock()
		delete(globalHub.clients, clientA)
		delete(globalHub.clients, clientB)
		globalHub.mu.Unlock()
	}()

	broadcastToSession("tab-ep1", "subtitle_data", map[string]string{"trackId": "pt-ep1"})

	select {
	case raw := <-clientA.send:
		var msg map[string]interface{}
		if err := json.Unmarshal(raw, &msg); err != nil {
			t.Fatalf("unmarshal clientA msg: %v", err)
		}
		if msg["sessionId"] != "tab-ep1" {
			t.Fatalf("expected sessionId=tab-ep1, got %v", msg["sessionId"])
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("clientA did not receive its session event")
	}

	select {
	case leak := <-clientB.send:
		t.Fatalf("clientB should NOT receive tab-ep1 event, got: %s", string(leak))
	case <-time.After(60 * time.Millisecond):
	}

	// Closing session A must remove its HLS dir while leaving session B intact
	if !sm.Close("tab-ep1") {
		t.Fatalf("expected Close(tab-ep1) to return true")
	}
	if _, err := os.Stat(slotA.HLSDir); !os.IsNotExist(err) {
		t.Fatalf("expected slotA HLSDir to be cleaned up")
	}
	if _, err := os.Stat(slotB.HLSDir); err != nil {
		t.Fatalf("expected slotB HLSDir to remain intact: %v", err)
	}
	if sm.ActiveCount() != 1 {
		t.Fatalf("expected 1 active session remaining, got %d", sm.ActiveCount())
	}
}

func TestSessionEvictionAndIdleCleanup(t *testing.T) {
	baseDir, err := os.MkdirTemp("", "anirium-evict-test-*")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(baseDir)

	sm := newSessionManager(baseDir, 2)
	s1 := sm.CreateOrReplace("s1", "t1", 1)
	time.Sleep(15 * time.Millisecond)
	s2 := sm.CreateOrReplace("s2", "t2", 2)
	time.Sleep(15 * time.Millisecond)
	s3 := sm.CreateOrReplace("s3", "t3", 3)

	if sm.ActiveCount() != 2 {
		t.Fatalf("expected maxSessions=2, got %d", sm.ActiveCount())
	}
	if _, ok := sm.Get(s1.ID); ok {
		t.Fatalf("expected oldest session s1 to be evicted")
	}
	if _, ok := sm.Get(s2.ID); !ok {
		t.Fatalf("expected s2 to remain")
	}
	if _, ok := sm.Get(s3.ID); !ok {
		t.Fatalf("expected s3 to remain")
	}

	// Force s2 idle and reap
	s2.mu.Lock()
	s2.LastActivity = time.Now().Add(-10 * time.Minute)
	s2.mu.Unlock()

	reaped := sm.ReapIdleSessions(5 * time.Minute)
	if reaped != 1 {
		t.Fatalf("expected 1 reaped session, got %d", reaped)
	}
	if _, err := os.Stat(filepath.Join(baseDir, "s2")); !os.IsNotExist(err) {
		t.Fatalf("expected reaped s2 HLSDir to be removed")
	}
}
