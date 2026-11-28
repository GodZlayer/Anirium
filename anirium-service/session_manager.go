package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultMaxConcurrentSessions = 4
	defaultSessionIdleTimeout    = 5 * time.Minute
)

// PlaybackSlot holds isolated runtime state for a single player tab or LAN device.
// The torrent.Client and globalMeshHub remain shared across slots so identical episodes
// reuse downloaded pieces without duplicating bandwidth.
type PlaybackSlot struct {
	mu           sync.RWMutex
	ID           string
	Ticket       string
	Generation   uint64
	LastActivity time.Time
	HLSDir       string

	ctx    context.Context
	cancel context.CancelFunc

	CatalogIdentity interface{}
	SessionState    playbackSessionState
	MixQualities    []string
	MixAudios       []string
	MixSubs         []string
	Closed          bool
}

func (s *PlaybackSlot) Touch() {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.LastActivity = time.Now()
	s.mu.Unlock()
}

func (s *PlaybackSlot) Snapshot() map[string]interface{} {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return map[string]interface{}{
		"sessionId":    s.ID,
		"ticket":       s.Ticket,
		"generation":   s.Generation,
		"hlsDir":       s.HLSDir,
		"lastActivity": s.LastActivity.Unix(),
		"closed":       s.Closed,
	}
}

type SessionManager struct {
	mu          sync.RWMutex
	slots       map[string]*PlaybackSlot
	byTicket    map[string]string
	maxSessions int
	baseHLSDir  string
	latestID    string
	reaperOnce  sync.Once
}

func resolveMaxConcurrentSessions() int {
	raw := strings.TrimSpace(os.Getenv("ANIRIUM_MAX_SESSIONS"))
	if raw == "" {
		return defaultMaxConcurrentSessions
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return defaultMaxConcurrentSessions
	}
	if n > 16 {
		return 16
	}
	return n
}

func newSessionManager(baseHLSDir string, maxSessions int) *SessionManager {
	if maxSessions < 1 {
		maxSessions = resolveMaxConcurrentSessions()
	}
	if strings.TrimSpace(baseHLSDir) == "" {
		baseHLSDir = filepath.Join(os.TempDir(), "anirium-hls-sessions")
	}
	return &SessionManager{
		slots:       make(map[string]*PlaybackSlot),
		byTicket:    make(map[string]string),
		maxSessions: maxSessions,
		baseHLSDir:  baseHLSDir,
	}
}

var globalSessionManager = newSessionManager("", 0)

func randomSessionID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return "sess-" + hex.EncodeToString(b[:])
}

func sanitizeSessionID(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return randomSessionID()
	}
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
		if b.Len() >= 64 {
			break
		}
	}
	if b.Len() == 0 {
		return randomSessionID()
	}
	return b.String()
}

func (m *SessionManager) StartReaper() {
	m.reaperOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				m.ReapIdleSessions(defaultSessionIdleTimeout)
			}
		}()
	})
}

func (m *SessionManager) CreateOrReplace(sessionID, ticket string, generation uint64) *PlaybackSlot {
	id := sanitizeSessionID(sessionID)
	now := time.Now()
	hlsDir := filepath.Join(m.baseHLSDir, id)
	_ = os.MkdirAll(hlsDir, 0o755)

	ctx, cancel := context.WithCancel(context.Background())
	slot := &PlaybackSlot{
		ID:           id,
		Ticket:       strings.TrimSpace(ticket),
		Generation:   generation,
		LastActivity: now,
		HLSDir:       hlsDir,
		ctx:          ctx,
		cancel:       cancel,
	}

	var replaced *PlaybackSlot
	var evicted *PlaybackSlot

	m.mu.Lock()
	if old, ok := m.slots[id]; ok {
		replaced = old
		if old.Ticket != "" {
			delete(m.byTicket, old.Ticket)
		}
		delete(m.slots, id)
	}
	if len(m.slots) >= m.maxSessions {
		var oldestID string
		var oldestTime time.Time
		for sid, s := range m.slots {
			s.mu.RLock()
			la := s.LastActivity
			s.mu.RUnlock()
			if oldestID == "" || la.Before(oldestTime) {
				oldestID = sid
				oldestTime = la
			}
		}
		if oldestID != "" {
			evicted = m.slots[oldestID]
			if evicted.Ticket != "" {
				delete(m.byTicket, evicted.Ticket)
			}
			delete(m.slots, oldestID)
		}
	}
	m.slots[id] = slot
	if slot.Ticket != "" {
		m.byTicket[slot.Ticket] = id
	}
	m.latestID = id
	m.mu.Unlock()

	if replaced != nil {
		m.cleanupSlot(replaced)
	}
	if evicted != nil {
		m.cleanupSlot(evicted)
	}
	updateUploadRateLimit(m.ActiveCount())
	return slot
}

func (m *SessionManager) BindTicket(sessionID, ticket string, generation uint64) *PlaybackSlot {
	id := sanitizeSessionID(sessionID)
	t := strings.TrimSpace(ticket)
	m.mu.Lock()
	slot, ok := m.slots[id]
	if !ok {
		m.mu.Unlock()
		return m.CreateOrReplace(id, t, generation)
	}
	slot.mu.Lock()
	if slot.Ticket != "" && slot.Ticket != t {
		delete(m.byTicket, slot.Ticket)
	}
	slot.Ticket = t
	if generation > 0 {
		slot.Generation = generation
	}
	slot.LastActivity = time.Now()
	slot.mu.Unlock()
	if t != "" {
		m.byTicket[t] = id
	}
	m.latestID = id
	m.mu.Unlock()
	return slot
}

func (m *SessionManager) Get(sessionID string) (*PlaybackSlot, bool) {
	id := strings.TrimSpace(sessionID)
	m.mu.RLock()
	defer m.mu.RUnlock()
	if id == "" {
		id = m.latestID
	}
	slot, ok := m.slots[id]
	return slot, ok
}

func (m *SessionManager) GetByTicket(ticket string) (*PlaybackSlot, bool) {
	t := strings.TrimSpace(ticket)
	if t == "" {
		return nil, false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	id, ok := m.byTicket[t]
	if !ok {
		return nil, false
	}
	slot, ok := m.slots[id]
	return slot, ok
}

func (m *SessionManager) Close(sessionID string) bool {
	id := strings.TrimSpace(sessionID)
	if id == "" {
		return false
	}
	m.mu.Lock()
	slot, ok := m.slots[id]
	if ok {
		if slot.Ticket != "" {
			delete(m.byTicket, slot.Ticket)
		}
		delete(m.slots, id)
		if m.latestID == id {
			m.latestID = ""
			for otherID := range m.slots {
				m.latestID = otherID
				break
			}
		}
	}
	m.mu.Unlock()
	if ok {
		m.cleanupSlot(slot)
		updateUploadRateLimit(m.ActiveCount())
	}
	return ok
}

func (m *SessionManager) ReapIdleSessions(maxIdle time.Duration) int {
	if maxIdle <= 0 {
		return 0
	}
	cutoff := time.Now().Add(-maxIdle)
	var expired []*PlaybackSlot

	m.mu.Lock()
	for id, slot := range m.slots {
		slot.mu.RLock()
		la := slot.LastActivity
		slot.mu.RUnlock()
		if la.Before(cutoff) {
			expired = append(expired, slot)
			if slot.Ticket != "" {
				delete(m.byTicket, slot.Ticket)
			}
			delete(m.slots, id)
		}
	}
	m.mu.Unlock()

	for _, slot := range expired {
		m.cleanupSlot(slot)
	}
	if len(expired) > 0 {
		updateUploadRateLimit(m.ActiveCount())
	}
	return len(expired)
}

func (m *SessionManager) ActiveCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.slots)
}

func (m *SessionManager) cleanupSlot(slot *PlaybackSlot) {
	if slot == nil {
		return
	}
	slot.mu.Lock()
	if slot.Closed {
		slot.mu.Unlock()
		return
	}
	slot.Closed = true
	cancel := slot.cancel
	hlsDir := slot.HLSDir
	slot.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if hlsDir != "" {
		_ = os.RemoveAll(hlsDir)
	}
}
