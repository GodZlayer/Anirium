package main

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

const maxPartyChatChars = 300

type WatchPartyState struct {
	Active    bool   `json:"active"`
	RoomID    string `json:"roomId"`
	Author    string `json:"author"`
	IsHost    bool   `json:"isHost"`
	MeshPeers int    `json:"meshPeers"`
}

func randomPartyMsgID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func sanitizePartyRoom(room string) string {
	r := strings.TrimSpace(room)
	if len(r) > 64 {
		r = r[:64]
	}
	return r
}

func sanitizePartyAuthor(author string) string {
	a := strings.TrimSpace(author)
	if a == "" {
		return "Anirium"
	}
	if len(a) > 32 {
		a = a[:32]
	}
	return a
}

func (h *aniriumMeshHub) JoinWatchParty(roomID, author string, isHost bool) WatchPartyState {
	room := sanitizePartyRoom(roomID)
	name := sanitizePartyAuthor(author)
	h.mu.Lock()
	h.partyRoom = room
	h.partyAuthor = name
	h.partyIsHost = isHost
	h.partySeenMsgs = map[string]bool{}
	peerCount := len(h.peers)
	h.mu.Unlock()

	return WatchPartyState{
		Active:    room != "",
		RoomID:    room,
		Author:    name,
		IsHost:    isHost,
		MeshPeers: peerCount,
	}
}

func (h *aniriumMeshHub) LeaveWatchParty() WatchPartyState {
	h.mu.Lock()
	h.partyRoom = ""
	h.partyIsHost = false
	h.partySeenMsgs = map[string]bool{}
	peerCount := len(h.peers)
	h.mu.Unlock()

	return WatchPartyState{
		Active:    false,
		MeshPeers: peerCount,
	}
}

func (h *aniriumMeshHub) CurrentWatchPartyState() WatchPartyState {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return WatchPartyState{
		Active:    h.partyRoom != "",
		RoomID:    h.partyRoom,
		Author:    h.partyAuthor,
		IsHost:    h.partyIsHost,
		MeshPeers: len(h.peers),
	}
}

func (h *aniriumMeshHub) PublishPartySync(position float64, playing bool, rate float64) {
	if position < 0 {
		position = 0
	}
	if rate <= 0 || rate > 4 {
		rate = 1
	}
	h.mu.RLock()
	room := h.partyRoom
	author := h.partyAuthor
	peers := h.snapshotPeersLocked()
	h.mu.RUnlock()
	if room == "" {
		return
	}

	msg := meshMessage{
		Type:         "party_sync",
		Version:      aniriumMeshProtocolVer,
		RoomID:       room,
		Author:       author,
		Position:     position,
		Playing:      playing,
		PlaybackRate: rate,
		SentAtMs:     time.Now().UnixMilli(),
	}
	for _, pc := range peers {
		go h.sendToPeer(pc, msg)
	}
}

func (h *aniriumMeshHub) PublishPartyChat(text string) (meshMessage, bool) {
	clean := strings.TrimSpace(text)
	if clean == "" {
		return meshMessage{}, false
	}
	runes := []rune(clean)
	if len(runes) > maxPartyChatChars {
		clean = string(runes[:maxPartyChatChars])
	}

	h.mu.Lock()
	room := h.partyRoom
	author := h.partyAuthor
	if room == "" {
		h.mu.Unlock()
		return meshMessage{}, false
	}
	msgID := randomPartyMsgID()
	h.partySeenMsgs[msgID] = true
	peers := h.snapshotPeersLocked()
	h.mu.Unlock()

	msg := meshMessage{
		Type:     "party_chat",
		Version:  aniriumMeshProtocolVer,
		RoomID:   room,
		Author:   author,
		MsgID:    msgID,
		Text:     clean,
		SentAtMs: time.Now().UnixMilli(),
	}
	for _, pc := range peers {
		go h.sendToPeer(pc, msg)
	}
	return msg, true
}

func (h *aniriumMeshHub) handleIncomingPartySync(msg meshMessage) {
	if msg.RoomID == "" || msg.Position < 0 {
		return
	}
	h.mu.RLock()
	activeRoom := h.partyRoom
	cb := h.onPartySync
	h.mu.RUnlock()
	if activeRoom == "" || activeRoom != msg.RoomID {
		return
	}
	if cb != nil {
		cb(msg)
	}
	if h == globalMeshHub {
		broadcastWSEvent("party_sync", msg)
	}
}

func (h *aniriumMeshHub) handleIncomingPartyChat(msg meshMessage) {
	clean := strings.TrimSpace(msg.Text)
	if msg.RoomID == "" || clean == "" || msg.MsgID == "" {
		return
	}
	runes := []rune(clean)
	if len(runes) > maxPartyChatChars {
		clean = string(runes[:maxPartyChatChars])
		msg.Text = clean
	}

	h.mu.Lock()
	if h.partyRoom == "" || h.partyRoom != msg.RoomID || h.partySeenMsgs[msg.MsgID] {
		h.mu.Unlock()
		return
	}
	if len(h.partySeenMsgs) > 512 {
		h.partySeenMsgs = map[string]bool{}
	}
	h.partySeenMsgs[msg.MsgID] = true
	cb := h.onPartyChat
	h.mu.Unlock()

	if cb != nil {
		cb(msg)
	}
	if h == globalMeshHub {
		broadcastWSEvent("party_chat", msg)
	}
}
