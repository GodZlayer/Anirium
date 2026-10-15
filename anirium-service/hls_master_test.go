package main

import (
	"strings"
	"testing"
)

func TestVideoPlaybackWaitsForExistingAudioButAllowsSilentContent(t *testing.T) {
	if !audioPlaybackReady(nil) {
		t.Fatal("silent content blocked")
	}
	tracks := []AudioTrack{{Language: "jpn", Status: "preparing"}}
	if audioPlaybackReady(tracks) {
		t.Fatal("pending audio permits silent startup")
	}
	tracks[0].Status = "ready"
	if audioPlaybackReady(tracks) {
		t.Fatal("missing audio playlist accepted")
	}
	tracks[0].PlaylistURL = "/hls/audio/index.m3u8"
	if !audioPlaybackReady(tracks) {
		t.Fatal("playable audio blocked")
	}
}

func TestMasterPlaylistIncludesOnlyReadyAuthorizedAudio(t *testing.T) {
	playlist := masterPlaylist("video", []AudioTrack{
		{Language: "por", Status: "ready", PlaylistURL: "/hls/audio-1/index.m3u8"},
		{Language: "eng", Status: "preparing"},
		{Language: "jpn", Status: "ready", PlaylistURL: "/hls/audio-2/index.m3u8"},
	}, "test-ticket")
	if strings.Contains(playlist, "eng") || strings.Count(playlist, "TYPE=AUDIO") != 2 || strings.Count(playlist, "DEFAULT=YES") != 1 {
		t.Fatal(playlist)
	}
	if strings.Count(playlist, "playbackTicket=test-ticket") != 3 {
		t.Fatal("some media URIs lack authorization: " + playlist)
	}
}
