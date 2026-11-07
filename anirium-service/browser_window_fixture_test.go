package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// Opt-in browser fixture only. It is not compiled into the Service and exposes
// only synthetic media on an ephemeral loopback listener, never account data.
func TestBrowserWindowFixture(t *testing.T) {
	if os.Getenv("ANIRIUM_WINDOW_BROWSER_AUDIT") != "1" {
		t.Skip("opt-in interactive synthetic-media browser fixture")
	}
	root := t.TempDir()
	input := filepath.Join(root, "synthetic.mp4")
	output, err := exec.Command(mediaTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=24:duration=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=24", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", input).CombinedOutput()
	if err != nil {
		t.Fatalf("fixture: %v %s", err, output)
	}
	for index := 0; index < 2; index++ {
		video := filepath.Join(root, fmt.Sprintf("video-%d", index))
		audio := filepath.Join(root, fmt.Sprintf("audio-%d", index))
		if err := transcodeVideoWindow(context.Background(), input, video, "120p", float64(index*8), 8); err != nil {
			t.Fatal(err)
		}
		if err := transcodeAudioWindow(context.Background(), input, audio, 1, audioOutputConfig{BitRate: 128000, SampleRate: 48000, Channels: 1}, float64(index*8), 8); err != nil {
			t.Fatal(err)
		}
	}
	mux := http.NewServeMux()
	done := make(chan struct{})
	var once sync.Once
	mux.HandleFunc("/done", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		once.Do(func() { close(done) })
		fmt.Fprint(w, "fixture encerrada")
	})
	mux.HandleFunc("/hls.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join("..", "node_modules", "hls.js", "dist", "hls.min.js"))
	})
	mux.HandleFunc("/master", func(w http.ResponseWriter, r *http.Request) {
		index := r.URL.Query().Get("index")
		if index != "0" && index != "1" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		fmt.Fprintf(w, "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",NAME=\"eng\",LANGUAGE=\"eng\",DEFAULT=YES,AUTOSELECT=YES,URI=\"/media/audio-%s/index.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO=\"audio\"\n/media/video-%s/index.m3u8\n", index, index)
	})
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(root))))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, browserWindowFixtureHTML)
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	t.Log("SYNTHETIC_BROWSER_FIXTURE=" + server.URL)
	select {
	case <-done:
	case <-time.After(3 * time.Minute):
		t.Fatal("interactive fixture expired without completion; not browser acceptance")
	}
}

const browserWindowFixtureHTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Anirium — teste sintético HLS</title>
<style>body{background:#17171d;color:white;font:18px system-ui;padding:24px}button{margin:8px;padding:12px}video{display:block;width:480px}pre{white-space:pre-wrap}</style>
<h1>Teste sintético HLS — não é o Player Pro</h1><p>Sem conta, sem providers, sem conteúdo externo. Geradores reais do Service.</p>
<button id="first">Primeiro trecho (0–8 s)</button><button id="second">Segundo trecho (8–16 s)</button><button id="done">Encerrar teste</button>
<video id="video" controls muted playsinline></video><pre id="report">Aguardando reprodução.</pre><pre id="history"></pre><script src="/hls.js"></script><script>
const video=document.getElementById('video'), report=document.getElementById('report'), history=document.getElementById('history'); let hls, start=0;
function observe(event){const origin=video.seekable.length?video.seekable.start(0):0;report.textContent=JSON.stringify({event,start,localTime:video.currentTime,seekableOrigin:origin,episodeTime:start+video.currentTime-origin,duration:video.duration,readyState:video.readyState,paused:video.paused,audioTracks:hls?hls.audioTracks.map(t=>t.lang):[]},null,2);if(event==='loadedmetadata'||event==='playing'||event==='error')history.textContent+=report.textContent+'\n';}
function load(index){if(hls)hls.destroy();start=index*8;hls=new Hls();hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)history.textContent+='HLS fatal: '+data.type+' '+data.details+'\n';});hls.loadSource('/master?index='+index);hls.attachMedia(video);hls.on(Hls.Events.MANIFEST_PARSED,()=>video.play().catch(e=>history.textContent+=e.message+'\n'));}
for(const event of ['loadedmetadata','playing','timeupdate','ended','error'])video.addEventListener(event,()=>observe(event));
document.getElementById('first').onclick=()=>load(0);document.getElementById('second').onclick=()=>load(1);document.getElementById('done').onclick=()=>fetch('/done',{method:'POST'}).then(()=>report.textContent='Teste encerrado.');
</script></html>`
