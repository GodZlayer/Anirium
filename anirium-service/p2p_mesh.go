package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/anacrolix/torrent"
	pp "github.com/anacrolix/torrent/peer_protocol"
)

const (
	aniriumMeshExtName     = pp.ExtensionName("anirium_mesh")
	aniriumMeshProtocolVer = 1
	aniriumMeshMaxPayload  = 512 * 1024 // 512 KiB max per BEP-10 message
)

type meshMessage struct {
	Type         string             `json:"t"` // "hello", "skip_times", "sub_offer", "sub_req", "sub_data", "sub_share", "peer_pex", "party_sync", "party_chat"
	Version      int                `json:"v"`
	MALID        int                `json:"mal,omitempty"`
	Episode      int                `json:"ep,omitempty"`
	SkipTimes    *SkipTimes         `json:"skip,omitempty"`
	SubLang      string             `json:"lang,omitempty"`
	SubVTT       string             `json:"vtt,omitempty"`
	SubLinks     []ProviderSubtitle `json:"subLinks,omitempty"`
	Peers        []string           `json:"peers,omitempty"`
	RoomID       string             `json:"room,omitempty"`
	Author       string     `json:"author,omitempty"`
	MsgID        string     `json:"mid,omitempty"`
	Text         string     `json:"text,omitempty"`
	Position     float64    `json:"pos,omitempty"`
	Playing      bool       `json:"playing,omitempty"`
	PlaybackRate float64    `json:"rate,omitempty"`
	SentAtMs     int64      `json:"ts,omitempty"`
}

type aniriumMeshHub struct {
	mu           sync.RWMutex
	peers        map[*torrent.PeerConn]bool
	skipStore    map[string]*SkipTimes // key: "mal:ep"
	subStore     map[string]string     // key: "mal:ep:lang" -> WebVTT
	onSkipMerged func(malID, ep int, st *SkipTimes)
	onSubMerged  func(malID, ep int, lang, vtt string)

	partyRoom     string
	partyAuthor   string
	partyIsHost   bool
	partySeenMsgs map[string]bool
	onPartySync   func(msg meshMessage)
	onPartyChat   func(msg meshMessage)
}

var globalMeshHub = newAniriumMeshHub()

func newAniriumMeshHub() *aniriumMeshHub {
	return &aniriumMeshHub{
		peers:         map[*torrent.PeerConn]bool{},
		skipStore:     map[string]*SkipTimes{},
		subStore:      map[string]string{},
		partySeenMsgs: map[string]bool{},
	}
}

func meshEpisodeKey(malID, ep int) string {
	return fmt.Sprintf("%d:%d", malID, ep)
}

func meshSubtitleKey(malID, ep int, lang string) string {
	return fmt.Sprintf("%d:%d:%s", malID, ep, strings.ToLower(strings.TrimSpace(lang)))
}

func validateMeshSkipTimes(st *SkipTimes) bool {
	if st == nil || (st.OP == nil && st.ED == nil) {
		return false
	}
	check := func(iv *SkipInterval) bool {
		if iv == nil {
			return true
		}
		if iv.Start < 0 || iv.End <= iv.Start || (iv.End-iv.Start) > 300 {
			return false
		}
		return true
	}
	return check(st.OP) && check(st.ED)
}

func validateMeshVTT(vtt string) bool {
	trimmed := strings.TrimSpace(strings.TrimPrefix(vtt, "\ufeff"))
	if len(trimmed) == 0 || len(trimmed) > aniriumMeshMaxPayload {
		return false
	}
	if !strings.HasPrefix(trimmed, "WEBVTT") {
		return false
	}
	return strings.Contains(trimmed, "-->")
}

func (h *aniriumMeshHub) PublishSkipTimes(malID, ep int, st *SkipTimes) {
	if malID <= 0 || ep <= 0 || !validateMeshSkipTimes(st) {
		return
	}
	key := meshEpisodeKey(malID, ep)
	h.mu.Lock()
	h.skipStore[key] = st
	peers := h.snapshotPeersLocked()
	h.mu.Unlock()

	msg := meshMessage{
		Type:      "skip_times",
		Version:   aniriumMeshProtocolVer,
		MALID:     malID,
		Episode:   ep,
		SkipTimes: st,
	}
	for _, pc := range peers {
		go h.sendToPeer(pc, msg)
	}
}

func (h *aniriumMeshHub) PublishSubtitleLinks(malID, ep int, subs []ProviderSubtitle) {
	if len(subs) == 0 {
		return
	}
	safe := make([]ProviderSubtitle, 0, len(subs))
	for _, s := range subs {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(s.URL)), "https://") {
			safe = append(safe, s)
			if len(safe) >= 24 {
				break
			}
		}
	}
	if len(safe) == 0 {
		return
	}
	h.mu.RLock()
	peers := h.snapshotPeersLocked()
	h.mu.RUnlock()
	msg := meshMessage{
		Type:     "sub_share",
		Version:  aniriumMeshProtocolVer,
		MALID:    malID,
		Episode:  ep,
		SubLinks: safe,
	}
	for _, pc := range peers {
		go h.sendToPeer(pc, msg)
	}
}

func (h *aniriumMeshHub) PublishPeerPEX(addrs []string) {
	if len(addrs) == 0 {
		return
	}
	if len(addrs) > 40 {
		addrs = addrs[:40]
	}
	h.mu.RLock()
	peers := h.snapshotPeersLocked()
	h.mu.RUnlock()
	msg := meshMessage{
		Type:    "peer_pex",
		Version: aniriumMeshProtocolVer,
		Peers:   addrs,
	}
	for _, pc := range peers {
		go h.sendToPeer(pc, msg)
	}
}

func (h *aniriumMeshHub) PublishSubtitle(malID, ep int, lang, vtt string) {
	lang = strings.ToLower(strings.TrimSpace(lang))
	if malID <= 0 || ep <= 0 || lang == "" || !validateMeshVTT(vtt) {
		return
	}
	key := meshSubtitleKey(malID, ep, lang)
	h.mu.Lock()
	h.subStore[key] = vtt
	peers := h.snapshotPeersLocked()
	h.mu.Unlock()

	msg := meshMessage{
		Type:    "sub_offer",
		Version: aniriumMeshProtocolVer,
		MALID:   malID,
		Episode: ep,
		SubLang: lang,
	}
	for _, pc := range peers {
		go h.sendToPeer(pc, msg)
	}
}

func (h *aniriumMeshHub) GetSkipTimes(malID, ep int) *SkipTimes {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.skipStore[meshEpisodeKey(malID, ep)]
}

func (h *aniriumMeshHub) GetSubtitle(malID, ep int, lang string) (string, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	vtt, ok := h.subStore[meshSubtitleKey(malID, ep, lang)]
	return vtt, ok
}

func (h *aniriumMeshHub) PeerCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.peers)
}

func (h *aniriumMeshHub) snapshotPeersLocked() []*torrent.PeerConn {
	out := make([]*torrent.PeerConn, 0, len(h.peers))
	for pc := range h.peers {
		out = append(out, pc)
	}
	return out
}

func (h *aniriumMeshHub) sendToPeer(pc *torrent.PeerConn, msg meshMessage) {
	if pc == nil {
		return
	}
	raw, err := json.Marshal(msg)
	if err != nil || len(raw) > aniriumMeshMaxPayload {
		return
	}
	_ = pc.WriteExtendedMessage(aniriumMeshExtName, raw)
}

func (h *aniriumMeshHub) attachCallbacks(cb *torrent.Callbacks) {
	if cb == nil {
		return
	}

	cb.PeerConnAdded = append(cb.PeerConnAdded, func(pc *torrent.PeerConn) {
		if pc == nil || pc.LocalLtepProtocolMap == nil {
			return
		}
		custom := *pc.LocalLtepProtocolMap
		custom.AddUserProtocol(aniriumMeshExtName)
		pc.LocalLtepProtocolMap = &custom
	})

	prevExtHandshake := cb.ReadExtendedHandshake
	cb.ReadExtendedHandshake = func(pc *torrent.PeerConn, msg *pp.ExtendedHandshakeMessage) {
		if prevExtHandshake != nil {
			prevExtHandshake(pc, msg)
		}
		if pc == nil || msg == nil {
			return
		}
		if _, ok := msg.M[aniriumMeshExtName]; !ok {
			return
		}
		h.mu.Lock()
		h.peers[pc] = true
		var skipMsgs []meshMessage
		for k, st := range h.skipStore {
			var mal, ep int
			if _, err := fmt.Sscanf(k, "%d:%d", &mal, &ep); err == nil && mal > 0 && ep > 0 {
				skipMsgs = append(skipMsgs, meshMessage{
					Type:      "skip_times",
					Version:   aniriumMeshProtocolVer,
					MALID:     mal,
					Episode:   ep,
					SkipTimes: st,
				})
			}
		}
		var subOffers []meshMessage
		for k := range h.subStore {
			parts := strings.SplitN(k, ":", 3)
			if len(parts) == 3 {
				var mal, ep int
				_, _ = fmt.Sscanf(parts[0]+":"+parts[1], "%d:%d", &mal, &ep)
				if mal > 0 && ep > 0 {
					subOffers = append(subOffers, meshMessage{
						Type:    "sub_offer",
						Version: aniriumMeshProtocolVer,
						MALID:   mal,
						Episode: ep,
						SubLang: parts[2],
					})
				}
			}
		}
		h.mu.Unlock()

		go func() {
			h.sendToPeer(pc, meshMessage{Type: "hello", Version: aniriumMeshProtocolVer})
			for _, m := range skipMsgs {
				h.sendToPeer(pc, m)
			}
			for _, m := range subOffers {
				h.sendToPeer(pc, m)
			}
		}()
	}

	cb.PeerConnReadExtensionMessage = append(cb.PeerConnReadExtensionMessage, func(ev torrent.PeerConnReadExtensionMessageEvent) {
		if ev.PeerConn == nil || ev.PeerConn.LocalLtepProtocolMap == nil {
			return
		}
		name, _, err := ev.PeerConn.LocalLtepProtocolMap.LookupId(ev.ExtensionNumber)
		if err != nil || name != aniriumMeshExtName {
			return
		}
		if len(ev.Payload) == 0 || len(ev.Payload) > aniriumMeshMaxPayload {
			return
		}
		payloadCopy := append([]byte(nil), ev.Payload...)
		go h.handleMessage(ev.PeerConn, payloadCopy)
	})

	prevClosed := cb.PeerConnClosed
	cb.PeerConnClosed = func(pc *torrent.PeerConn) {
		if prevClosed != nil {
			prevClosed(pc)
		}
		if pc == nil {
			return
		}
		h.mu.Lock()
		delete(h.peers, pc)
		h.mu.Unlock()
	}
}

func (h *aniriumMeshHub) handleMessage(pc *torrent.PeerConn, raw []byte) {
	var msg meshMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "hello":
		h.mu.Lock()
		h.peers[pc] = true
		h.mu.Unlock()

	case "skip_times":
		if msg.MALID <= 0 || msg.Episode <= 0 || !validateMeshSkipTimes(msg.SkipTimes) {
			return
		}
		key := meshEpisodeKey(msg.MALID, msg.Episode)
		h.mu.Lock()
		_, existed := h.skipStore[key]
		if !existed {
			h.skipStore[key] = msg.SkipTimes
		}
		cb := h.onSkipMerged
		h.mu.Unlock()
		if !existed {
			mergeMeshSkipTimes(msg.MALID, msg.Episode, msg.SkipTimes)
			if cb != nil {
				cb(msg.MALID, msg.Episode, msg.SkipTimes)
			}
		}

	case "sub_offer":
		lang := strings.ToLower(strings.TrimSpace(msg.SubLang))
		if msg.MALID <= 0 || msg.Episode <= 0 || lang == "" {
			return
		}
		key := meshSubtitleKey(msg.MALID, msg.Episode, lang)
		h.mu.RLock()
		_, have := h.subStore[key]
		h.mu.RUnlock()
		if !have {
			h.sendToPeer(pc, meshMessage{
				Type:    "sub_req",
				Version: aniriumMeshProtocolVer,
				MALID:   msg.MALID,
				Episode: msg.Episode,
				SubLang: lang,
			})
		}

	case "sub_req":
		lang := strings.ToLower(strings.TrimSpace(msg.SubLang))
		if msg.MALID <= 0 || msg.Episode <= 0 || lang == "" {
			return
		}
		if vtt, ok := h.GetSubtitle(msg.MALID, msg.Episode, lang); ok {
			h.sendToPeer(pc, meshMessage{
				Type:    "sub_data",
				Version: aniriumMeshProtocolVer,
				MALID:   msg.MALID,
				Episode: msg.Episode,
				SubLang: lang,
				SubVTT:  vtt,
			})
		}

	case "sub_data":
		lang := strings.ToLower(strings.TrimSpace(msg.SubLang))
		if msg.MALID <= 0 || msg.Episode <= 0 || lang == "" || !validateMeshVTT(msg.SubVTT) {
			return
		}
		key := meshSubtitleKey(msg.MALID, msg.Episode, lang)
		h.mu.Lock()
		_, existed := h.subStore[key]
		if !existed {
			h.subStore[key] = msg.SubVTT
		}
		cb := h.onSubMerged
		h.mu.Unlock()
		if !existed && cb != nil {
			cb(msg.MALID, msg.Episode, lang, msg.SubVTT)
		}

	case "party_sync":
		h.handleIncomingPartySync(msg)

	case "party_chat":
		h.handleIncomingPartyChat(msg)
	}
}
