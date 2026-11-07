package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSessionCommandRejectsInvalidAndTrailingPayload(t *testing.T) {
	for _, payload := range []string{
		`{"action":"seek","position":-1}`, `{"action":"seek","unknown":true}`,
		`{"action":"seek"} {}`, `{"action":"destroy"}`, `{"action":"seek","bufferSeconds":31}`,
		`{"action":"seek","quality":"` + strings.Repeat("a", 4096) + `"}`,
	} {
		if _, err := decodePlaybackSessionCommand(strings.NewReader(payload)); err == nil {
			t.Fatalf("accepted invalid command")
		}
	}
	command, err := decodePlaybackSessionCommand(strings.NewReader(`{"action":"seek","quality":"720p","position":123.4,"playing":true,"bufferSeconds":60}`))
	if err != nil || command.Position != 123.4 || command.BufferSeconds != 60 {
		t.Fatalf("valid command: %v %v", command, err)
	}
}

func TestSessionOwnsChoicesAndRejectsUnavailableTrackWithoutMutation(t *testing.T) {
	swarmMu.Lock()
	previousSession, previousContext, previousGeneration := currentPlaybackSession, playbackContext, playbackGeneration
	previousDiscovery, previousQualities, previousCandidates := playbackDiscoveryComplete, currentMixQualities, selectedAudioCandidates
	playbackContext = context.Background()
	playbackGeneration = 42
	playbackDiscoveryComplete = true
	currentMixQualities = []string{"720p"}
	selectedAudioCandidates = []AudioCandidate{{Language: "jpn"}}
	currentPlaybackSession = playbackSessionState{Generation: 42}
	defer func() {
		currentPlaybackSession = previousSession
		playbackContext = previousContext
		playbackGeneration = previousGeneration
		playbackDiscoveryComplete = previousDiscovery
		currentMixQualities = previousQualities
		selectedAudioCandidates = previousCandidates
		swarmMu.Unlock()
	}()
	command := playbackSessionCommand{Action: "seek", Quality: "720p", Audio: "jpn", Position: 123.4, Playing: true, BufferSeconds: 60}
	if !applyPlaybackSessionCommandLocked(command) {
		t.Fatal("valid selection rejected")
	}
	want := currentPlaybackSession
	if want.Generation != 42 || want.Revision != 1 || want.Audio != "jpn" || want.Position != 123.4 || !want.Playing {
		t.Fatalf("session choices lost: %+v", want)
	}
	command.Audio = "por"
	if applyPlaybackSessionCommandLocked(command) || currentPlaybackSession != want {
		t.Fatal("unavailable audio changed session")
	}
	command.Audio = "jpn"
	command.Quality = "4k"
	if applyPlaybackSessionCommandLocked(command) || currentPlaybackSession != want {
		t.Fatal("unavailable quality changed session")
	}
}

func TestSessionEndpointRejectsCommandBeforeAnyMediaWork(t *testing.T) {
	for _, payload := range []string{`{"action":"seek","extra":true}`, `{"action":"seek"} {}`} {
		response := httptest.NewRecorder()
		handlePlaybackSession(response, httptest.NewRequest("POST", "/playback/session", strings.NewReader(payload)))
		if response.Code != 400 {
			t.Fatalf("invalid command status %d", response.Code)
		}
	}
}

func TestSessionEndpointRequiresPlaybackGrant(t *testing.T) {
	response := httptest.NewRecorder()
	newServiceHTTPHandler(4004).ServeHTTP(response, httptest.NewRequest("GET", "/playback/session", nil))
	if response.Code != 401 {
		t.Fatalf("unauthorized session exposed: %d", response.Code)
	}
}
