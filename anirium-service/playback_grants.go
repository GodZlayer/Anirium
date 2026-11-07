package main

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type playbackGrant struct {
	token, device, account string
	playerSession          string
	expires                time.Time
}

var grantMu sync.Mutex
var grants = map[string]playbackGrant{}

func issuePlaybackGrant(token, device, account string, playerSessions ...string) (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	id := hex.EncodeToString(bytes)
	grantMu.Lock()
	defer grantMu.Unlock()
	for key, grant := range grants {
		if time.Now().After(grant.expires) {
			delete(grants, key)
		}
	}
	grants[id] = playbackGrant{token: token, device: device, account: account, expires: time.Now().Add(5 * time.Minute)}
	if len(playerSessions) > 0 {
		grant := grants[id]
		grant.playerSession = playerSessions[0]
		grants[id] = grant
	}
	return id, nil
}

// renewPlaybackGrantDetailed keeps the Core denial reason/status when the
// session itself is rejected, and maps local grant mismatches to safe reasons.
func renewPlaybackGrantDetailed(id, token, device string) *serviceAuthRejection {
	auth, rejection := validateServiceTokenDetailed(token, device)
	if rejection != nil {
		return rejection
	}
	grantMu.Lock()
	defer grantMu.Unlock()
	grant, exists := grants[id]
	// Local grant-state conflicts are not Core verdicts: keep the legacy 401
	// and only propagate reasons that Core itself returned.
	if !exists || time.Now().After(grant.expires) || grant.device != device || grant.account != auth.AccountID ||
		(grant.playerSession != "" && grant.playerSession != auth.PlayerSessionID) {
		return &serviceAuthRejection{status: http.StatusUnauthorized, reason: serviceAuthReasonInvalid}
	}
	grant.token = token
	grant.expires = time.Now().Add(5 * time.Minute)
	grants[id] = grant
	return nil
}

func renewPlaybackGrant(id, token, device string) bool {
	return renewPlaybackGrantDetailed(id, token, device) == nil
}

func validatePlaybackGrantRejection(id string) *serviceAuthRejection {
	grantMu.Lock()
	grant, ok := grants[id]
	grantMu.Unlock()
	if !ok || time.Now().After(grant.expires) {
		return &serviceAuthRejection{status: http.StatusUnauthorized, reason: serviceAuthReasonInvalid}
	}
	authorization, rejection := validateServiceTokenDetailed(grant.token, grant.device)
	if rejection != nil {
		return rejection
	}
	// Local grant identity conflicts stay a generic 401; only Core's own
	// verdict above carries a distinct reason/status.
	if authorization.AccountID != grant.account || (grant.playerSession != "" && grant.playerSession != authorization.PlayerSessionID) {
		return &serviceAuthRejection{status: http.StatusUnauthorized, reason: serviceAuthReasonInvalid}
	}
	return nil
}

func validatePlaybackGrant(id string) bool {
	return validatePlaybackGrantRejection(id) == nil
}

func authorizePlaylist(data, ticket string) string {
	lines := strings.Split(data, "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		uri, err := url.Parse(line)
		if err != nil {
			continue
		}
		params := uri.Query()
		params.Set("playbackTicket", ticket)
		uri.RawQuery = params.Encode()
		lines[i] = uri.String()
	}
	return strings.Join(lines, "\n")
}
