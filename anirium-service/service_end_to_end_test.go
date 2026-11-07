package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

// A subprocess isolates the production playback globals. Core/provider are
// fixtures; media preparation and torrent transfer use production implementations.
func TestServiceEndToEndThirtySecondJointBuffer(t *testing.T) {
	t.Setenv("ANIRIUM_E2E_LONG_BUFFER", "1")
	t.Setenv("ANIRIUM_CONTINUOUS_BUFFER", "1")
	TestServiceEndToEndAuthorizedPeerPlayback(t)
}

func TestServiceEndToEndAuthorizedPeerPlayback(t *testing.T) {
	if os.Getenv("ANIRIUM_E2E_CHILD") != "1" {
		ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
		defer cancel()
		command := mediaCommandContext(ctx, os.Args[0], "-test.run=^TestServiceEndToEndAuthorizedPeerPlayback$", "-test.timeout=120s", "-test.v")
		command.Env = append(os.Environ(), "ANIRIUM_E2E_CHILD=1")
		output, err := command.CombinedOutput()
		if err != nil {
			t.Fatalf("isolated integration: %v\n%s", err, output)
		}
		t.Log(string(output))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Second)
	defer cancel()
	root := t.TempDir()
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=854x480:r=24", "-f", "lavfi", "-i", "sine=frequency=400:sample_rate=48000"}
	for _, lang := range []string{"por", "eng"} {
		path := filepath.Join(root, lang+".srt")
		if err := os.WriteFile(path, []byte("1\n00:00:00,000 --> 00:00:01,000\n"+lang+" early\n\n2\n00:00:05,000 --> 00:00:06,000\n"+lang+" late\n"), 0600); err != nil {
			t.Fatal(err)
		}
		args = append(args, "-i", path)
	}
	input := filepath.Join(root, "Show S01E03.mkv")
	longBuffer := os.Getenv("ANIRIUM_E2E_LONG_BUFFER") == "1"
	fixtureDuration := "8"
	if longBuffer {
		fixtureDuration = "64"
	}
	args = append(args, "-t", fixtureDuration, "-map", "0:v", "-map", "1:a", "-map", "2:s", "-map", "3:s", "-c:v", "libx264", "-threads:v", "2", "-c:a", "aac", "-c:s", "srt", "-metadata:s:a:0", "language=jpn", "-metadata:s:s:0", "language=por", "-metadata:s:s:1", "language=eng", input)
	if out, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, out)
	}
	info := metainfo.Info{PieceLength: 16 << 10}
	if err := info.BuildFromFilePath(input); err != nil {
		t.Fatal(err)
	}
	encoded, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	mi := metainfo.MetaInfo{InfoBytes: encoded}
	makeClient := func(dir string, seed bool) *torrent.Client {
		cfg := torrent.NewDefaultClientConfig()
		cfg.DataDir = dir
		cfg.Seed = seed
		cfg.NoDHT = true
		cfg.DisableTrackers = true
		cfg.DisablePEX = true
		cfg.DisableUTP = true
		cfg.DisableIPv6 = true
		cfg.NoDefaultPortForwarding = true
		cfg.ListenPort = 0
		cfg.ListenHost = func(string) string { return "127.0.0.1" }
		cfg.DropMutuallyCompletePeers = false
		client, closeClient, err := newManagedTorrentClient(cfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(closeClient)
		return client
	}
	seed := makeClient(root, true)
	seeded, err := seed.AddTorrent(&mi)
	if err != nil {
		t.Fatal(err)
	}
	seeded.VerifyData()
	select {
	case <-seeded.Complete().On():
	case <-ctx.Done():
		t.Fatal("seeder verification timeout")
	}
	leecher := makeClient(t.TempDir(), false)
	torrentClient = leecher
	t.Cleanup(stopPlaybackWorkers)
	magnet := "magnet:?xt=urn:btih:" + mi.HashInfoBytes().HexString()
	packagedExecutable := os.Getenv("ANIRIUM_PACKAGED_SERVICE")
	var peerGate chan struct{}
	if packagedExecutable != "" {
		proxy, err := net.Listen("tcp4", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer proxy.Close()
		peerGate = make(chan struct{})
		go func() {
			select {
			case <-peerGate:
			case <-ctx.Done():
				return
			}
			for {
				incoming, err := proxy.Accept()
				if err != nil {
					return
				}
				go func() {
					defer incoming.Close()
					outgoing, err := net.DialTimeout("tcp4", seed.ListenAddrs()[0].String(), 5*time.Second)
					if err != nil {
						return
					}
					defer outgoing.Close()
					stop := context.AfterFunc(ctx, func() { incoming.Close(); outgoing.Close() })
					defer stop()
					go func() { io.Copy(outgoing, incoming); outgoing.Close() }()
					io.Copy(incoming, outgoing)
				}()
			}
		}()
		magnet += "&x.pe=" + url.QueryEscape(proxy.Addr().String())
	}
	var searches atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/manifest" {
			json.NewEncoder(w).Encode(ProviderManifest{ID: "fixture.provider", Capabilities: []string{"magnet.search"}, Endpoints: map[string]string{"search": "/search"}, Search: MinimalProviderSearch{Parameter: "q", Response: "results", Fields: []string{"title", "link", "seeders", "leechers"}}})
			return
		}
		if r.URL.Path != "/search" || len(r.URL.Query()) != 1 || r.URL.Query().Get("q") == "" {
			http.Error(w, "invalid minimal query", 400)
			return
		}
		searches.Add(1)
		json.NewEncoder(w).Encode(map[string]any{"results": []MinimalProviderResult{{Title: "Show S01E03", Link: magnet}, {Title: "Show S01E03", Link: magnet}}})
	}))
	defer provider.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", provider.URL)
	var plus atomic.Bool
	var revoked atomic.Bool
	config, _ := json.Marshal(map[string]any{"id": "fixture.provider", "capabilities": []string{"provider.server"}, "manifestUrl": provider.URL + "/manifest"})
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if revoked.Load() {
			http.Error(w, "revoked session", http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/api/service/session/validate" || r.Header.Get("Authorization") != "Bearer fixture-token" || r.Header.Get("X-Anirium-Device") != "fixture-device" {
			http.Error(w, "unauthorized", 401)
			return
		}
		level := 1
		if plus.Load() {
			level = 2
		}
		json.NewEncoder(w).Encode(serviceAuthorization{Status: "authorized", Level: level, AccountID: "fixture-account", PlayerSessionID: "fixture-player", AuthorizedAddonIDs: []string{"fixture.provider"}, InstalledAddons: []accountAddon{{ID: "fixture.provider", Config: config}}})
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	server := httptest.NewServer(newServiceHTTPHandler(0))
	defer server.Close()
	serviceURL := server.URL
	if packagedExecutable != "" {
		command := mediaCommandContext(ctx, packagedExecutable, "--headless", "--port=0", "--data-dir="+filepath.Join(t.TempDir(), "packaged-torrent-data"), "--no-peer-discovery")
		command.Env = os.Environ()
		stdout, err := command.StdoutPipe()
		if err != nil {
			t.Fatal(err)
		}
		command.Stderr = os.Stderr
		if err := command.Start(); err != nil {
			t.Fatal(err)
		}
		defer func() { command.Process.Kill(); command.Wait() }()
		started := make(chan int, 1)
		go func() {
			var status struct{ Port int }
			if json.NewDecoder(stdout).Decode(&status) == nil {
				started <- status.Port
			} else {
				started <- 0
			}
		}()
		select {
		case port := <-started:
			if port == 0 {
				t.Fatal("packaged Service did not initialize")
			}
			serviceURL = fmt.Sprintf("http://127.0.0.1:%d", port)
		case <-ctx.Done():
			t.Fatal("packaged Service startup timeout")
		}
	}
	request := func(method, path, body string) *http.Response {
		req, err := http.NewRequestWithContext(ctx, method, serviceURL+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer fixture-token")
		req.Header.Set("X-Anirium-Device", "fixture-device")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp
	}
	payload := `{"title":"Show","season":1,"episode":3,"token":"fixture-token","deviceId":"fixture-device"}`
	rejected := request("POST", "/playback/prepare", payload)
	var rejection struct {
		Status string
		Reason string
	}
	json.NewDecoder(rejected.Body).Decode(&rejection)
	rejected.Body.Close()
	if rejected.StatusCode != http.StatusForbidden || rejection.Reason != "plus_required" || searches.Load() != 0 {
		t.Fatal("non-Plus account started provider lookup")
	}
	plus.Store(true)
	prepared := request("POST", "/playback/prepare", payload)
	var result struct {
		Status         string
		Sources        int
		PlaybackTicket string
	}
	if err := json.NewDecoder(prepared.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	prepared.Body.Close()
	if prepared.StatusCode != 200 || result.Status != "preparing" || result.Sources != 1 || result.PlaybackTicket == "" {
		t.Fatalf("prepare: %d %+v", prepared.StatusCode, result)
	}
	// Initially no peer is available: the manifest must not invent ready media.
	pending := request("GET", "/manifest", "")
	var initial MixManifest
	json.NewDecoder(pending.Body).Decode(&initial)
	pending.Body.Close()
	for _, variant := range initial.Variants {
		if variant.Status == "ready" {
			t.Fatal("ready media before peer availability")
		}
	}
	beforeTransfer := leecher.ConnStats()
	if beforeTransfer.BytesReadData.Int64() != 0 {
		t.Fatal("unexpected transfer before local peer introduced")
	}
	if peerGate != nil {
		close(peerGate)
	} else {
		peerMagnet := magnet + "&x.pe=" + url.QueryEscape(seed.ListenAddrs()[0].String())
		if _, err := leecher.AddMagnet(peerMagnet); err != nil {
			t.Fatal(err)
		}
	}
	var manifest MixManifest
	sessionStarted := false
	for {
		response := request("GET", "/manifest", "")
		err := json.NewDecoder(response.Body).Decode(&manifest)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if manifest.ContinuousBuffer && !sessionStarted && len(manifest.Qualities) > 0 && len(manifest.AudioChoices) > 0 {
			for _, variant := range manifest.Variants {
				if variant.Status == "ready" {
					t.Fatal("session encoded video before a playback choice")
				}
			}
			for _, track := range manifest.AudioTracks {
				if track.Status == "ready" {
					t.Fatal("session encoded audio before a playback choice")
				}
			}
			command, _ := json.Marshal(playbackSessionCommand{Action: "seek", Quality: manifest.Qualities[0], Audio: manifest.AudioChoices[0], Playing: true})
			response := request("POST", "/playback/session?playbackTicket="+url.QueryEscape(result.PlaybackTicket), string(command))
			response.Body.Close()
			if response.StatusCode != http.StatusAccepted {
				t.Fatalf("initial session command: %d", response.StatusCode)
			}
			sessionStarted = true
		}
		if len(manifest.Variants) > 0 && manifest.Variants[0].Status == "ready" && len(manifest.AudioTracks) == 1 && manifest.AudioTracks[0].Status == "ready" && len(manifest.SubtitleTracks) == 2 {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatalf("media never ready: %+v", manifest)
		case <-time.After(100 * time.Millisecond):
		}
	}
	if len(manifest.Audios) != 1 || manifest.Audios[0] != "jpn" || len(manifest.Qualities) != 1 || manifest.Qualities[0] != "480p" {
		t.Fatalf("inventory: %+v", manifest)
	}
	if longBuffer && !manifest.ContinuousBuffer {
		t.Fatal("continuous buffer capability missing")
	}
	ticket := url.QueryEscape(result.PlaybackTicket)
	for _, track := range manifest.SubtitleTracks {
		response := request("GET", "/subtitles?trackId="+url.QueryEscape(track.ID)+"&start=4&playbackTicket="+ticket, "")
		data, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 || !strings.Contains(string(data), "00:01.000 --> 00:02.000\n"+track.Language+" late") || strings.Contains(string(data), "early") {
			t.Fatalf("subtitle: %d %s %v", response.StatusCode, data, err)
		}
	}
	playlist := serviceURL + manifest.Variants[0].PlaylistURL + "?playbackTicket=" + ticket
	for _, stream := range []string{"0:v:0", "0:a:0"} {
		if out, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", playlist, "-map", stream, "-t", "1", "-f", "null", "-").CombinedOutput(); err != nil {
			t.Fatalf("decode %s: %v %s", stream, err, out)
		}
	}
	seekPath := "/playback/window?quality=480p&position=4&playbackTicket=" + ticket
	seekResponse := request("POST", seekPath, "")
	seekResponse.Body.Close()
	if seekResponse.StatusCode != http.StatusAccepted {
		t.Fatalf("seek: %d", seekResponse.StatusCode)
	}
	var window playbackWindow
	for {
		response := request("GET", seekPath, "")
		err := json.NewDecoder(response.Body).Decode(&window)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if window.Status == "ready" && window.PlaylistURL != "" && len(window.AudioTracks) == 1 && window.AudioTracks[0].Status == "ready" {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatalf("seek not ready: %+v", window)
		case <-time.After(100 * time.Millisecond):
		}
	}
	expectedWindowDuration := 4.0
	if longBuffer {
		expectedWindowDuration = 24
	}
	if window.Start != 4 || window.DeliveredDuration < expectedWindowDuration-0.1 || window.DeliveredDuration > expectedWindowDuration+0.2 {
		t.Fatalf("wrong seek timeline: %+v", window)
	}
	for _, stream := range []string{"0:v:0", "0:a:0"} {
		windowPlaylist := serviceURL + window.PlaylistURL + "?playbackTicket=" + ticket
		if out, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", windowPlaylist, "-map", stream, "-t", "1", "-f", "null", "-").CombinedOutput(); err != nil {
			t.Fatalf("seek decode %s: %v %s", stream, err, out)
		}
	}
	bufferPath := "/playback/buffer?position=4&audio=jpn&subtitle=" + url.QueryEscape(manifest.SubtitleTracks[0].ID) + "&playbackTicket=" + ticket
	var reserve preparedPlaybackBuffer
	for {
		// Read-only observation: preparation must advance without Player POSTs.
		bufferResponse := request(http.MethodGet, bufferPath, "")
		bufferErr := json.NewDecoder(bufferResponse.Body).Decode(&reserve)
		bufferResponse.Body.Close()
		if bufferErr != nil || bufferResponse.StatusCode != 200 {
			t.Fatalf("buffer response: status%d err%v", bufferResponse.StatusCode, bufferErr)
		}
		if reserve.Verdict.Ready && (!longBuffer || reserve.Verdict.CommonAhead >= 59.9) {
			break
		}
		if !longBuffer {
			t.Fatalf("episode-tail buffer not ready: %+v", reserve)
		}
		select {
		case <-ctx.Done():
			t.Fatalf("30s buffer never ready: %+v", reserve)
		case <-time.After(100 * time.Millisecond):
		}
	}
	expectedTarget := 4.0
	if longBuffer {
		expectedTarget = 30
	}
	if reserve.Verdict.TargetSeconds < expectedTarget-0.1 || reserve.Verdict.TargetSeconds > expectedTarget+0.2 || !reserve.Coverage.AudioRequired || !reserve.Coverage.SubtitleRequired || reserve.Coverage.SubtitleAhead < expectedTarget || reserve.Coverage.VideoAhead < expectedTarget || reserve.Coverage.AudioAhead < expectedTarget {
		t.Fatalf("joint prepared buffer: %+v", reserve)
	}
	continuousURL := serviceURL + reserve.PlaylistURL + "?playbackTicket=" + ticket
	if longBuffer {
		command, _ := json.Marshal(playbackSessionCommand{Action: "progress", Timeline: strings.Replace(reserve.PlaylistURL, "continuous-master.m3u8", "master.m3u8", 1), Position: 4, Audio: "jpn", Subtitle: manifest.SubtitleTracks[0].ID, Playing: true})
		response := request(http.MethodPost, "/playback/session?playbackTicket="+ticket, string(command))
		var observed struct {
			Session     playbackSessionState   `json:"session"`
			BufferState preparedPlaybackBuffer `json:"bufferState"`
		}
		err := json.NewDecoder(response.Body).Decode(&observed)
		response.Body.Close()
		if err != nil || response.StatusCode != http.StatusAccepted || observed.Session.Position != 4 || !observed.Session.Playing || !observed.BufferState.Verdict.Ready || observed.BufferState.Verdict.CommonAhead < 59.9 {
			t.Fatalf("unified session progress did not preserve complete media: status%d err%v", response.StatusCode, err)
		}
	}
	t.Logf("prepared reserve: target=%.3f common=%.3f video=%.3f audio=%.3f subtitle=%.3f", reserve.Verdict.TargetSeconds, reserve.Verdict.CommonAhead, reserve.Coverage.VideoAhead, reserve.Coverage.AudioAhead, reserve.Coverage.SubtitleAhead)
	decodeDuration := "1"
	if longBuffer {
		decodeDuration = "60"
	}
	for _, stream := range []string{"0:v:0", "0:a:0"} {
		if out, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-live_start_index", "0", "-i", continuousURL, "-map", stream, "-t", decodeDuration, "-f", "null", "-").CombinedOutput(); err != nil {
			t.Fatalf("continuous decode%s: %v %s", stream, err, out)
		}
	}
	afterTransfer := leecher.ConnStats()
	seedTransfer := seed.ConnStats()
	if (packagedExecutable == "" && afterTransfer.BytesReadData.Int64() == 0) || (packagedExecutable != "" && seedTransfer.BytesWrittenData.Int64() == 0) {
		t.Fatal("no real torrent data transferred")
	}
	// Previously prepared media and cached subtitles must not outlive Core authorization.
	revoked.Store(true)
	searchesBeforeRevocation := searches.Load()
	for _, path := range []string{
		"/manifest",
		manifest.Variants[0].PlaylistURL + "?playbackTicket=" + ticket,
		window.PlaylistURL + "?playbackTicket=" + ticket,
		seekPath,
		bufferPath,
		reserve.PlaylistURL + "?playbackTicket=" + ticket,
		"/subtitles?trackId=" + url.QueryEscape(manifest.SubtitleTracks[0].ID) + "&start=4&playbackTicket=" + ticket,
	} {
		response := request(http.MethodGet, path, "")
		data, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != http.StatusUnauthorized || strings.Contains(string(data), "#EXTM3U") || strings.Contains(string(data), "WEBVTT") {
			t.Fatalf("revoked playback exposed media at %s: status=%d err=%v", strings.Split(path, "?")[0], response.StatusCode, err)
		}
	}
	if searches.Load() != searchesBeforeRevocation {
		t.Fatal("revoked requests started provider lookup")
	}
	fmt.Println("authorized prepare -> minimal provider -> unavailable/available peer -> HLS video/audio + por/eng subtitle windows + seek -> revoked cached media rejected: PASS")
}
