package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestMasterPlaybackWithExternalAudioOverAuthorizedHTTP(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "input.mkv")
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=24", "-f", "lavfi", "-i", "sine=frequency=400", "-f", "lavfi", "-i", "sine=frequency=800", "-t", "8", "-map", "0:v", "-map", "1:a", "-map", "2:a", "-c:v", "libx264", "-c:a", "flac", input}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if out, err := exec.CommandContext(ctx, "ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, out)
	}
	videoDir := filepath.Join(root, "hls", "video")
	if _, err := transcodeSourceToHLS(input, videoDir, "480p", ctx); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(videoDir, "source.m3u8"), filepath.Join(videoDir, "index.m3u8")); err != nil {
		t.Fatal(err)
	}
	audioDir := filepath.Join(root, "hls", "audio")
	if err := transcodeAudioToHLS(ctx, input, audioDir, 2); err != nil {
		t.Fatal(err)
	}
	var authorized atomic.Bool
	authorized.Store(true)
	var validations atomic.Int32
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		validations.Add(1)
		if !authorized.Load() || r.URL.Path != "/api/service/session/validate" ||
			r.Header.Get("Authorization") != "Bearer fixture-token" || r.Header.Get("X-Anirium-Device") != "fixture-device" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"fixture-account","playerSessionId":"fixture-player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("fixture-token", "fixture-device", "fixture-account")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { grantMu.Lock(); delete(grants, ticket); grantMu.Unlock() }()
	swarmMu.Lock()
	oldAudio := selectedAudioCandidates
	oldQualities := currentMixQualities
	currentMixQualities = []string{"480p"}
	selectedAudioCandidates = []AudioCandidate{{Language: "por"}, {Language: "eng"}}
	audioID := audioTrackID(playbackGeneration, 0)
	videoID := playbackVariantID(playbackGeneration, "480p")
	pendingAudioID := audioTrackID(playbackGeneration, 1)
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{
		videoID:        {MixVariant: MixVariant{ID: videoID, Quality: "480p", Status: "ready", PlaylistURL: "/hls/" + videoID + "/master.m3u8"}, Dir: videoDir},
		audioID:        {MixVariant: MixVariant{ID: audioID, Status: "ready", PlaylistURL: "/hls/" + audioID + "/index.m3u8"}, Dir: audioDir},
		pendingAudioID: {MixVariant: MixVariant{ID: pendingAudioID, Status: "preparing", PlaylistURL: "/must-not-be-published"}, Dir: root},
	}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		selectedAudioCandidates = oldAudio
		currentMixQualities = oldQualities
		variantMu.Lock()
		variantRuntimes = oldRuntimes
		variantMu.Unlock()
		swarmMu.Unlock()
	}()
	var audioRequests atomic.Int32
	handler := newServiceHTTPHandler(0)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/hls/"+audioID+"/") {
			audioRequests.Add(1)
		}
		handler.ServeHTTP(w, r)
	}))
	defer server.Close()
	// A completed video producer must not expose a silent master while the
	// content's separately demuxed audio is still being prepared.
	variantMu.Lock()
	variantRuntimes[audioID].Status = "preparing"
	variantMu.Unlock()
	pendingRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/manifest", nil)
	if err != nil {
		t.Fatal(err)
	}
	pendingRequest.Header.Set("Authorization", "Bearer fixture-token")
	pendingRequest.Header.Set("X-Anirium-Device", "fixture-device")
	pendingResponse, err := http.DefaultClient.Do(pendingRequest)
	if err != nil {
		t.Fatal(err)
	}
	var pendingManifest MixManifest
	err = json.NewDecoder(pendingResponse.Body).Decode(&pendingManifest)
	pendingResponse.Body.Close()
	if err != nil || pendingResponse.StatusCode != 200 || len(pendingManifest.Variants) != 1 || pendingManifest.Variants[0].Status != "preparing" || pendingManifest.Variants[0].PlaylistURL != "" {
		t.Fatalf("premature video exposed: %+v %v", pendingManifest, err)
	}
	if pendingManifest.BufferPercent != 0 {
		t.Fatal("pending audio advertised a fully playable buffer")
	}
	pendingMaster, err := http.Get(server.URL + ticketURL("/hls/"+videoID+"/master.m3u8", ticket))
	if err != nil {
		t.Fatal(err)
	}
	pendingMaster.Body.Close()
	if pendingMaster.StatusCode != http.StatusServiceUnavailable || pendingMaster.Header.Get("Retry-After") != "1" {
		t.Fatal("master playlist bypassed audio preparation")
	}
	variantMu.Lock()
	variantRuntimes[audioID].Status = "ready"
	variantRuntimes[audioID].BufferedSeconds = 4
	variantMu.Unlock()
	availableAudio, _, err := readGeneratedHLS(filepath.Join(audioDir, "index.m3u8"))
	if err != nil || len(availableAudio) == 0 {
		t.Fatalf("audio fixture unavailable: %v", err)
	}
	if err := publishEventPlaylist(ctx, audioDir, availableAudio[:1], false); err != nil {
		t.Fatal(err)
	}
	markVariantStalled(audioID)
	manifestRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/manifest", nil)
	if err != nil {
		t.Fatal(err)
	}
	manifestRequest.Header.Set("Authorization", "Bearer fixture-token")
	manifestRequest.Header.Set("X-Anirium-Device", "fixture-device")
	manifestResponse, err := http.DefaultClient.Do(manifestRequest)
	if err != nil {
		t.Fatal(err)
	}
	manifestData, err := io.ReadAll(manifestResponse.Body)
	manifestResponse.Body.Close()
	var manifest MixManifest
	if err != nil || manifestResponse.StatusCode != http.StatusOK || json.Unmarshal(manifestData, &manifest) != nil {
		t.Fatalf("real manifest failed: status=%d err=%v", manifestResponse.StatusCode, err)
	}
	if len(manifest.Qualities) != 1 || manifest.Qualities[0] != "480p" || len(manifest.Audios) != 1 || manifest.Audios[0] != "por" || len(manifest.AudioTracks) != 2 || manifest.AudioTracks[1].PlaylistURL != "" || len(manifest.Variants) != 1 || manifest.Variants[0].Status != "ready" {
		t.Fatalf("manifest published unavailable options: %s", manifestData)
	}
	if !manifest.AudioTracks[0].ProcessingFailed || manifest.AudioTracks[0].ProcessingComplete || manifest.AudioTracks[0].BufferedSeconds != 4 {
		t.Fatalf("HTTP manifest concealed partial audio failure: %s", manifestData)
	}
	for _, private := range []string{root, "fixture-token", "fixture-device", "magnet:", "must-not-be-published"} {
		if strings.Contains(string(manifestData), private) {
			t.Fatalf("manifest exposed private or unready data: %s", private)
		}
	}
	masterURL := server.URL + manifest.Variants[0].PlaylistURL + "?playbackTicket=" + ticket
	decoded, err := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", masterURL, "-map", "0:a:0", "-t", "1", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
	if err != nil {
		t.Fatalf("master decode: %v", err)
	}
	if out, err := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", masterURL, "-map", "0:v:0", "-t", "1", "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("master video decode: %v %s", err, out)
	}
	crossings := 0
	for offset := 2; offset+1 < len(decoded); offset += 2 {
		previous := int16(binary.LittleEndian.Uint16(decoded[offset-2 : offset]))
		current := int16(binary.LittleEndian.Uint16(decoded[offset : offset+2]))
		if previous < 0 && current >= 0 {
			crossings++
		}
	}
	if crossings < 750 || crossings > 850 || audioRequests.Load() < 2 || validations.Load() < 4 {
		t.Fatalf("crossings=%d audio requests=%d validations=%d", crossings, audioRequests.Load(), validations.Load())
	}
	assertMediaRejected := func() {
		t.Helper()
		for _, path := range []string{"/hls/" + videoID + "/master.m3u8", "/hls/" + videoID + "/index.m3u8", "/hls/" + audioID + "/audio-000000.ts"} {
			response, err := http.Get(server.URL + path + "?playbackTicket=" + ticket)
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			if response.StatusCode != http.StatusUnauthorized {
				t.Fatalf("invalid grant accessed %s: %d", path, response.StatusCode)
			}
		}
	}
	grantMu.Lock()
	validGrant := grants[ticket]
	expiredGrant := validGrant
	expiredGrant.expires = time.Now().Add(-time.Minute)
	grants[ticket] = expiredGrant
	grantMu.Unlock()
	assertMediaRejected()
	if renewPlaybackGrant(ticket, "fixture-token", "fixture-device") {
		t.Fatal("expired grant was renewed despite its expired media lease")
	}
	renewResponse, err := http.Post(server.URL+"/playback/renew", "application/json", strings.NewReader(fmt.Sprintf(
		`{"playbackTicket":%q,"token":"fixture-token","deviceId":"fixture-device"}`, ticket)))
	if err != nil {
		t.Fatal(err)
	}
	renewResponse.Body.Close()
	if renewResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expired HTTP renewal accepted: %d", renewResponse.StatusCode)
	}
	grantMu.Lock()
	grants[ticket] = validGrant
	grantMu.Unlock()
	authorized.Store(false)
	assertMediaRejected()
}
