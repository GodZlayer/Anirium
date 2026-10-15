package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
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

// Sequential synthetic-media pipeline: manifest -> playlists/segments decode
// -> audio -> WebVTT with cue and offset -> seek/posterior window. All media is
// generated locally with ffmpeg and all HTTP hops stay on loopback fixture
// servers; no torrent swarm or external peer is contacted (fixture, not live).
func TestSyntheticMediaPipelineSequentialHTTP(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "episode.mkv")
	subEng := filepath.Join(root, "en.srt")
	subPor := filepath.Join(root, "pt.srt")
	for path, text := range map[string]string{
		subEng: "English cue",
		subPor: "Legenda",
	} {
		if err := os.WriteFile(path, []byte("1\n00:00:00,000 --> 00:00:01,000\n"+text+"\n\n2\n00:00:10,000 --> 00:00:11,000\n"+text+" tarde\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	genArgs := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=24", "-f", "lavfi", "-i", "sine=frequency=400", "-i", subEng, "-i", subPor, "-t", "16", "-map", "0:v", "-map", "1:a", "-map", "2:s", "-map", "3:s", "-c:v", "libx264", "-c:a", "aac", "-c:s", "srt", "-metadata:s:s:0", "language=eng", "-metadata:s:s:1", "language=por", input}
	if out, err := exec.Command(mediaTool("ffmpeg"), genArgs...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, out)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	videoDir := filepath.Join(root, "hls", "video")
	if _, err := transcodeSourceToHLS(input, videoDir, "120p", ctx); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(videoDir, "source.m3u8"), filepath.Join(videoDir, "index.m3u8")); err != nil {
		t.Fatal(err)
	}
	audioDir := filepath.Join(root, "hls", "audio")
	if err := transcodeAudioToHLS(ctx, input, audioDir, 1); err != nil {
		t.Fatal(err)
	}
	// Embedded subtitle fixture with a cue after the seek offset.
	subInput := filepath.Join(root, "subs.mkv")
	subGen := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=160x120:r=8", "-i", subEng, "-t", "12", "-map", "0:v", "-map", "1:s", "-c:v", "libx264", "-c:s", "srt", subInput}
	if out, err := exec.Command(mediaTool("ffmpeg"), subGen...).CombinedOutput(); err != nil {
		t.Fatalf("sub fixture: %v %s", err, out)
	}
	subCache := newMediaInputCache(ctx, func(_ context.Context, _ string, _ int) (string, error) { return subInput, nil }, func(string) {})
	window, err := extractCachedSubtitleWindow(ctx, subCache, "fixture", 1, 8)
	if err != nil || !strings.Contains(window, "00:02.000 --> 00:03.000") || !strings.Contains(window, "English cue tarde") || strings.Contains(window, "00:00.000 --> 00:01.000") {
		t.Fatalf("subtitle window lost offset or cue: %v %s", err, window)
	}
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/service/session/validate" || r.Header.Get("Authorization") != "Bearer fixture-token" || r.Header.Get("X-Anirium-Device") != "fixture-device" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"fixture-account","playerSessionId":"fixture-player"}`)
	}))
	defer core.Close()
	if !strings.HasPrefix(core.URL, "http://127.0.0.1") {
		t.Fatalf("fixture core must stay loopback: %s", core.URL)
	}
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	ticket, err := issuePlaybackGrant("fixture-token", "fixture-device", "fixture-account")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { grantMu.Lock(); delete(grants, ticket); grantMu.Unlock() }()
	subs := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-subrip")
		fmt.Fprint(w, "1\n00:00:00,000 --> 00:00:01,000\nEnglish fixture\n")
	}))
	defer subs.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", subs.URL)

	swarmMu.Lock()
	oldAudio := selectedAudioCandidates
	oldQualities := currentMixQualities
	oldLinks := activeLinks
	oldContext := playbackContext
	oldInputs := playbackInputs
	oldDiscovery := playbackDiscoveryComplete
	oldFormats := probedFormats
	oldStreams := probedStreams
	oldSubs := externalSubtitles
	oldAudios, oldMixSubs := currentMixAudios, currentMixSubs
	currentMixQualities = []string{"120p"}
	currentMixAudios, currentMixSubs = []string{"eng"}, []string{"por"}
	selectedAudioCandidates = []AudioCandidate{{Source: "fixture", StreamIndex: 1, Language: "eng", Channels: 1, SampleRate: 48000}}
	activeLinks = []string{"fixture"}
	probedStreams = map[string][]ffprobeStream{"fixture": {{Index: 0, CodecType: "video", CodecName: "h264", Width: 160, Height: 120}}}
	probedFormats = map[string]ffprobeOutput{}
	externalSubtitles = []ProviderSubtitle{{Language: "eng", Title: "Fixture", Format: "srt", URL: subs.URL + "/episode.srt"}}
	playbackContext = ctx
	playbackDiscoveryComplete = true
	playbackInputs = newMediaInputCache(ctx, func(_ context.Context, _ string, _ int) (string, error) { return input, nil }, func(string) {})
	audioID := audioTrackID(playbackGeneration, 0)
	videoID := playbackVariantID(playbackGeneration, "120p")
	variantMu.Lock()
	oldRuntimes := variantRuntimes
	variantRuntimes = map[string]*variantRuntime{
		videoID: {MixVariant: MixVariant{ID: videoID, Quality: "120p", Status: "ready", ProcessingComplete: true, BufferedSeconds: 16, PlaylistURL: "/hls/" + videoID + "/master.m3u8"}, Dir: videoDir},
		audioID: {MixVariant: MixVariant{ID: audioID, Status: "ready", ProcessingComplete: true, BufferedSeconds: 16, PlaylistURL: "/hls/" + audioID + "/index.m3u8"}, Dir: audioDir},
	}
	variantMu.Unlock()
	swarmMu.Unlock()
	defer func() {
		swarmMu.Lock()
		cancelPlaybackWindowLocked()
		selectedAudioCandidates = oldAudio
		currentMixQualities = oldQualities
		currentMixAudios, currentMixSubs = oldAudios, oldMixSubs
		activeLinks, probedFormats, probedStreams, externalSubtitles = oldLinks, oldFormats, oldStreams, oldSubs
		playbackContext, playbackInputs, playbackDiscoveryComplete = oldContext, oldInputs, oldDiscovery
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

	get := func(path string, headers ...string) *http.Response {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		for i := 0; i+1 < len(headers); i += 2 {
			request.Header.Set(headers[i], headers[i+1])
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		return response
	}
	if response := get("/manifest"); response.StatusCode != http.StatusUnauthorized {
		response.Body.Close()
		t.Fatalf("manifest without session accepted: %d", response.StatusCode)
	} else {
		response.Body.Close()
	}
	manifestResponse := get("/manifest", "Authorization", "Bearer fixture-token", "X-Anirium-Device", "fixture-device")
	manifestData, err := io.ReadAll(manifestResponse.Body)
	manifestResponse.Body.Close()
	var manifest MixManifest
	if err != nil || manifestResponse.StatusCode != 200 || json.Unmarshal(manifestData, &manifest) != nil {
		t.Fatalf("manifest: %d %v", manifestResponse.StatusCode, err)
	}
	if len(manifest.Qualities) != 1 || manifest.Qualities[0] != "120p" || len(manifest.Audios) != 1 || manifest.Audios[0] != "eng" || len(manifest.AudioTracks) != 1 || manifest.AudioTracks[0].Status != "ready" || len(manifest.SubtitleTracks) != 1 {
		t.Fatalf("unexpected manifest: %s", manifestData)
	}
	if len(manifest.Variants) != 1 || manifest.Variants[0].Status != "ready" || !strings.HasSuffix(manifest.Variants[0].PlaylistURL, "/master.m3u8") {
		t.Fatalf("variant not published: %s", manifestData)
	}
	trackID := manifest.SubtitleTracks[0].ID
	if !strings.HasPrefix(trackID, "external-") || strings.Contains(string(manifestData), "fixture-token") || strings.Contains(string(manifestData), "magnet:") {
		t.Fatalf("manifest leaked internals: %s", manifestData)
	}
	vttResponse := get("/subtitles?trackId=" + trackID + "&playbackTicket=" + ticket)
	vttData, err := io.ReadAll(vttResponse.Body)
	vttResponse.Body.Close()
	if err != nil || vttResponse.StatusCode != 200 || vttResponse.Header.Get("Content-Type") != "text/vtt; charset=utf-8" || !strings.Contains(string(vttData), "WEBVTT") || !strings.Contains(string(vttData), "00:00.000 --> 00:01.000") {
		t.Fatalf("subtitle pipeline broken: %d %v %.80s", vttResponse.StatusCode, err, vttData)
	}
	if bad := get("/subtitles?trackId=" + trackID + "&playbackTicket=expired"); bad.StatusCode != http.StatusUnauthorized {
		bad.Body.Close()
		t.Fatalf("subtitle without grant: %d", bad.StatusCode)
	} else {
		bad.Body.Close()
	}
	masterURL := server.URL + manifest.Variants[0].PlaylistURL + "?playbackTicket=" + ticket
	decoded, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", masterURL, "-map", "0:a:0", "-t", "1", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
	if err != nil || len(decoded) == 0 {
		t.Fatalf("master audio decode: %v", err)
	}
	if out, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", masterURL, "-map", "0:v:0", "-t", "1", "-f", "null", "-").CombinedOutput(); err != nil {
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
	// The fixture contains a 400 Hz sine: one positive crossing per cycle.
	if crossings < 380 || crossings > 420 || audioRequests.Load() < 1 {
		t.Fatalf("audio decode crossings=%d requests=%d", crossings, audioRequests.Load())
	}

	// Seek: request the posterior window and follow it through manifest/HTTP.
	post, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/playback/window?quality=120p&position=8&playbackTicket="+ticket, nil)
	if err != nil {
		t.Fatal(err)
	}
	postResponse, err := http.DefaultClient.Do(post)
	if err != nil {
		t.Fatal(err)
	}
	postResponse.Body.Close()
	if postResponse.StatusCode != http.StatusAccepted {
		t.Fatalf("window request rejected: %d", postResponse.StatusCode)
	}
	deadline := time.Now().Add(60 * time.Second)
	for {
		getWindow := get("/playback/window?quality=120p&position=8&playbackTicket=" + ticket)
		var snapshot playbackWindow
		err := json.NewDecoder(getWindow.Body).Decode(&snapshot)
		getWindow.Body.Close()
		if err == nil && snapshot.Status == "ready" && snapshot.PlaylistURL != "" {
			if math.Abs(snapshot.DeliveredDuration-8) > 0.5 {
				t.Fatalf("window not the episode tail: %+v", snapshot)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("window never ready: %+v err=%v", snapshot, err)
		}
		time.Sleep(250 * time.Millisecond)
	}
	windowManifestResponse := get("/manifest", "Authorization", "Bearer fixture-token", "X-Anirium-Device", "fixture-device")
	windowData, err := io.ReadAll(windowManifestResponse.Body)
	windowManifestResponse.Body.Close()
	var windowManifest MixManifest
	if err != nil || json.Unmarshal(windowData, &windowManifest) != nil || len(windowManifest.Variants) != 1 || windowManifest.Variants[0].Status != "ready" || !strings.Contains(windowManifest.Variants[0].PlaylistURL, "window-") {
		t.Fatalf("window not published: %s", windowData)
	}
	if len(windowManifest.AudioTracks) != 1 || windowManifest.AudioTracks[0].Status != "ready" || !strings.HasPrefix(windowManifest.AudioTracks[0].ID, "window-") {
		t.Fatalf("window audio not published: %s", windowData)
	}
	windowMaster := server.URL + windowManifest.Variants[0].PlaylistURL + "?playbackTicket=" + ticket
	if out, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", windowMaster, "-map", "0:v:0", "-t", "1", "-f", "null", "-").CombinedOutput(); err != nil {
		t.Fatalf("window video decode: %v %s", err, out)
	}
	windowAudio := server.URL + windowManifest.AudioTracks[0].PlaylistURL + "?playbackTicket=" + ticket
	wDecoded, err := exec.CommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", windowAudio, "-t", "1", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
	if err != nil || len(wDecoded) == 0 {
		t.Fatalf("window audio decode: %v", err)
	}
	wCrossings := 0
	// Ignore codec startup/end transients when checking the fixture's tone.
	for offset := 9602; offset+1 < len(wDecoded)-9600; offset += 2 {
		previous := int16(binary.LittleEndian.Uint16(wDecoded[offset-2 : offset]))
		current := int16(binary.LittleEndian.Uint16(wDecoded[offset : offset+2]))
		if previous < 0 && current >= 0 {
			wCrossings++
		}
	}
	wantCrossings := float64(len(wDecoded)-19200) / 96000 * 400
	if wantCrossings <= 0 || math.Abs(float64(wCrossings)-wantCrossings) > wantCrossings*0.1 {
		t.Fatalf("window audio tone missing: crossings=%d", wCrossings)
	}
	indexURL := strings.Replace(windowManifest.Variants[0].PlaylistURL, "/master.m3u8", "/index.m3u8", 1)
	playlistBody, err := http.Get(server.URL + indexURL + "?playbackTicket=" + ticket)
	if err != nil {
		t.Fatal(err)
	}
	playlistData, _ := io.ReadAll(playlistBody.Body)
	playlistBody.Body.Close()
	if !strings.Contains(string(playlistData), "#EXT-X-ENDLIST") {
		t.Fatalf("window playlist incomplete: %.120s", playlistData)
	}
}
