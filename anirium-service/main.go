package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"image"
	_ "image/png"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/anacrolix/torrent"
	"golang.org/x/time/rate"
)

//go:embed assets/anirium_tray.ico
var iconData []byte

var shutdownTorrentClient func()

// Injected by the release builder; installer and service share one version.
var serviceVersion = "2.2.0"

//go:embed assets/Anirium-FullVersionLogo.png
var logoData []byte

type HealthResponse struct {
	Status      string `json:"status"`
	Service     string `json:"service"`
	Version     string `json:"version"`
	Port        int    `json:"port"`
	IsNative    bool   `json:"isNative"`
	Engine      string `json:"engine"`
	LogFailures uint64 `json:"logFailures"`
}

type StreamSession struct {
	ID        string    `json:"id"`
	IP        string    `json:"ip"`
	Title     string    `json:"title"`
	Magnet    string    `json:"magnet"`
	Peers     int       `json:"peers"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type StatsResponse struct {
	Peers           int             `json:"peers"`
	UploadRate      string          `json:"uploadRate"`
	DownloadRate    string          `json:"downloadRate"`
	TotalDownloaded string          `json:"totalDownloaded"`
	TotalUploaded   string          `json:"totalUploaded"`
	FairnessLimit   string          `json:"fairnessLimit"`
	ActiveMix       string          `json:"activeMix"`
	MixDuration     string          `json:"mixDuration"`
	MixQualities    []string        `json:"mixQualities"`
	MixAudios       []string        `json:"mixAudios"`
	MixSubtitles    []string        `json:"mixSubtitles"`
	ActiveLinks     []string        `json:"-"`
	ActiveTorrents  int             `json:"activeTorrents"`
	ActiveSessions  []StreamSession `json:"activeSessions"`
	Port            int             `json:"port"`
	Status          string          `json:"status"`
}

// Manifesto autoritativo consumido pelo Player Pro. As opções exibidas devem
// sempre ser produzidas pelo serviço, nunca inventadas pelo frontend.
type MixManifest struct {
	ContinuousBuffer bool            `json:"continuousBuffer"`
	WindowOnDemand   bool            `json:"windowOnDemand"`
	EpisodeDuration  float64         `json:"episodeDuration"`
	QualityOnDemand  bool            `json:"qualityOnDemand"`
	AudioTracks      []AudioTrack    `json:"audioTracks"`
	SubtitleTracks   []SubtitleTrack `json:"subtitleTracks"`
	Version          int             `json:"version"`
	Status           string          `json:"status"`
	ActiveLinks      int             `json:"activeLinks"`
	Peers            int             `json:"peers"`
	Qualities        []string        `json:"qualities"`
	Audios           []string        `json:"audios"`
	AudioChoices     []string        `json:"audioChoices"`
	Subtitles        []string        `json:"subtitles"`
	Variants         []MixVariant    `json:"variants"`
	BufferPercent    float64         `json:"bufferPercent"`
	DownloadRate     string          `json:"downloadRate"`
}

type MixVariant struct {
	Bandwidth          int64    `json:"bandwidth,omitempty"`
	ID                 string   `json:"id"`
	Quality            string   `json:"quality"`
	VideoCodec         string   `json:"videoCodec"`
	AudioLanguages     []string `json:"audioLanguages"`
	SubtitleCount      int      `json:"subtitleCount"`
	PlaylistURL        string   `json:"playlistUrl,omitempty"`
	Status             string   `json:"status"`
	BufferPercent      float64  `json:"bufferPercent"`
	BufferedSeconds    float64  `json:"bufferedSeconds"`
	ProcessingComplete bool     `json:"processingComplete"`
	ProcessingFailed   bool     `json:"processingFailed"`
	PeerCount          int      `json:"peerCount"`
	SourceCount        int      `json:"sourceCount"`
}

type variantRuntime struct {
	videoSource string
	MixVariant
	Dir             string `json:"-"`
	processingError error
	provenance      []mediaSourceSpan
	muxedAudio      bool
}

type ffprobeStream struct {
	Index       int    `json:"index"`
	CodecType   string `json:"codec_type"`
	CodecName   string `json:"codec_name"`
	BitRate     string `json:"bit_rate"`
	Channels    int    `json:"channels"`
	SampleRate  string `json:"sample_rate"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	StartTime   string `json:"start_time"`
	Duration    string `json:"duration"`
	Disposition struct {
		Comment     int `json:"comment"`
		AttachedPic int `json:"attached_pic"`
	} `json:"disposition"`
	Tags struct {
		Language string `json:"language"`
		Title    string `json:"title"`
	} `json:"tags"`
}

type ffprobeOutput struct {
	Streams []ffprobeStream `json:"streams"`
	Format  struct {
		StartTime string `json:"start_time"`
		Duration  string `json:"duration"`
	} `json:"format"`
}

type ProviderServer struct {
	ID           string   `json:"id"`
	Kind         string   `json:"kind,omitempty"`
	ManifestURL  string   `json:"manifestUrl"`
	SearchURL    string   `json:"searchUrl"`
	Capabilities []string `json:"capabilities"`
	Enabled      bool     `json:"enabled"`
	TimeoutMS    int      `json:"timeoutMs,omitempty"`
}

type ProviderManifest struct {
	Resources    []json.RawMessage     `json:"resources,omitempty"`
	Types        []string              `json:"types,omitempty"`
	IDPrefixes   []string              `json:"idPrefixes,omitempty"`
	Search       MinimalProviderSearch `json:"search"`
	ID           string                `json:"id"`
	Name         string                `json:"name"`
	Version      string                `json:"version"`
	Type         string                `json:"type"`
	Capabilities []string              `json:"capabilities"`
	Endpoints    map[string]string     `json:"endpoints"`
}

type ProviderSearchResult struct {
	ID         string `json:"id"`
	Provider   string `json:"provider"`
	Title      string `json:"title"`
	Magnet     string `json:"magnet"`
	InfoHash   string `json:"infoHash"`
	Seeders    int    `json:"seeders"`
	Leechers   int    `json:"leechers"`
	Size       string `json:"size"`
	Resolution string `json:"resolution"`
	Codec      string `json:"codec"`
}

type PlaybackPrepareRequest struct {
	MALID                  int                    `json:"malId,omitempty"`
	EpisodeCount           int                    `json:"episodeCount,omitempty"`
	Format                 string                 `json:"format,omitempty"`
	VideoID                string                 `json:"videoId,omitempty"`
	MediaType              string                 `json:"mediaType,omitempty"`
	AccountProviderServers []ProviderServer       `json:"-"`
	AuthorizedAddonIDs     []string               `json:"-"`
	ManifestSnapshots      *providerSnapshotStore `json:"-"`
	Token                  string                 `json:"token"`
	DeviceID               string                 `json:"deviceId"`
	Title                  string                 `json:"title"`
	TitleEnglish           string                 `json:"titleEnglish"`
	TitleRomaji            string                 `json:"titleRomaji"`
	Season                 int                    `json:"season"`
	Episode                int                    `json:"episode"`
}

// Telemetria do Swarm P2P e Mix de Conteúdo do Player Pro Multi-Usuário Local
var (
	swarmMu                  sync.RWMutex
	torrentClient            *torrent.Client
	currentActiveTor         *torrent.Torrent
	currentActiveTitle       string           = "Aguardando reprodução no Player Pro..."
	currentMixDuration       string           = "Compatível"
	currentMixQualities      []string         = []string{}
	currentMixAudios         []string         = []string{}
	currentMixSubs           []string         = []string{}
	activeLinks              []string                                           // Magnet/stream URLs ativos no mix
	activeSessions                            = make(map[string]*StreamSession) // Sessões ativas por IP / stream
	connectedPeers           int              = 0
	uploadRateStr            string           = "0.0 KB/s"
	downloadRateStr          string           = "0.0 KB/s"
	totalDownloadedStr       string           = "0.0 MB"
	totalUploadedStr         string           = "0.0 MB"
	fairnessLimitStr         string           = "Ativo (Fair Share P2P)"
	lastBytesWritten         int64            = 0
	lastBytesRead            int64            = 0
	observedTransferCapacity transferCapacity // protected by swarmMu
	lastStatsCheck           time.Time
	variantMu                sync.RWMutex
	variantRuntimes          = make(map[string]*variantRuntime)
	providerMu               sync.RWMutex
	providerServers          []ProviderServer
)

// ---------- Episode cache structures ----------
type EpisodeCache struct {
	Magnets     []string         // all magnets for the episode
	AudioLangs  map[string][]int // language -> indices of magnets that have this audio
	SubLangs    map[string][]int // language -> indices of magnets that have this subtitle
	SegmentDur  int              // segment duration in ms (starts 4000, can grow up to 30000)
	VideoDir    string           // directory where video segments are stored
	AudioDir    string           // directory where audio segments are stored
	SubtitleDir string           // directory where subtitle VTT segments are stored
	mu          sync.RWMutex     // protects the fields above
}

var (
	episodeCaches = make(map[string]*EpisodeCache) // key = episodeID
	cachesMu      sync.RWMutex
)

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Anirium-Device, Range")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, X-Anirium-Subtitle-Offset, X-Anirium-Subtitle-Alignment")
}

var (
	moduser32   = syscall.NewLazyDLL("user32.dll")
	modgdi32    = syscall.NewLazyDLL("gdi32.dll")
	modkernel32 = syscall.NewLazyDLL("kernel32.dll")
	modshell32  = syscall.NewLazyDLL("shell32.dll")

	procRegisterClassExW         = moduser32.NewProc("RegisterClassExW")
	procCreateWindowExW          = moduser32.NewProc("CreateWindowExW")
	procDefWindowProcW           = moduser32.NewProc("DefWindowProcW")
	procShowWindow               = moduser32.NewProc("ShowWindow")
	procUpdateWindow             = moduser32.NewProc("UpdateWindow")
	procGetMessageW              = moduser32.NewProc("GetMessageW")
	procTranslateMessage         = moduser32.NewProc("TranslateMessage")
	procDispatchMessageW         = moduser32.NewProc("DispatchMessageW")
	procPostQuitMessage          = moduser32.NewProc("PostQuitMessage")
	procSetForeground            = moduser32.NewProc("SetForegroundWindow")
	procBeginPaint               = moduser32.NewProc("BeginPaint")
	procEndPaint                 = moduser32.NewProc("EndPaint")
	procFillRect                 = moduser32.NewProc("FillRect")
	procCreateSolidBrush         = modgdi32.NewProc("CreateSolidBrush")
	procSetBkMode                = modgdi32.NewProc("SetBkMode")
	procSetTextColor             = modgdi32.NewProc("SetTextColor")
	procCreateFontW              = modgdi32.NewProc("CreateFontW")
	procSelectObject             = modgdi32.NewProc("SelectObject")
	procDeleteObject             = modgdi32.NewProc("DeleteObject")
	procDrawTextW                = moduser32.NewProc("DrawTextW")
	procGetClientRect            = moduser32.NewProc("GetClientRect")
	procCreateDIBSection         = modgdi32.NewProc("CreateDIBSection")
	procCreateCompatibleDC       = modgdi32.NewProc("CreateCompatibleDC")
	procDeleteDC                 = modgdi32.NewProc("DeleteDC")
	procBitBlt                   = modgdi32.NewProc("BitBlt")
	procStretchBlt               = modgdi32.NewProc("StretchBlt")
	procSetStretchBltMode        = modgdi32.NewProc("SetStretchBltMode")
	procGetModuleHandleW         = modkernel32.NewProc("GetModuleHandleW")
	procLoadCursorW              = moduser32.NewProc("LoadCursorW")
	procCreateMutexW             = modkernel32.NewProc("CreateMutexW")
	procGetLastError             = modkernel32.NewProc("GetLastError")
	procFindWindowW              = moduser32.NewProc("FindWindowW")
	procSendMessageW             = moduser32.NewProc("SendMessageW")
	procCreateIconFromResourceEx = moduser32.NewProc("CreateIconFromResourceEx")
	procInvalidateRect           = moduser32.NewProc("InvalidateRect")
	procGetConsoleWindow         = modkernel32.NewProc("GetConsoleWindow")
	procLoadImageW               = moduser32.NewProc("LoadImageW")
	procGetCursorPos             = moduser32.NewProc("GetCursorPos")
	procCreatePopupMenu          = moduser32.NewProc("CreatePopupMenu")
	procAppendMenuW              = moduser32.NewProc("AppendMenuW")
	procTrackPopupMenuEx         = moduser32.NewProc("TrackPopupMenuEx")
	procDestroyMenu              = moduser32.NewProc("DestroyMenu")

	procShellNotifyIconW = modshell32.NewProc("Shell_NotifyIconW")
)

const (
	WS_OVERLAPPED  = 0x00000000
	WS_CAPTION     = 0x00C00000
	WS_SYSMENU     = 0x00080000
	WS_MINIMIZEBOX = 0x00020000
	WS_VISIBLE     = 0x10000000
	WS_CHILD       = 0x40000000
	BS_PUSHBUTTON  = 0x00000000

	SW_HIDE       = 0
	SW_SHOWNORMAL = 1
	SW_RESTORE    = 9

	WM_DESTROY = 0x0002
	WM_PAINT   = 0x000F
	WM_CLOSE   = 0x0010
	WM_COMMAND = 0x0111
	WM_SETICON = 0x0080

	ICON_SMALL = 0
	ICON_BIG   = 1

	IMAGE_ICON      = 1
	LR_LOADFROMFILE = 0x00000010
	LR_DEFAULTSIZE  = 0x00000040

	ERROR_ALREADY_EXISTS = 183

	COLOR_WINDOW    = 5
	DT_LEFT         = 0x00000000
	DT_CENTER       = 0x00000001
	DT_RIGHT        = 0x00000002
	DT_VCENTER      = 0x00000004
	DT_SINGLELINE   = 0x00000020
	DT_NOPREFIX     = 0x00000800
	DT_END_ELLIPSIS = 0x00008000
	TRANSPARENT     = 1
	HALFTONE        = 4
	SRCCOPY         = 0x00CC0020

	// Shell Tray Constants
	WM_USER          = 0x0400
	WM_TRAYICON      = WM_USER + 100
	NIM_ADD          = 0x00000000
	NIM_MODIFY       = 0x00000001
	NIM_DELETE       = 0x00000002
	NIF_MESSAGE      = 0x00000001
	NIF_ICON         = 0x00000002
	NIF_TIP          = 0x00000004
	WM_LBUTTONUP     = 0x0202
	WM_RBUTTONUP     = 0x0205
	WM_LBUTTONDBLCLK = 0x0203

	MF_STRING       = 0x00000000
	MF_SEPARATOR    = 0x00000800
	TPM_BOTTOMALIGN = 0x0020
	TPM_LEFTALIGN   = 0x0000
	TPM_RETURNCMD   = 0x0100

	IDM_OPEN = 2001
	IDM_EXIT = 2002
)

type NOTIFYICONDATAW struct {
	CbSize           uint32
	_                [4]byte // Padding para alinhamento em 64-bit
	Hwnd             uintptr
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	_                [4]byte // Padding para alinhamento em 64-bit
	HIcon            uintptr
	SzTip            [128]uint16
	DwState          uint32
	DwStateMask      uint32
	SzInfo           [256]uint16
	TimeoutOrVersion uint32
	SzInfoTitle      [64]uint16
	DwInfoFlags      uint32
	GuidItem         [16]byte
	HBalloonIcon     uintptr
}

func addTrayIcon(hwnd uintptr, hIcon uintptr, tip string) {
	var nid NOTIFYICONDATAW
	nid.CbSize = uint32(unsafe.Sizeof(nid))
	nid.Hwnd = hwnd
	nid.UID = 100
	nid.UFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
	nid.UCallbackMessage = WM_TRAYICON
	nid.HIcon = hIcon

	tipRunes := []rune(tip)
	for i, r := range tipRunes {
		if i >= 127 {
			break
		}
		nid.SzTip[i] = uint16(r)
	}

	ret, _, _ := procShellNotifyIconW.Call(NIM_ADD, uintptr(unsafe.Pointer(&nid)))
	if ret == 0 {
		sizes := []uint32{976, 968, 952, 936, 160, 88}
		for _, s := range sizes {
			nid.CbSize = s
			ret, _, _ = procShellNotifyIconW.Call(NIM_ADD, uintptr(unsafe.Pointer(&nid)))
			if ret != 0 {
				break
			}
		}
	}
}

func removeTrayIcon(hwnd uintptr) {
	var nid NOTIFYICONDATAW
	nid.CbSize = uint32(unsafe.Sizeof(nid))
	nid.Hwnd = hwnd
	nid.UID = 100
	ret, _, _ := procShellNotifyIconW.Call(NIM_DELETE, uintptr(unsafe.Pointer(&nid)))
	if ret == 0 {
		sizes := []uint32{976, 968, 952, 936, 160, 88}
		for _, s := range sizes {
			nid.CbSize = s
			ret, _, _ = procShellNotifyIconW.Call(NIM_DELETE, uintptr(unsafe.Pointer(&nid)))
			if ret != 0 {
				break
			}
		}
	}
}

type WNDCLASSEX struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     syscall.Handle
	HIcon         syscall.Handle
	HCursor       syscall.Handle
	HbrBackground syscall.Handle
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       syscall.Handle
}

type POINT struct {
	X, Y int32
}

type MSG struct {
	Hwnd    syscall.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      POINT
}

type RECT struct {
	Left, Top, Right, Bottom int32
}

type PAINTSTRUCT struct {
	Hdc         syscall.Handle
	FErase      int32
	RcPaint     RECT
	FRestore    int32
	FIncUpdate  int32
	RgbReserved [32]byte
}

type BITMAPINFOHEADER struct {
	BiSize          uint32
	BiWidth         int32
	BiHeight        int32
	BiPlanes        uint16
	BiBitCount      uint16
	BiCompression   uint32
	BiSizeImage     uint32
	BiXPelsPerMeter int32
	BiYPelsPerMeter int32
	BiClrUsed       uint32
	BiClrImportant  uint32
}

type BITMAPINFO struct {
	Header BITMAPINFOHEADER
	Colors [1]uint32
}

var (
	globalHwnd     syscall.Handle
	globalPort     int
	logoHBitmap    syscall.Handle
	logoWidth      int
	logoHeight     int
	bgBrush        syscall.Handle
	cardBrush      syscall.Handle
	cardTelemBrush syscall.Handle
	fontTitle      syscall.Handle
	fontSubtitle   syscall.Handle
	fontStatus     syscall.Handle
	fontMetricVal  syscall.Handle
	fontMetricLbl  syscall.Handle
	fontMix        syscall.Handle
	fontBtn        syscall.Handle
	initWindowOnce sync.Once
)

func utf16Ptr(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

// Prepara o bitmap da logo para desenho rápido via Win32 GDI
func prepareLogoBitmap() {
	reader := &byteReader{b: logoData}
	img, _, err := image.Decode(reader)
	if err != nil {
		return
	}
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	logoWidth = w
	logoHeight = h

	var bmi BITMAPINFO
	bmi.Header.BiSize = uint32(unsafe.Sizeof(bmi.Header))
	bmi.Header.BiWidth = int32(w)
	bmi.Header.BiHeight = -int32(h) // top-down
	bmi.Header.BiPlanes = 1
	bmi.Header.BiBitCount = 32
	bmi.Header.BiCompression = 0 // BI_RGB

	var pBits unsafe.Pointer
	hbm, _, _ := procCreateDIBSection.Call(
		0,
		uintptr(unsafe.Pointer(&bmi)),
		0,
		uintptr(unsafe.Pointer(&pBits)),
		0,
		0,
	)

	if hbm != 0 && pBits != nil {
		logoHBitmap = syscall.Handle(hbm)
		pixels := (*[1 << 28]byte)(pBits)[: w*h*4 : w*h*4]
		idx := 0
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				r, g, b, a := img.At(x+bounds.Min.X, y+bounds.Min.Y).RGBA()
				a8 := byte(a >> 8)
				r8 := byte(r >> 8)
				g8 := byte(g >> 8)
				b8 := byte(b >> 8)

				// Premultiply / compositing against dark background #0B0B0D (11, 11, 13)
				if a8 < 255 {
					alpha := float64(a8) / 255.0
					r8 = byte(float64(r8)*alpha + 11.0*(1.0-alpha))
					g8 = byte(float64(g8)*alpha + 11.0*(1.0-alpha))
					b8 = byte(float64(b8)*alpha + 13.0*(1.0-alpha))
				}
				pixels[idx] = b8
				pixels[idx+1] = g8
				pixels[idx+2] = r8
				pixels[idx+3] = a8
				idx += 4
			}
		}
	}
}

type byteReader struct {
	b   []byte
	pos int
}

func (r *byteReader) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.b) {
		return 0, fmt.Errorf("EOF")
	}
	n = copy(p, r.b[r.pos:])
	r.pos += n
	return n, nil
}

func wndProc(hwnd uintptr, msg uintptr, wParam uintptr, lParam uintptr) uintptr {
	defer func() {
		if r := recover(); r != nil {
			appendLog("Native window callback failed")
		}
	}()
	switch msg {
	case WM_TRAYICON:
		switch lParam {
		case WM_LBUTTONUP, WM_LBUTTONDBLCLK:
			showNativeWindow()
			return 0
		case WM_RBUTTONUP:
			var pt POINT
			procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))

			hMenu, _, _ := procCreatePopupMenu.Call()
			if hMenu != 0 {
				procSetForeground.Call(uintptr(hwnd))
				openText := utf16Ptr("Abrir Anirium Player Pro")
				exitText := utf16Ptr("Encerrar Serviço")

				procAppendMenuW.Call(hMenu, MF_STRING, IDM_OPEN, uintptr(unsafe.Pointer(openText)))
				procAppendMenuW.Call(hMenu, MF_SEPARATOR, 0, 0)
				procAppendMenuW.Call(hMenu, MF_STRING, IDM_EXIT, uintptr(unsafe.Pointer(exitText)))

				cmd, _, _ := procTrackPopupMenuEx.Call(
					hMenu,
					TPM_RETURNCMD|TPM_BOTTOMALIGN|TPM_LEFTALIGN,
					uintptr(pt.X),
					uintptr(pt.Y),
					uintptr(hwnd),
					0,
				)

				if cmd == IDM_OPEN {
					showNativeWindow()
				} else if cmd == IDM_EXIT {
					removeTrayIcon(hwnd)
					if shutdownTorrentClient != nil {
						shutdownTorrentClient()
					}
					os.Exit(0)
				}
				procDestroyMenu.Call(hMenu)
			}
			return 0
		}

	case WM_CLOSE:
		// Fechar a janela esconde e minimiza para a bandeja
		procShowWindow.Call(uintptr(hwnd), SW_HIDE)
		return 0

	case WM_COMMAND:
		id := wParam & 0xFFFF
		if id == 1001 { // Botão Minimizar
			procShowWindow.Call(uintptr(hwnd), SW_HIDE)
			return 0
		}

	case WM_PAINT:
		var ps PAINTSTRUCT
		hdc, _, _ := procBeginPaint.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&ps)))
		if hdc != 0 {
			var rc RECT
			procGetClientRect.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&rc)))

			// 1. Fundo principal escuro (#0B0B0D => BGR: 0x0D0B0B)
			procFillRect.Call(hdc, uintptr(unsafe.Pointer(&rc)), uintptr(bgBrush))

			// 2. Fundo do Card de Informações de Status
			cardRect := RECT{
				Left:   25,
				Top:    175,
				Right:  rc.Right - 25,
				Bottom: 250,
			}
			procFillRect.Call(hdc, uintptr(unsafe.Pointer(&cardRect)), uintptr(cardBrush))

			// 3. Fundo do Card de Telemetria do Swarm (Peers, Seed, Consumo, Mix, Links)
			telemRect := RECT{
				Left:   25,
				Top:    260,
				Right:  rc.Right - 25,
				Bottom: 510,
			}
			procFillRect.Call(hdc, uintptr(unsafe.Pointer(&telemRect)), uintptr(cardTelemBrush))

			// Desenha a Logo do Anirium centralizada no topo
			if logoHBitmap != 0 {
				memDC, _, _ := procCreateCompatibleDC.Call(hdc)
				if memDC != 0 {
					oldBmp, _, _ := procSelectObject.Call(memDC, uintptr(logoHBitmap))
					procSetStretchBltMode.Call(hdc, HALFTONE)

					targetW := int32(230)
					targetH := int32(float64(targetW) * (float64(logoHeight) / float64(logoWidth)))
					targetX := (rc.Right - targetW) / 2
					targetY := int32(20)

					procStretchBlt.Call(
						hdc,
						uintptr(targetX),
						uintptr(targetY),
						uintptr(targetW),
						uintptr(targetH),
						memDC,
						0,
						0,
						uintptr(logoWidth),
						uintptr(logoHeight),
						SRCCOPY,
					)

					procSelectObject.Call(memDC, oldBmp)
					procDeleteDC.Call(memDC)
				}
			}

			// Texto de Status: "Serviço de video-torrent ativo"
			procSetBkMode.Call(hdc, TRANSPARENT)
			oldFont, _, _ := procSelectObject.Call(hdc, uintptr(fontTitle))
			// Cor Dourada/Ambar (#FFC766 => BGR: 0x66C7FF)
			procSetTextColor.Call(hdc, 0x66C7FF)

			textRect := RECT{
				Left:   10,
				Top:    135,
				Right:  rc.Right - 10,
				Bottom: 168,
			}
			textTitle := utf16Ptr("Anirium+ Service")
			procDrawTextW.Call(
				hdc,
				uintptr(unsafe.Pointer(textTitle)),
				uintptr(len("Anirium+ Service")),
				uintptr(unsafe.Pointer(&textRect)),
				DT_CENTER|DT_SINGLELINE,
			)

			// Detalhes da Conexão no Card Superior
			procSelectObject.Call(hdc, uintptr(fontStatus))
			// Cor Verde Esmeralda (#10B981 => BGR: 0x81B910)
			procSetTextColor.Call(hdc, 0x50E880)

			statusRect := RECT{
				Left:   35,
				Top:    185,
				Right:  rc.Right - 35,
				Bottom: 212,
			}
			statusMsg := utf16Ptr("● Serviço local — autorização Anirium+ obrigatória")
			procDrawTextW.Call(
				hdc,
				uintptr(unsafe.Pointer(statusMsg)),
				uintptr(len([]rune("● Serviço local — autorização Anirium+ obrigatória"))),
				uintptr(unsafe.Pointer(&statusRect)),
				DT_CENTER|DT_SINGLELINE,
			)

			// Subtexto com Endereço Local
			procSelectObject.Call(hdc, uintptr(fontSubtitle))
			// Cor Bege Claro (#EADCC8 => BGR: 0xC8DCEA)
			procSetTextColor.Call(hdc, 0xC8DCEA)

			portRect := RECT{
				Left:   35,
				Top:    215,
				Right:  rc.Right - 35,
				Bottom: 242,
			}
			portStr := fmt.Sprintf("API local: http://127.0.0.1:%d", globalPort)
			portMsg := utf16Ptr(portStr)
			procDrawTextW.Call(
				hdc,
				uintptr(unsafe.Pointer(portMsg)),
				uintptr(len([]rune(portStr))),
				uintptr(unsafe.Pointer(&portRect)),
				DT_CENTER|DT_SINGLELINE,
			)

			// 4. Seção de Telemetria do Card Inferior
			swarmMu.RLock()
			pCount := connectedPeers
			uRate := uploadRateStr
			dRate := downloadRateStr
			totDown := totalDownloadedStr
			totUp := totalUploadedStr
			mixTitle := currentActiveTitle
			mixDur := currentMixDuration
			mixQ := strings.Join(currentMixQualities, ", ")
			mixA := strings.Join(currentMixAudios, ", ")
			mixS := strings.Join(currentMixSubs, ", ")
			linksCopy := make([]string, len(activeLinks))
			copy(linksCopy, activeLinks)
			sessCount := len(activeSessions)
			swarmMu.RUnlock()

			// Linha 1 Esquerda: Consumo Total & Taxa de Download
			procSelectObject.Call(hdc, uintptr(fontMetricLbl))
			procSetTextColor.Call(hdc, 0x8A8A96) // cinza suave
			lblDownRect := RECT{Left: 40, Top: 270, Right: 235, Bottom: 288}
			lblDownStr := utf16Ptr("CONSUMO TOTAL (DOWNLOAD)")
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(lblDownStr)), uintptr(len([]rune("CONSUMO TOTAL (DOWNLOAD)"))), uintptr(unsafe.Pointer(&lblDownRect)), DT_LEFT|DT_SINGLELINE)

			procSelectObject.Call(hdc, uintptr(fontMetricVal))
			procSetTextColor.Call(hdc, 0x66C7FF) // âmbar/azul suave
			valDownRect := RECT{Left: 40, Top: 288, Right: 235, Bottom: 310}
			valDownStr := fmt.Sprintf("▼ %s (%s)", totDown, dRate)
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(valDownStr))), uintptr(len([]rune(valDownStr))), uintptr(unsafe.Pointer(&valDownRect)), DT_LEFT|DT_SINGLELINE)

			// Linha 1 Direita: Consumo Total & Taxa de Upload (Fairness)
			procSelectObject.Call(hdc, uintptr(fontMetricLbl))
			procSetTextColor.Call(hdc, 0x8A8A96)
			lblSeedRect := RECT{Left: 245, Top: 270, Right: rc.Right - 40, Bottom: 288}
			lblSeedStr := utf16Ptr("CONSUMO TOTAL (UPLOAD/FAIRNESS)")
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(lblSeedStr)), uintptr(len([]rune("CONSUMO TOTAL (UPLOAD/FAIRNESS)"))), uintptr(unsafe.Pointer(&lblSeedRect)), DT_LEFT|DT_SINGLELINE)

			procSelectObject.Call(hdc, uintptr(fontMetricVal))
			procSetTextColor.Call(hdc, 0x50E880) // verde esmeralda
			valSeedRect := RECT{Left: 245, Top: 288, Right: rc.Right - 40, Bottom: 310}
			valSeedStr := fmt.Sprintf("▲ %s (%s)", totUp, uRate)
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(valSeedStr))), uintptr(len([]rune(valSeedStr))), uintptr(unsafe.Pointer(&valSeedRect)), DT_LEFT|DT_SINGLELINE)

			// Linha 2: Swarm Peers & Telas Ativas
			procSelectObject.Call(hdc, uintptr(fontMetricLbl))
			procSetTextColor.Call(hdc, 0x8A8A96)
			lblPeersRect := RECT{Left: 40, Top: 316, Right: rc.Right - 40, Bottom: 332}
			lblPeersStr := utf16Ptr("REDE DE PEERS E TELAS DA CASA")
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(lblPeersStr)), uintptr(len([]rune("REDE DE PEERS E TELAS DA CASA"))), uintptr(unsafe.Pointer(&lblPeersRect)), DT_LEFT|DT_SINGLELINE)

			procSelectObject.Call(hdc, uintptr(fontMix))
			procSetTextColor.Call(hdc, 0xC8DCEA)
			valPeersRect := RECT{Left: 40, Top: 334, Right: rc.Right - 40, Bottom: 350}
			valPeersLine := fmt.Sprintf("%d peers ativos no swarm • %d tela(s) local(is) em streaming", pCount, max(1, sessCount))
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(valPeersLine))), uintptr(len([]rune(valPeersLine))), uintptr(unsafe.Pointer(&valPeersRect)), DT_LEFT|DT_SINGLELINE|DT_END_ELLIPSIS|DT_NOPREFIX)

			// Linha 3: Mix Multimagnético Ativo
			procSelectObject.Call(hdc, uintptr(fontMetricLbl))
			procSetTextColor.Call(hdc, 0x8A8A96)
			lblMixRect := RECT{Left: 40, Top: 356, Right: rc.Right - 40, Bottom: 372}
			lblMixStr := utf16Ptr("MIX MULTIMAGNÉTICO (PLAYER PRO)")
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(lblMixStr)), uintptr(len([]rune("MIX MULTIMAGNÉTICO (PLAYER PRO)"))), uintptr(unsafe.Pointer(&lblMixRect)), DT_LEFT|DT_SINGLELINE)

			procSelectObject.Call(hdc, uintptr(fontMix))
			procSetTextColor.Call(hdc, 0xFFC766) // âmbar
			valMixRect := RECT{Left: 40, Top: 374, Right: rc.Right - 40, Bottom: 390}
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(mixTitle))), uintptr(len([]rune(mixTitle))), uintptr(unsafe.Pointer(&valMixRect)), DT_LEFT|DT_SINGLELINE|DT_END_ELLIPSIS|DT_NOPREFIX)

			// Linha 4: Compatibilidade de Versões (Tempo de vídeo, Qualidades, Áudios, Legendas)
			procSelectObject.Call(hdc, uintptr(fontMetricLbl))
			procSetTextColor.Call(hdc, 0x8A8A96)
			lblCompRect := RECT{Left: 40, Top: 396, Right: rc.Right - 40, Bottom: 412}
			lblCompStr := utf16Ptr("COMPATIBILIDADE E FAIXAS UNIFICADAS")
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(lblCompStr)), uintptr(len([]rune("COMPATIBILIDADE E FAIXAS UNIFICADAS"))), uintptr(unsafe.Pointer(&lblCompRect)), DT_LEFT|DT_SINGLELINE)

			procSelectObject.Call(hdc, uintptr(fontMix))
			procSetTextColor.Call(hdc, 0x9A8ACA) // lilás suave
			valCompRect := RECT{Left: 40, Top: 414, Right: rc.Right - 40, Bottom: 430}
			valCompLine := fmt.Sprintf("Duração: %s | Qualidades: %s", mixDur, mixQ)
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(valCompLine))), uintptr(len([]rune(valCompLine))), uintptr(unsafe.Pointer(&valCompRect)), DT_LEFT|DT_SINGLELINE|DT_END_ELLIPSIS|DT_NOPREFIX)

			valTracksRect := RECT{Left: 40, Top: 432, Right: rc.Right - 40, Bottom: 448}
			valTracksLine := fmt.Sprintf("Áudios: %s | Legendas: %s", mixA, mixS)
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(valTracksLine))), uintptr(len([]rune(valTracksLine))), uintptr(unsafe.Pointer(&valTracksRect)), DT_LEFT|DT_SINGLELINE|DT_END_ELLIPSIS|DT_NOPREFIX)

			// Linha 5: Magnets Ativos Sendo Mixados
			procSelectObject.Call(hdc, uintptr(fontMetricLbl))
			procSetTextColor.Call(hdc, 0x8A8A96)
			lblLinksRect := RECT{Left: 40, Top: 454, Right: rc.Right - 40, Bottom: 470}
			linksCountStr := fmt.Sprintf("FONTES / MAGNETS NO MIX (%d)", len(linksCopy))
			procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(linksCountStr))), uintptr(len([]rune(linksCountStr))), uintptr(unsafe.Pointer(&lblLinksRect)), DT_LEFT|DT_SINGLELINE)

			procSelectObject.Call(hdc, uintptr(fontMix))
			procSetTextColor.Call(hdc, 0x50E880) // verde
			linkY := int32(472)
			displayLinks := linksCopy
			if len(displayLinks) > 2 {
				displayLinks = displayLinks[len(displayLinks)-2:]
			}
			for _, lnk := range displayLinks {
				display := lnk
				if len(display) > 65 {
					display = display[:62] + "..."
				}
				linkRect := RECT{Left: 40, Top: linkY, Right: rc.Right - 40, Bottom: linkY + 15}
				procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(display))), uintptr(len([]rune(display))), uintptr(unsafe.Pointer(&linkRect)), DT_LEFT|DT_SINGLELINE|DT_END_ELLIPSIS|DT_NOPREFIX)
				linkY += 16
			}
			if len(linksCopy) == 0 {
				noLinksStr := "Nenhum magnet ativo no momento"
				noLinksRect := RECT{Left: 40, Top: linkY, Right: rc.Right - 40, Bottom: linkY + 15}
				procSetTextColor.Call(hdc, 0x5A5A64)
				procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(utf16Ptr(noLinksStr))), uintptr(len([]rune(noLinksStr))), uintptr(unsafe.Pointer(&noLinksRect)), DT_LEFT|DT_SINGLELINE)
			}

			// Restaura font
			procSelectObject.Call(hdc, oldFont)
			procEndPaint.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&ps)))
			return 0
		}

	case WM_DESTROY:
		procPostQuitMessage.Call(0)
		return 0
	}

	ret, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(msg), wParam, lParam)
	return ret
}

func appendLog(msg string) {
	// Callers provide redacted fixed labels. Never log the writer's raw error
	// or fall back to an unbounded file when the managed store is unavailable.
	_ = serviceLog.append(msg)
}

func initNativeWindow(port int) {
	appendLog(fmt.Sprintf("initNativeWindow started with port=%d", port))
	runtime.LockOSThread()
	globalPort = port

	prepareLogoBitmap()

	// GDI Brushes
	hBgBrush, _, _ := procCreateSolidBrush.Call(0x0D0B0B) // #0B0B0D
	bgBrush = syscall.Handle(hBgBrush)

	hCardBrush, _, _ := procCreateSolidBrush.Call(0x181414) // #141418
	cardBrush = syscall.Handle(hCardBrush)

	hCardTelemBrush, _, _ := procCreateSolidBrush.Call(0x221C1C) // #1C1C22
	cardTelemBrush = syscall.Handle(hCardTelemBrush)

	// Fontes Modernas (Segoe UI)
	fTitle, _, _ := procCreateFontW.Call(
		23, 0, 0, 0, 700, 0, 0, 0, 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	fontTitle = syscall.Handle(fTitle)

	fStatus, _, _ := procCreateFontW.Call(
		17, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	fontStatus = syscall.Handle(fStatus)

	fSub, _, _ := procCreateFontW.Call(
		15, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	fontSubtitle = syscall.Handle(fSub)

	fMetricVal, _, _ := procCreateFontW.Call(
		16, 0, 0, 0, 700, 0, 0, 0, 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	fontMetricVal = syscall.Handle(fMetricVal)

	fMetricLbl, _, _ := procCreateFontW.Call(
		12, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	fontMetricLbl = syscall.Handle(fMetricLbl)

	fMix, _, _ := procCreateFontW.Call(
		14, 0, 0, 0, 500, 0, 0, 0, 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	fontMix = syscall.Handle(fMix)

	fBtn, _, _ := procCreateFontW.Call(
		15, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	fontBtn = syscall.Handle(fBtn)

	hInstance, _, _ := procGetModuleHandleW.Call(0)
	hCursor, _, _ := procLoadCursorW.Call(0, 32512) // IDC_ARROW

	// Prepara e carrega o arquivo de ícone (.ico) nativo para a janela e barra de tarefas do Windows
	var hIconBig, hIconSm uintptr
	icoTempPath := filepath.Join(os.TempDir(), "anirium_tray_app.ico")
	if len(iconData) > 0 {
		_ = os.WriteFile(icoTempPath, iconData, 0644)
		pPath := utf16Ptr(icoTempPath)
		hIconBig, _, _ = procLoadImageW.Call(
			0,
			uintptr(unsafe.Pointer(pPath)),
			IMAGE_ICON,
			32, 32,
			LR_LOADFROMFILE,
		)
		hIconSm, _, _ = procLoadImageW.Call(
			0,
			uintptr(unsafe.Pointer(pPath)),
			IMAGE_ICON,
			16, 16,
			LR_LOADFROMFILE,
		)
	}

	// Carrega do recurso compilado (.syso) caso necessário
	if hIconBig == 0 {
		hIconBig, _, _ = procLoadImageW.Call(hInstance, 1, IMAGE_ICON, 32, 32, 0)
	}
	if hIconSm == 0 {
		hIconSm, _, _ = procLoadImageW.Call(hInstance, 1, IMAGE_ICON, 16, 16, 0)
	}
	if hIconBig == 0 {
		procLoadIconW := moduser32.NewProc("LoadIconW")
		hIconBig, _, _ = procLoadIconW.Call(0, 32512)
	}
	if hIconSm == 0 {
		hIconSm = hIconBig
	}

	className := utf16Ptr("AniriumServiceGUIClass")
	var wc WNDCLASSEX
	wc.CbSize = uint32(unsafe.Sizeof(wc))
	wc.Style = 0x0002 | 0x0001 // CS_HREDRAW | CS_VREDRAW
	wc.LpfnWndProc = syscall.NewCallback(wndProc)
	wc.HInstance = syscall.Handle(hInstance)
	wc.HIcon = syscall.Handle(hIconBig)
	wc.HIconSm = syscall.Handle(hIconSm)
	wc.HCursor = syscall.Handle(hCursor)
	wc.HbrBackground = bgBrush
	wc.LpszClassName = className

	rReg, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	appendLog(fmt.Sprintf("Native window class registered: %t", rReg != 0))

	procGetSystemMetrics := moduser32.NewProc("GetSystemMetrics")
	scrW, _, _ := procGetSystemMetrics.Call(0)
	scrH, _, _ := procGetSystemMetrics.Call(1)

	winW := int32(500)
	winH := int32(590)
	posX := int32(200)
	posY := int32(150)
	if scrW > 0 && scrH > 0 {
		posX = (int32(scrW) - winW) / 2
		posY = (int32(scrH) - winH) / 2
	}

	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(utf16Ptr("Anirium Player Pro • Serviço de video-torrent"))),
		WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX|WS_VISIBLE,
		uintptr(posX), uintptr(posY), uintptr(winW), uintptr(winH),
		0, 0, hInstance, 0,
	)
	appendLog(fmt.Sprintf("Native window created: %t", hwnd != 0))
	globalHwnd = syscall.Handle(hwnd)

	// Define explicitamente os ícones na janela e na barra de tarefas (Alt+Tab e Favicon)
	if hIconBig != 0 {
		procSendMessageW.Call(uintptr(globalHwnd), WM_SETICON, ICON_BIG, hIconBig)
	}
	if hIconSm != 0 {
		procSendMessageW.Call(uintptr(globalHwnd), WM_SETICON, ICON_SMALL, hIconSm)
	} else if hIconBig != 0 {
		procSendMessageW.Call(uintptr(globalHwnd), WM_SETICON, ICON_SMALL, hIconBig)
	}

	// Botão de Minimizar para a bandeja
	btnW := int32(220)
	btnH := int32(36)
	btnX := (winW - btnW) / 2
	btnY := int32(524)

	btnHwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Minimizar para a Bandeja"))),
		WS_CHILD|WS_VISIBLE|BS_PUSHBUTTON,
		uintptr(btnX), uintptr(btnY), uintptr(btnW), uintptr(btnH),
		uintptr(globalHwnd), 1001, hInstance, 0,
	)
	if btnHwnd != 0 {
		moduser32.NewProc("SendMessageW").Call(btnHwnd, 0x0030, uintptr(fontBtn), 1)
	}

	// Adiciona o Ícone na Bandeja do Sistema (Windows System Tray)
	trayIconHandle := hIconSm
	if trayIconHandle == 0 {
		trayIconHandle = hIconBig
	}
	appendLog("Adding tray icon")
	addTrayIcon(uintptr(globalHwnd), trayIconHandle, fmt.Sprintf("Anirium Player Pro • Serviço Ativo (Porta %d)", globalPort))

	// Exibe a janela nativa com todas as informações e telemetrias ao iniciar
	procShowWindow.Call(uintptr(globalHwnd), SW_SHOWNORMAL)
	procUpdateWindow.Call(uintptr(globalHwnd))
	procSetForeground.Call(uintptr(globalHwnd))
	appendLog("Window shown and brought to foreground")

	// Loop de atualização periódica do repaint da janela nativa (a cada 1 segundo)
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		for range ticker.C {
			if globalHwnd != 0 {
				procInvalidateRect.Call(uintptr(globalHwnd), 0, 0)
			}
		}
	}()

	var msg MSG
	appendLog("Starting GetMessage loop...")
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 {
			appendLog("GetMessage returned 0 (WM_QUIT)")
			break
		}
		if int32(ret) == -1 {
			appendLog("Native message loop failed")
			time.Sleep(50 * time.Millisecond)
			continue
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
	appendLog("Exited GetMessage loop, removing tray icon...")
	removeTrayIcon(uintptr(globalHwnd))
}

func showNativeWindow() {
	if globalHwnd != 0 {
		procShowWindow.Call(uintptr(globalHwnd), SW_RESTORE)
		procShowWindow.Call(uintptr(globalHwnd), SW_SHOWNORMAL)
		procSetForeground.Call(uintptr(globalHwnd))
	}
}

// Inicializa o cliente BitTorrent de streaming sequencial de alta fidelidade
func initTorrentClient() (*torrent.Client, error) {
	return initTorrentClientWithOptions(serviceStartupOptions{})
}

func initTorrentClientWithOptions(options serviceStartupOptions) (*torrent.Client, error) {
	cfg := torrent.NewDefaultClientConfig()
	// Dependency diagnostics include torrent names, infohashes and peer details.
	// Keep playback status in the authenticated API, not in shared raw logs.
	cfg.Slogger = slog.New(slog.NewTextHandler(io.Discard, nil))
	var cleanupRuntimeCache func() error
	if !options.Headless {
		var cacheErr error
		cfg.DataDir, cleanupRuntimeCache, cacheErr = newRuntimeTorrentCache()
		if cacheErr != nil {
			return nil, cacheErr
		}
	}
	cfg.Seed = true
	cfg.NoUpload = false
	cfg.DisableAggressiveUpload = false
	cfg.NoDefaultPortForwarding = true // Desabilita UPnP automático que gerava erro 500 em roteadores sem IGD
	cfg.DisablePEX = false
	if options.Headless {
		cfg.DataDir = options.DataDir
		cfg.ListenPort = 0
	}
	if options.NoPeerDiscovery {
		cfg.NoDHT = true
		cfg.DisableTrackers = true
		cfg.DisablePEX = true
		cfg.DisableUTP = true
		cfg.DisableIPv6 = true
		cfg.ListenHost = func(string) string { return "127.0.0.1" }
	}

	// Upload rate limit: ~100 KB/s (102400 bytes/s) para não saturar a conexão do usuário
	cfg.UploadRateLimiter = rate.NewLimiter(rate.Limit(100*1024), 32*1024)

	clientFactory := newManagedTorrentClient
	if !options.Headless {
		clientFactory = newBoundedRuntimeTorrentClient
	}
	cl, closeClient, err := clientFactory(cfg)
	if err != nil {
		if cleanupRuntimeCache != nil {
			_ = cleanupRuntimeCache()
		}
		return nil, err
	}
	shutdownTorrentClient = func() {
		preparePlaybackMu.Lock()
		defer preparePlaybackMu.Unlock()
		playbackShuttingDown = true
		stopPlaybackWorkers()
		closeClient()
		if cleanupRuntimeCache != nil {
			if err := cleanupRuntimeCache(); err != nil {
				appendLog("Torrent runtime cache cleanup failed")
			}
		}
	}
	return cl, nil
}

func loadProviderServers() {
	var configured []ProviderServer
	if raw := os.Getenv("ANIRIUM_PROVIDER_SERVERS"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &configured); err != nil {
			appendLog("Provider configuration invalid")
		}
	}
	providerMu.Lock()
	providerServers = configured
	providerMu.Unlock()
}

type serviceAuthorization struct {
	PlayerSessionID    string         `json:"playerSessionId"`
	InstalledAddons    []accountAddon `json:"installedAddons"`
	AccountID          string         `json:"accountId"`
	Status             string         `json:"status"`
	Level              int            `json:"level"`
	AuthorizedAddonIDs []string       `json:"authorizedAddonIds"`
	Reason             string         `json:"reason"`
}

// Safe authorization rejection exposed to the Player. Core-provided reasons
// are propagated only when they belong to the documented set; anything else
// collapses to a generic local reason so responses never echo unverified
// Core content.
type serviceAuthRejection struct {
	status int
	reason string
}

const serviceAuthReasonInvalid = "session_invalid"

var coreAuthorizationReasons = map[string]bool{
	"token_invalid":    true,
	"token_expired":    true,
	"device_mismatch":  true,
	"plus_required":    true,
	"session_revoked":  true,
	"session_mismatch": true,
	"account_mismatch": true,
	"core_unavailable": true,
}

func serviceAuthUnavailable() *serviceAuthRejection {
	return &serviceAuthRejection{status: http.StatusServiceUnavailable, reason: "core_unavailable"}
}

func safeCoreReason(reason string) string {
	if coreAuthorizationReasons[reason] {
		return reason
	}
	return ""
}

func coreReasonStatus(reason string) int {
	switch reason {
	case "device_mismatch", "plus_required", "session_mismatch", "account_mismatch":
		return http.StatusForbidden
	case "core_unavailable":
		return http.StatusServiceUnavailable
	default:
		return http.StatusUnauthorized
	}
}

// A deny body is never trusted for authorization, only for the allowlisted
// reason the Core attached to its 401/403 verdict.
func decodeCoreDenyReason(body []byte) string {
	var denial struct {
		Reason string `json:"reason"`
	}
	if json.Unmarshal(body, &denial) != nil {
		return ""
	}
	return safeCoreReason(denial.Reason)
}

func writeServiceAuthRejection(w http.ResponseWriter, rejection *serviceAuthRejection) {
	logAuthorizationDiagnostic(rejection)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(rejection.status)
	json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized", "reason": rejection.reason})
}

// Session credentials belong only to the configured Core endpoint. A redirect
// is not an authorization response, including redirects on the same host.
var coreAuthorizationClient = newCoreAuthorizationClient()

// validateServiceTokenDetailed validates the session with Core and preserves
// the authorization verdict: transport errors, timeouts, invalid configuration
// or unusable responses map to 503 core_unavailable, while authoritative Core
// 401/403 denials keep their allowlisted reason and status.
func validateServiceTokenDetailed(token, deviceID string) (serviceAuthorization, *serviceAuthRejection) {
	var authorization serviceAuthorization
	if token == "" || deviceID == "" {
		return authorization, &serviceAuthRejection{status: http.StatusUnauthorized, reason: "token_invalid"}
	}
	coreURL := configuredCoreURL()
	if coreURL == "" {
		return authorization, serviceAuthUnavailable()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, coreURL+"/api/service/session/validate", nil)
	if err != nil {
		return authorization, serviceAuthUnavailable()
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Anirium-Device", deviceID)
	req.Header.Set("Cache-Control", "no-cache, no-store")
	req.Header.Set("Pragma", "no-cache")
	var trace coreAuthorizationTrace
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace.callbacks()))
	resp, err := coreAuthorizationClient.Do(req)
	if err != nil {
		category := "transport"
		if ctx.Err() == context.DeadlineExceeded {
			category = "deadline"
		}
		appendLog(fmt.Sprintf("Core authorization unavailable pid=%d stage=request category=%s %s", os.Getpid(), category, trace.diagnostic()))
		return authorization, serviceAuthUnavailable()
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil || len(body) > 1<<20 {
		appendLog(fmt.Sprintf("Core authorization unavailable pid=%d stage=body status=%d", os.Getpid(), resp.StatusCode))
		return authorization, serviceAuthUnavailable()
	}
	if resp.StatusCode != http.StatusOK {
		appendLog(fmt.Sprintf("Core authorization response pid=%d status=%d", os.Getpid(), resp.StatusCode))
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			reason := decodeCoreDenyReason(body)
			if reason == "" {
				reason = serviceAuthReasonInvalid
			}
			status := resp.StatusCode
			if reason == "core_unavailable" {
				status = http.StatusServiceUnavailable
			}
			return authorization, &serviceAuthRejection{status: status, reason: reason}
		}
		return authorization, serviceAuthUnavailable()
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	if decoder.Decode(&authorization) != nil {
		return authorization, serviceAuthUnavailable()
	}
	// A successful response must represent exactly one identified account.
	// Reject appended JSON or garbage instead of trusting a valid prefix.
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return serviceAuthorization{}, serviceAuthUnavailable()
	}
	if authorization.Status != "authorized" {
		reason := safeCoreReason(authorization.Reason)
		if reason == "" {
			reason = serviceAuthReasonInvalid
		}
		return authorization, &serviceAuthRejection{status: coreReasonStatus(reason), reason: reason}
	}
	if strings.TrimSpace(authorization.AccountID) == "" {
		return serviceAuthorization{}, &serviceAuthRejection{status: http.StatusUnauthorized, reason: serviceAuthReasonInvalid}
	}
	if authorization.Level < 2 {
		return authorization, &serviceAuthRejection{status: http.StatusForbidden, reason: "plus_required"}
	}
	// A successful verdict must name the player instance; without it the
	// grant could not be bound to one Player session.
	if strings.TrimSpace(authorization.PlayerSessionID) == "" {
		return serviceAuthorization{}, &serviceAuthRejection{status: http.StatusUnauthorized, reason: "player_instance_required"}
	}
	return authorization, nil
}

func validateServiceToken(token, deviceID string) (serviceAuthorization, bool) {
	authorization, rejection := validateServiceTokenDetailed(token, deviceID)
	return authorization, rejection == nil
}

func searchProviderServersSubset(query PlaybackPrepareRequest, parent context.Context, servers []ProviderServer) []ProviderSearchResult {
	results := make([]ProviderSearchResult, 0)
	if query.ManifestSnapshots == nil {
		query.ManifestSnapshots = newProviderSnapshotStore()
	}
	for _, server := range servers {
		if parent.Err() != nil {
			break
		}
		if !server.Enabled || server.ManifestURL == "" || !containsString(query.AuthorizedAddonIDs, server.ID) {
			continue
		}
		minimalContract := false
		manifest, snapshotStatus := query.ManifestSnapshots.manifest(parent, server)
		if snapshotStatus != "ok" {
			continue
		}
		minimalContract = manifest.Search.supported()
		providerID := providerLabelForServer(server, manifest)
		manifestValid := false
		for _, capability := range manifest.Capabilities {
			if capability == "magnet.search" {
				base, baseErr := url.Parse(server.ManifestURL)
				declared, declaredErr := url.Parse(manifest.Endpoints["search"])
				if baseErr == nil && declaredErr == nil && manifestIdentityAcceptsServer(server, manifest) && manifest.Endpoints["search"] != "" {
					resolved := base.ResolveReference(declared)
					if (base.Scheme == "https" || base.Scheme == "http") && resolved.Scheme == base.Scheme && resolved.Host == base.Host && resolved.User == nil && base.User == nil {
						server.SearchURL = resolved.String()
						manifestValid = true
					}
				}
				break
			}
		}
		if !manifestValid {
			continue
		}
		if minimalContract {
			ctx, cancel := context.WithTimeout(parent, 20*time.Second)
			results = append(results, searchMinimalProvider(ctx, server.SearchURL, providerID, query)...)
			cancel()
			continue
		}
		endpoint, err := url.Parse(server.SearchURL)
		if err != nil {
			continue
		}
		params := endpoint.Query()
		params.Set("title", query.Title)
		params.Set("titleEnglish", query.TitleEnglish)
		params.Set("titleRomaji", query.TitleRomaji)
		params.Set("season", fmt.Sprintf("%d", query.Season))
		params.Set("ep", fmt.Sprintf("%d", query.Episode))
		endpoint.RawQuery = params.Encode()
		ctx, cancel := context.WithTimeout(parent, 20*time.Second)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
		if err != nil {
			cancel()
			continue
		}
		req.Header.Set("X-Search-Timeout-Ms", fmt.Sprint(providerSearchBudgetMS(ctx)))
		resp, err := providerHTTPClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			var payload struct {
				Sources []ProviderSearchResult `json:"sources"`
			}
			if decodeProviderJSON(resp.Body, 4<<20, &payload) == nil {
				for _, result := range payload.Sources {
					result.Provider = providerID
					if hash, valid := normalizedMagnetHash(result.Magnet); valid {
						result.InfoHash = hash
						results = append(results, result)
					}
				}
			}
		}
		if resp != nil {
			resp.Body.Close()
		}
		cancel()
	}
	return results
}

// probeMixFile lê as tracks do contêiner real. O resultado alimenta o
// manifesto; o frontend não consegue declarar uma faixa que não exista.
func probeMixFile(magnet string, generation ...uint64) {
	swarmMu.RLock()
	cl := torrentClient
	parent := playbackContext
	probeCache := playbackInputs
	if len(generation) > 0 && generation[0] != playbackGeneration {
		swarmMu.RUnlock()
		return
	}
	swarmMu.RUnlock()
	if cl == nil {
		return
	}
	t, err := addPlaybackTorrent(parent, cl, resolveMediaSource(magnet).Magnet)
	if err != nil {
		return
	}
	select {
	case <-t.GotInfo():
	case <-parent.Done():
		return
	case <-time.After(25 * time.Second):
		if t.Info() == nil {
			return
		}
	}
	video, selectErr := selectSourceVideo(parent, t.Files(), magnet)
	if selectErr != nil || video == nil {
		return
	}
	paths := []string{}
	for _, file := range t.Files() {
		paths = append(paths, file.DisplayPath())
	}
	wanted, _ := parent.Value(episodeContextKey{}).(episodeContext)
	sidecars := selectEpisodeSidecars(paths, video.DisplayPath(), wanted)
	swarmMu.Lock()
	if len(generation) == 0 || generation[0] == playbackGeneration {
		probedSidecars[magnet] = sidecars
	}
	swarmMu.Unlock()
	// A seekable local range input lets ffprobe inspect headers/tail metadata
	// without prioritizing the complete video or first trying a non-seekable pipe.
	parsed, err := probeCachedInput(parent, probeCache, magnet)
	if err != nil {
		return
	}
	qualities := map[string]bool{}
	audios := map[string]bool{}
	subs := map[string]bool{}
	videoSeen := false
	for _, stream := range parsed.Streams {
		language := strings.TrimSpace(stream.Tags.Language)
		if language == "" {
			language = strings.TrimSpace(stream.Tags.Title)
		}
		if language == "" {
			language = "Original"
		}
		switch stream.CodecType {
		case "video":
			if videoSeen || stream.Disposition.AttachedPic != 0 {
				continue
			}
			videoSeen = true
			quality := qualityForHeight(stream.Height)
			qualities[quality] = true
		case "audio":
			audios[language] = true
		case "subtitle":
			subs[language] = true
		}
	}
	swarmMu.Lock()
	if len(generation) > 0 && generation[0] != playbackGeneration {
		swarmMu.Unlock()
		return
	}
	probedStreams[magnet] = parsed.Streams
	probedFormats[magnet] = parsed
	for quality := range qualities {
		if quality != "unknown" && !containsString(currentMixQualities, quality) {
			currentMixQualities = append(currentMixQualities, quality)
		}
	}
	refreshAudioSelectionLocked()
	for language := range subs {
		if !containsString(currentMixSubs, language) {
			currentMixSubs = append(currentMixSubs, language)
		}
	}
	swarmMu.Unlock()
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func qualityHeight(quality string) string {
	return strconv.Itoa(qualityPixels(quality))
}

func selectVariantQualities(available []string) []string {
	return orderedExistingQualities(available)
}

// materializeVideo retains full-file export/test support. Normal playback uses
// newProgressiveMediaInputCache and never calls this full-copy loader.
func materializeVideo(ctx context.Context, magnet string, index int) (string, error) {
	swarmMu.RLock()
	cl := torrentClient
	swarmMu.RUnlock()
	if cl == nil {
		return "", fmt.Errorf("torrent client indisponível")
	}
	t, err := addPlaybackTorrent(ctx, cl, resolveMediaSource(magnet).Magnet)
	if err != nil {
		return "", err
	}
	select {
	case <-t.GotInfo():
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(25 * time.Second):
		if t.Info() == nil {
			return "", fmt.Errorf("metadata timeout")
		}
	}
	video, selectErr := selectSourceVideo(ctx, t.Files(), magnet)
	if selectErr != nil {
		return "", selectErr
	}
	if video == nil {
		return "", fmt.Errorf("vídeo não encontrado")
	}
	dir := filepath.Join(os.TempDir(), "anirium-mix", "inputs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, fmt.Sprintf("source-%d-%d%s", index, time.Now().UnixNano(), filepath.Ext(video.DisplayPath())))
	video.Download()
	reader := video.NewReader()
	defer reader.Close()
	stopReader := context.AfterFunc(ctx, func() { reader.Close() })
	defer stopReader()
	out, err := os.Create(path)
	if err != nil {
		return "", err
	}
	copied, copyErr := io.Copy(out, io.LimitReader(reader, video.Length()))
	if copyErr == nil && copied != video.Length() {
		copyErr = io.ErrUnexpectedEOF
	}
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(path)
		return "", copyErr
	}
	if closeErr != nil {
		_ = os.Remove(path)
		return "", closeErr
	}
	return path, nil
}

type hlsSegment struct {
	duration string
	path     string
	size     int64
}

func copyFile(source, destination string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func chooseBestSegment(sources [][]hlsSegment, position int) (hlsSegment, bool) {
	var best hlsSegment
	found := false
	referenceDuration := 0.0
	for _, source := range sources {
		if position < 0 || position >= len(source) {
			continue
		}
		candidate := source[position]
		duration, err := strconv.ParseFloat(candidate.duration, 64)
		if err != nil || math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0 || candidate.size <= 0 {
			continue
		}
		if !found {
			referenceDuration = duration
		}
		if math.Abs(duration-referenceDuration) > 0.05 {
			continue
		}
		if !found || candidate.size < best.size {
			best = candidate
			found = true
		}
	}
	return best, found
}

func transcodeSourceToHLS(input, dir, quality string, parents ...context.Context) ([]hlsSegment, error) {
	if qualityPixels(quality) == 0 {
		return nil, fmt.Errorf("invalid video quality: %q", quality)
	}
	parent := context.Background()
	if len(parents) > 0 {
		parent = parents[0]
	}
	if err := parent.Err(); err != nil {
		return nil, err
	}
	releaseSlot, slotErr := acquireVideoSlot(parent, quality)
	if slotErr != nil {
		return nil, slotErr
	}
	defer releaseSlot()
	return transcodeVideoWithOwnedSlot(parent, input, dir, quality)
}

// Caller owns a video slot through both input acquisition and encoding.
func transcodeVideoWithOwnedSlot(parent context.Context, input, dir, quality string) ([]hlsSegment, error) {
	if err := parent.Err(); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	playlist := filepath.Join(dir, "source.m3u8")
	segmentPattern := filepath.Join(dir, "segment-%06d.ts")
	ctx, cancel := context.WithTimeout(parent, 20*time.Minute)
	defer cancel()
	args := []string{"-hide_banner", "-loglevel", "error", "-i", input, "-map", "0:V:0", "-an", "-vf", "fps=24,scale=-2:" + qualityHeight(quality), "-fps_mode", "passthrough", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-g", "96", "-keyint_min", "96", "-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*4)", "-f", "hls", "-hls_time", "4", "-hls_flags", "independent_segments+temp_file", "-hls_playlist_type", "event", "-hls_list_size", "0", "-hls_segment_filename", segmentPattern, playlist}
	if err := mediaCommandContext(ctx, mediaTool("ffmpeg"), boundedTranscodeArgs(args, "2")...).Run(); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(playlist)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	segments := make([]hlsSegment, 0)
	var duration string
	for _, line := range lines {
		if strings.HasPrefix(line, "#EXTINF:") {
			duration = strings.TrimSuffix(strings.TrimPrefix(line, "#EXTINF:"), ",")
			continue
		}
		if line == "" || strings.HasPrefix(line, "#") || duration == "" {
			continue
		}
		path := filepath.Join(dir, line)
		if info, statErr := os.Stat(path); statErr == nil {
			segments = append(segments, hlsSegment{duration: duration, path: path, size: info.Size()})
		}
		duration = ""
	}
	return segments, nil
}

// buildVariant transforma cada fonte para o mesmo formato HLS e monta a
// playlist final segmento a segmento. Para cada posição temporal, o mixer
// escolhe o menor segmento compatível dentro da mesma variante normalizada,
// mantendo fallback para fontes que tenham a mesma posição quando outra falha.
func buildVariant(magnets []string, quality string, generation uint64) {
	swarmMu.RLock()
	if generation != playbackGeneration {
		swarmMu.RUnlock()
		return
	}
	ctx, cancel := context.WithTimeout(continuousContextLocked(), 30*time.Minute)
	inputCache := playbackInputs
	defer cancel()
	id := playbackVariantID(generation, quality)
	variantMu.Lock()
	if existing, ok := variantRuntimes[id]; ok && (existing.Status == "preparing" || existing.Status == "ready") {
		variantMu.Unlock()
		swarmMu.RUnlock()
		return
	}
	dir, err := os.MkdirTemp("", "anirium-mix-"+id+"-")
	if err != nil {
		variantMu.Unlock()
		swarmMu.RUnlock()
		return
	}
	defer retireMediaDirectory(playbackContext, dir)()
	variantRuntimes[id] = &variantRuntime{MixVariant: MixVariant{ID: id, Quality: quality, Status: "preparing"}, Dir: dir}
	variantMu.Unlock()
	swarmMu.RUnlock()

	producers := make([]hlsProducer, 0, len(magnets))
	for index, magnet := range magnets {
		if ctx.Err() != nil {
			return
		}
		swarmMu.RLock()
		eligible := generation == playbackGeneration && videoSupportsQuality(probedStreams[magnet], quality)
		swarmMu.RUnlock()
		if !eligible {
			continue
		}
		producers = append(producers, hlsProducer{source: magnet, inputStream: "0:V:0", playlist: "source.m3u8", clockStream: "v:0", run: func(jobContext context.Context, sourceDir string) error {
			return runQueuedVideoInput(jobContext, quality, func() error {
				input, release, err := inputCache.acquire(jobContext, magnet, index)
				if err != nil {
					return err
				}
				defer release()
				_, err = transcodeVideoWithOwnedSlot(jobContext, input, sourceDir, quality)
				return err
			})
		}})
	}
	if len(producers) == 0 {
		markVariantStalled(id)
		return
	}
	if err := publishIncrementalHLS(ctx, dir, producers, func(progress hlsProgress) { publishRuntimeProgress(ctx, id, "master.m3u8", progress) }); err != nil {
		markVariantStalled(id, err)
	}
}

func markVariantStalled(id string, causes ...error) {
	variantMu.Lock()
	defer variantMu.Unlock()
	if runtime, ok := variantRuntimes[id]; ok {
		if len(causes) > 0 {
			runtime.processingError = causes[0]
		}
		runtime.ProcessingFailed = true
		runtime.ProcessingComplete = false
		// Keep the immutable published prefix reachable by an attached player.
		// No ENDLIST is added: this is not a completed episode.
		if runtime.BufferedSeconds > 0 && runtime.PlaylistURL != "" {
			runtime.Status = "ready"
			return
		}
		runtime.Status = "stalled"
	}
}

// Atualizador de telemetria em tempo real do torrent e taxa de upload/seed
func startStatsTracker() {
	lastStatsCheck = time.Now()
	ticker := time.NewTicker(1 * time.Second)

	for range ticker.C {
		now := time.Now()
		elapsed := now.Sub(lastStatsCheck).Seconds()
		if elapsed <= 0 {
			elapsed = 1
		}

		swarmMu.Lock()
		if torrentClient != nil {
			var currentWritten int64 = 0
			peersTotal := 0

			// Count connected peers only in the current playback's unique swarms.
			activeHashes := activeTorrentHashes(activeLinks)
			activeSwarmReads := map[string]int64{}
			for _, tor := range torrentClient.Torrents() {
				if !activeHashes[tor.InfoHash().HexString()] {
					continue
				}
				st := tor.Stats()
				peersTotal += st.ActivePeers
				activeSwarmReads[tor.InfoHash().HexString()] = st.BytesReadData.Int64()
			}
			observedTransferCapacity.observeSwarms(activeSwarmReads, elapsed)

			cStats := torrentClient.ConnStats()
			currentWritten = cStats.BytesWrittenData.Int64()
			currentRead := cStats.BytesReadData.Int64()

			// Remove sessões inativas de streaming (>60s sem requests)
			for k, s := range activeSessions {
				if now.Sub(s.UpdatedAt) > 60*time.Second {
					delete(activeSessions, k)
				}
			}

			// Taxa e Total de Upload (Limitado para Fairness)
			diffWritten := currentWritten - lastBytesWritten
			if diffWritten < 0 {
				diffWritten = 0
			}
			lastBytesWritten = currentWritten

			speedUpKB := float64(diffWritten) / elapsed / 1024.0
			if speedUpKB > 1024.0 {
				uploadRateStr = fmt.Sprintf("%.2f MB/s", speedUpKB/1024.0)
			} else {
				uploadRateStr = fmt.Sprintf("%.1f KB/s", speedUpKB)
			}

			// Taxa e Total de Download
			diffRead := currentRead - lastBytesRead
			if diffRead < 0 {
				diffRead = 0
			}
			lastBytesRead = currentRead

			speedDownKB := float64(diffRead) / elapsed / 1024.0
			if speedDownKB > 1024.0 {
				downloadRateStr = fmt.Sprintf("%.2f MB/s", speedDownKB/1024.0)
			} else {
				downloadRateStr = fmt.Sprintf("%.1f KB/s", speedDownKB)
			}

			// Formatação de Consumo Acumulado
			if currentRead > 1024*1024*1024 {
				totalDownloadedStr = fmt.Sprintf("%.2f GB", float64(currentRead)/(1024*1024*1024))
			} else {
				totalDownloadedStr = fmt.Sprintf("%.1f MB", float64(currentRead)/(1024*1024))
			}

			if currentWritten > 1024*1024*1024 {
				totalUploadedStr = fmt.Sprintf("%.2f GB", float64(currentWritten)/(1024*1024*1024))
			} else {
				totalUploadedStr = fmt.Sprintf("%.1f MB", float64(currentWritten)/(1024*1024))
			}

			connectedPeers = peersTotal
		}
		lastStatsCheck = now
		swarmMu.Unlock()
	}
}

func restrictLegacyPlayback(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		switch r.URL.Path {
		case "/stream", "/set-mix", "/tracks":
			http.Error(w, "Legacy playback endpoint removed; use authenticated playback preparation", http.StatusGone)
			return
		}
		if r.URL.Query().Has("magnet") || r.URL.Query().Has("magnets") {
			http.Error(w, "Provider inputs are accepted only through authorized discovery", http.StatusBadRequest)
			return
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		switch r.URL.Path {
		case "/manifest", "/stats", "/providers":
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if _, rejection := validateServiceTokenDetailed(token, r.Header.Get("X-Anirium-Device")); rejection != nil {
				writeServiceAuthRejection(w, rejection)
				return
			}
		}
		if strings.HasPrefix(r.URL.Path, "/hls/") || r.URL.Path == "/subtitles" || r.URL.Path == "/playback/variant" || r.URL.Path == "/playback/window" || r.URL.Path == "/playback/buffer" || r.URL.Path == "/playback/session" {
			if rejection := validatePlaybackGrantRejection(r.URL.Query().Get("playbackTicket")); rejection != nil {
				writeServiceAuthRejection(w, rejection)
				return
			}
		}
		next.ServeHTTP(w, r)

	})
}

func startHTTPServer(port int, listener net.Listener) {
	server := newLocalHTTPServer(port)
	_ = server.Serve(listener)
}

func newServiceHTTPHandler(port int) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/playback/session", handlePlaybackSession)
	mux.HandleFunc("/playback/window", handlePlaybackWindow)
	mux.HandleFunc("/playback/buffer", handlePlaybackBuffer)
	mux.HandleFunc("/playback/renew", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", 405)
			return
		}
		var input struct {
			Ticket string `json:"playbackTicket"`
			Token  string `json:"token"`
			Device string `json:"deviceId"`
		}
		if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&input) != nil {
			http.Error(w, "Playback renewal unauthorized", 401)
			return
		}
		if rejection := renewPlaybackGrantDetailed(input.Ticket, input.Token, input.Device); rejection != nil {
			writeServiceAuthRejection(w, rejection)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"authorized"}`)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := HealthResponse{
			Status:      "online",
			Service:     "Anirium Player Pro Torrent Node",
			Version:     serviceVersion,
			Port:        port,
			IsNative:    true,
			Engine:      "anirium-native-torrent",
			LogFailures: serviceLog.failures.Load(),
		}
		json.NewEncoder(w).Encode(resp)
	})

	mux.HandleFunc("/providers", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		providerMu.RLock()
		servers := append([]ProviderServer(nil), providerServers...)
		providerMu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "providers": servers})
	})

	// O Player envia apenas contexto de episódio. Magnets são descobertos pelo
	// serviço através dos servidores de providers autorizados.
	mux.HandleFunc("/playback/prepare", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method != http.MethodPost {
			http.Error(w, "POST obrigatório", http.StatusMethodNotAllowed)
			return
		}
		input, inputErr := decodePlaybackPrepare(r.Body)
		if inputErr != nil {
			http.Error(w, "Payload inválido", http.StatusBadRequest)
			return
		}
		authorization, rejection := validateServiceTokenDetailed(input.Token, input.DeviceID)
		if rejection == nil && strings.TrimSpace(authorization.PlayerSessionID) == "" {
			rejection = &serviceAuthRejection{status: http.StatusUnauthorized, reason: "player_instance_required"}
		}
		if rejection != nil {
			writeServiceAuthRejection(w, rejection)
			return
		}
		input.AuthorizedAddonIDs = authorization.AuthorizedAddonIDs
		input.AccountProviderServers = accountProviderServers(authorization)
		input.ManifestSnapshots = newProviderSnapshotStore()
		preparePlaybackMu.Lock()
		defer preparePlaybackMu.Unlock()
		if playbackShuttingDown {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"status": "service_shutting_down"})
			return
		}
		if !mediaToolsAvailable() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"status": "media_tools_missing", "reason": "ffmpeg_and_ffprobe_required"})
			return
		}
		if r.Context().Err() != nil {
			return
		}
		results := searchProviderServers(input, r.Context())
		providerSubtitles := searchSubtitleProviders(input, r.Context())
		if r.Context().Err() != nil {
			return
		}
		rechecked, recheckRejection := validateServiceTokenDetailed(input.Token, input.DeviceID)
		if recheckRejection != nil {
			writeServiceAuthRejection(w, recheckRejection)
			return
		}
		if mismatch := recheckPrepareAuthorization(authorization, rechecked); mismatch != nil {
			writeServiceAuthRejection(w, mismatch)
			return
		}
		if r.Context().Err() != nil {
			return
		}
		magnets := pooledMagnets(results)
		if len(magnets) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "status": "no-sources", "sources": 0, "providerStatus": input.ManifestSnapshots.statusByID()})
			return
		}
		swarmMu.Lock()
		requestedEpisode = episodeContext{Episode: input.Episode, Season: input.Season}
		generation := resetPlaybackLocked()
		probeContext := playbackContext
		externalSubtitles = providerSubtitles
		currentActiveTitle = input.Title
		currentMixQualities = []string{}
		currentMixAudios = []string{}
		currentMixSubs = []string{}
		activeLinks = append([]string(nil), magnets...)
		playbackMagnets = append([]string(nil), magnets...)
		workers := playbackWorkers
		workers.Add(1)
		swarmMu.Unlock()
		ticket, ticketErr := issuePlaybackGrant(input.Token, input.DeviceID, authorization.AccountID, authorization.PlayerSessionID)
		if ticketErr != nil {
			workers.Done()
			http.Error(w, "Playback credential unavailable", 500)
			return
		}
		// Aguarda a descoberta das faixas/qualidades de todas as fontes e só
		workers.Add(1)
		go func() {
			defer workers.Done()
			watchPlaybackAuthorization(probeContext, generation, ticket, 30*time.Second, magnets...)
		}()
		// então inicia um mixer por variante, recebendo o conjunto completo.
		go func(sources []string) {
			defer workers.Done()
			sources = expandMediaSources(probeContext, sources, generation)
			probeSources(probeContext, sources, func(source string) { probeMixFile(source, generation) })
			swarmMu.Lock()
			if generation != playbackGeneration {
				swarmMu.Unlock()
				return
			}
			freezeCompatibleSourceSetLocked()
			releaseExcludedSourceTorrentsLocked()
			refreshAudioSelectionLocked()
			audioSelectionFrozen = true
			playbackDiscoveryComplete = true
			qualities := append([]string(nil), currentMixQualities...)
			audioCandidates := append([]AudioCandidate(nil), selectedAudioCandidates...)
			swarmMu.Unlock()
			// Session mode inventories every choice, but media production starts
			// only after the Player chooses its video quality and audio track.
			if os.Getenv("ANIRIUM_CONTINUOUS_BUFFER") == "1" {
				return
			}
			for index, candidate := range audioCandidates {
				workers.Add(1)
				go func() { defer workers.Done(); buildAudioTrack(candidate, index, generation) }()
			}
			if ordered := selectVariantQualities(qualities); len(ordered) > 0 {
				requestVideoVariant(ordered[0], generation)
			}
		}(append([]string(nil), magnets...))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "status": "preparing", "sources": len(magnets), "playbackTicket": ticket, "providerStatus": input.ManifestSnapshots.statusByID()})
	})

	mux.HandleFunc("/playback/variant", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		quality, err := decodeVariantQuality(r.URL.Query())
		if err != nil {
			http.Error(w, "Invalid quality request", http.StatusBadRequest)
			return
		}
		preparePlaybackMu.Lock()
		defer preparePlaybackMu.Unlock()
		if playbackShuttingDown {
			http.Error(w, "Service shutting down", http.StatusServiceUnavailable)
			return
		}
		swarmMu.RLock()
		generation := playbackGeneration
		swarmMu.RUnlock()
		if !requestVideoVariant(quality, generation) {
			http.Error(w, "Quality not available", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})

	// Telemetria do nó em JSON (Peers, taxa de seed e mix ativo)
	mux.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		swarmMu.RLock()
		linksCopy := make([]string, len(activeLinks))
		copy(linksCopy, activeLinks)

		sessionsCopy := make([]StreamSession, 0, len(activeSessions))
		now := time.Now()
		for _, s := range activeSessions {
			// Mantém sessões que enviaram heartbeat/leitura nos últimos 45 segundos
			if now.Sub(s.UpdatedAt) < 45*time.Second {
				sessionsCopy = append(sessionsCopy, *s)
			}
		}

		resp := StatsResponse{
			Peers:           connectedPeers,
			UploadRate:      uploadRateStr,
			DownloadRate:    downloadRateStr,
			TotalDownloaded: totalDownloadedStr,
			TotalUploaded:   totalUploadedStr,
			FairnessLimit:   fairnessLimitStr,
			ActiveMix:       currentActiveTitle,
			MixDuration:     currentMixDuration,
			MixQualities:    currentMixQualities,
			MixAudios:       currentMixAudios,
			MixSubtitles:    currentMixSubs,
			ActiveLinks:     linksCopy,
			ActiveTorrents:  len(activeTorrentHashes(linksCopy)),
			ActiveSessions:  sessionsCopy,
			Port:            port,
			Status:          "online",
		}
		swarmMu.RUnlock()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// Snapshot pequeno e estável para o player: não expõe detalhes internos do
	// swarm e permite atualizar as opções sem reconsultar os providers.
	mux.HandleFunc("/manifest", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		swarmMu.RLock()
		links := len(activeLinks)
		generation := playbackGeneration
		qualities := append([]string(nil), currentMixQualities...)
		episodeDuration := playbackEpisodeDurationLocked()
		audios := append([]string(nil), currentMixAudios...)
		audioChoices := append([]string(nil), currentMixAudios...)
		subs := append([]string(nil), currentMixSubs...)
		subtitleTracks := subtitleTracksLocked()
		audioTracks := manifestAudioTracksLocked()
		audios = []string{}
		for _, track := range audioTracks {
			if track.Status == "ready" {
				audios = append(audios, track.Language)
			}
		}
		peers := connectedPeers
		rateSnapshot := downloadRateStr
		variants := []MixVariant{}
		manifestQualities := selectVariantQualities(qualities)
		discoveryComplete := playbackDiscoveryComplete
		for _, quality := range manifestQualities {
			if quality != "" {
				variant := MixVariant{
					ID: playbackVariantID(generation, quality), Quality: quality,
					AudioLanguages: append([]string(nil), audios...), SubtitleCount: len(subs),
					Status: "available", PeerCount: peers,
				}
				if requestedVariants[variant.ID] {
					variant.Status = "preparing"
				}
				variantMu.RLock()
				if runtime, ok := variantRuntimes[variant.ID]; ok {
					variant = runtime.MixVariant
					variant.PeerCount = peers
				}
				variantMu.RUnlock()
				if window := currentPlaybackWindow; window != nil && window.ctx.Err() == nil && window.Quality == quality && window.Status == "preparing" {
					variant = preparingWindowVariant(variant)
				}
				if window := currentPlaybackWindow; window != nil && window.ctx.Err() == nil && window.Quality == quality && window.Status == "stalled" {
					variant = stalledWindowVariant(variant)
				}
				if window := currentPlaybackWindow; window != nil && window.ctx.Err() == nil && window.Status == "ready" {
					if window.Quality == quality {
						variantMu.RLock()
						if runtime := variantRuntimes[window.ID+"-video"]; runtime != nil {
							variant = runtime.MixVariant
							variant.PlaylistURL = window.PlaylistURL
							variant.PeerCount = peers
						}
						variantMu.RUnlock()
					} else {
						variant.Status, variant.PlaylistURL = "available", ""
						variant.ProcessingFailed = false
					}
				}
				variant.AudioLanguages = append([]string(nil), audios...)
				variant.SubtitleCount = len(subtitleTracks)
				if variant.Status == "ready" && !audioPlaybackReady(audioTracks) {
					variant.Status = audioPreparationStatus(audioTracks)
					variant.PlaylistURL = ""
					variant.BufferPercent = 0
				}
				variants = append(variants, variant)
			}
		}
		swarmMu.RUnlock()
		manifestStatus, bufferPercent := manifestAvailability(variants, discoveryComplete)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(MixManifest{
			WindowOnDemand:   discoveryComplete,
			ContinuousBuffer: discoveryComplete && os.Getenv("ANIRIUM_CONTINUOUS_BUFFER") == "1",
			EpisodeDuration:  episodeDuration,
			Version:          1, QualityOnDemand: discoveryComplete, Status: manifestStatus, ActiveLinks: links, Peers: peers,
			Qualities: manifestQualities, Audios: audios, Subtitles: subs,
			SubtitleTracks: subtitleTracks,
			AudioTracks:    audioTracks,
			AudioChoices:   audioChoices,
			Variants:       variants, BufferPercent: bufferPercent, DownloadRate: rateSnapshot,
		})
	})

	// Entrega playlists e segmentos produzidos pelo worker do mixer.
	mux.HandleFunc("/hls/", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		rel := strings.TrimPrefix(r.URL.Path, "/hls/")
		parts := strings.Split(rel, "/")
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" || strings.Contains(rel, "..") {
			http.Error(w, "Segmento inválido", http.StatusBadRequest)
			return
		}
		if parts[1] == "continuous.m3u8" {
			servePreparedWindowSequence(w, r, parts[0])
			return
		}
		if parts[1] == "continuous-master.m3u8" {
			servePreparedWindowMaster(w, r, parts[0])
			return
		}
		runtime, ok := readyVariantSnapshot(parts[0])
		if !ok {
			http.NotFound(w, r)
			return
		}
		if parts[1] == "master.m3u8" {
			swarmMu.RLock()
			tracks := audioTracksLocked()
			for _, window := range []*playbackWindow{currentPlaybackWindow, prefetchedPlaybackWindow} {
				if window != nil && parts[0] == window.ID+"-video" && window.ctx.Err() == nil {
					tracks = append([]AudioTrack(nil), window.AudioTracks...)
					break
				}
			}
			swarmMu.RUnlock()
			if runtime.muxedAudio {
				tracks = nil
			}
			if !audioPlaybackReady(tracks) {
				w.Header().Set("Retry-After", "1")
				http.Error(w, "Audio is still preparing", http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Header().Set("Cache-Control", "no-store")
			fmt.Fprint(w, masterPlaylist(parts[0], tracks, r.URL.Query().Get("playbackTicket"), runtime.Bandwidth))
			return
		}
		path := filepath.Join(runtime.Dir, parts[1])
		if _, err := os.Stat(path); err != nil {
			http.NotFound(w, r)
			return
		}
		if strings.HasSuffix(parts[1], ".m3u8") {
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		} else {
			w.Header().Set("Content-Type", "video/mp2t")
		}
		if strings.HasSuffix(path, ".m3u8") {
			data, err := os.ReadFile(path)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Header().Set("Cache-Control", "no-store")
			fmt.Fprint(w, authorizePlaylist(string(data), r.URL.Query().Get("playbackTicket")))
			return
		}
		http.ServeFile(w, r, path)
	})

	// Endpoint nativo para entrega direta das legendas (.srt / .ass / .vtt) extraídas do torrent
	mux.HandleFunc("/subtitles", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		magnet := ""
		trackID := r.URL.Query().Get("trackId")
		if trackID == "" {
			http.Error(w, "ID de faixa obrigatório", http.StatusBadRequest)
			return
		}
		requestedIndex := -1
		requestedFile := ""
		windowStart := -1.0
		if value := r.URL.Query().Get("start"); value != "" {
			parsed, err := strconv.ParseFloat(value, 64)
			if err != nil || parsed < 0 || parsed > 86400 || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
				http.Error(w, "Janela de legenda inválida", http.StatusBadRequest)
				return
			}
			windowStart = parsed
		}
		swarmMu.RLock()
		mediaContext := playbackContext
		subtitleCache := playbackInputs
		subtitleContext, cancelSubtitle := subtitleRequestContext(r.Context(), mediaContext)
		defer cancelSubtitle()
		var remote *ProviderSubtitle
		for index, subtitle := range externalSubtitles {
			if trackID == fmt.Sprintf("external-%d-%d", playbackGeneration, index) {
				copy := subtitle
				remote = &copy
				break
			}
		}
		if remote != nil {
			swarmMu.RUnlock()
			content, err := externalSubtitleVTT(subtitleContext, *remote)
			if err != nil {
				http.Error(w, "Provider de legenda indisponível", http.StatusBadGateway)
				return
			}
			subtitleCache.rememberCompleteSubtitle(trackID)
			prepareSubtitleAlignmentReference(subtitleContext, subtitleCache, remote.Language, extractCachedSubtitle)
			alignment := "unverified"
			if adjusted, verified := alignExternalSubtitleToVideo(subtitleCache, remote.Language, content, trackID); verified {
				content, alignment = adjusted, "verified"
			}
			w.Header().Set("X-Anirium-Subtitle-Alignment", alignment)
			w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			fmt.Fprint(w, content)
			return
		}
		if trackID != "" {
			magnet = ""
			for _, track := range subtitleTracksLocked() {
				if track.ID == trackID {
					magnet = track.Source
					requestedIndex = track.StreamIndex
					requestedFile = track.FilePath
					break
				}
			}
		}
		swarmMu.RUnlock()
		if magnet == "" {
			http.Error(w, "Faixa de legenda não encontrada", http.StatusNotFound)
			return
		}

		swarmMu.RLock()
		client := torrentClient
		swarmMu.RUnlock()
		t, err := addPlaybackTorrent(subtitleContext, client, resolveMediaSource(magnet).Magnet)
		if err != nil {
			if subtitleContext.Err() != nil {
				http.Error(w, "Sessão de reprodução encerrada", http.StatusUnauthorized)
				return
			}
			http.Error(w, "Subtitle source unavailable", http.StatusBadRequest)
			return
		}

		select {
		case <-t.GotInfo():
		case <-subtitleContext.Done():
			http.Error(w, "Sessão de reprodução encerrada", http.StatusUnauthorized)
			return
		case <-time.After(25 * time.Second):
			if t.Info() == nil {
				http.Error(w, "Aguardando metadados do swarm P2P...", http.StatusGatewayTimeout)
				return
			}
		}

		var matchedSub *torrent.File

		for _, f := range t.Files() {
			if requestedFile != "" && f.DisplayPath() == requestedFile {
				matchedSub = f
			}
		}

		if matchedSub != nil {
			matchedSub.Download()
			reader := matchedSub.NewReader()
			defer reader.Close()
			readContext, cancelRead := context.WithTimeout(subtitleContext, 90*time.Second)
			defer cancelRead()
			stopReader := context.AfterFunc(readContext, func() { reader.Close() })
			defer stopReader()
			const maxSubtitleBytes = 16 << 20
			contentBytes, err := io.ReadAll(io.LimitReader(reader, maxSubtitleBytes+1))
			if len(contentBytes) > maxSubtitleBytes {
				http.Error(w, "Legenda excede o limite", http.StatusRequestEntityTooLarge)
				return
			}
			if err == nil && len(contentBytes) > 0 {
				vtt, conversionErr := convertSidecarVTT(readContext, contentBytes, filepath.Ext(matchedSub.DisplayPath()))
				if conversionErr != nil {
					http.Error(w, "Não foi possível converter a legenda selecionada", http.StatusUnprocessableEntity)
					return
				}
				if vtt != "" {
					subtitleCache.rememberCompleteSubtitle(trackID)
					w.Header().Set("X-Anirium-Subtitle-Alignment", "unverified")
					w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
					w.Header().Set("Cache-Control", "no-store")
					w.WriteHeader(http.StatusOK)
					w.Write([]byte(vtt))
					return
				}
			}
		}

		// Alguns MKV/MP4 não possuem sidecar: a legenda está embutida como uma
		if requestedFile != "" {
			http.Error(w, "Não foi possível ler a faixa externa selecionada", http.StatusNotFound)
			return
		}
		// faixa do próprio vídeo. Extraímos somente a faixa solicitada para VTT.
		// Extraction failures are not missing tracks, regardless of language.
		videoFile, _ := selectSourceVideo(mediaContext, t.Files(), magnet)
		if videoFile != nil {
			if requestedIndex < 0 {
				http.Error(w, "Faixa de legenda não encontrada", http.StatusNotFound)
				return
			}
			waitContext := subtitleContext
			if windowStart < 0 {
				var cancelWait context.CancelFunc
				waitContext, cancelWait = context.WithTimeout(subtitleContext, 15*time.Second)
				defer cancelWait()
			}
			if content, err := extractCachedSubtitleWindow(waitContext, subtitleCache, magnet, requestedIndex, windowStart); err == nil {
				if windowStart < 0 {
					subtitleCache.mu.Lock()
					delete(subtitleCache.externalSubtitleAlignmentSources, trackID)
					subtitleCache.mu.Unlock()
				}
				w.Header().Set("X-Anirium-Subtitle-Alignment", embeddedSubtitleAlignment(subtitleCache, magnet))
				if windowStart < 0 {
					subtitleCache.rememberCompleteSubtitle(trackID)
				}
				if windowStart >= 0 {
					w.Header().Set("X-Anirium-Subtitle-Offset", strconv.FormatFloat(windowStart, 'f', 3, 64))
				}
				w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
				w.Header().Set("Cache-Control", "no-store")
				fmt.Fprint(w, content)
				return
			} else {
				if windowStart < 0 && err == context.DeadlineExceeded && subtitleContext.Err() == nil && subtitleCache.subtitlePreparationPending(subtitleWindowKey{source: magnet, stream: requestedIndex, start: -1}) {
					w.Header().Set("Retry-After", "2")
					w.Header().Set("Cache-Control", "no-store")
					w.WriteHeader(http.StatusAccepted)
					return
				}
				status := http.StatusBadGateway
				if windowStart < 0 && subtitleContext.Err() == nil {
					if recovered, producer, ready := recoverCompleteEmbeddedSubtitle(subtitleCache, trackID); ready {
						w.Header().Set("X-Anirium-Subtitle-Alignment", embeddedSubtitleAlignment(subtitleCache, producer))
						w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
						w.Header().Set("Cache-Control", "no-store")
						fmt.Fprint(w, recovered)
						return
					}
				}
				message := "Não foi possível extrair a legenda selecionada"
				if err == context.DeadlineExceeded {
					status = http.StatusGatewayTimeout
					message = "Tempo esgotado aguardando os dados da legenda"
				}
				http.Error(w, message, status)
				return
			}
		}

		http.Error(w, "Faixa de legenda não encontrada no payload do torrent", http.StatusNotFound)
	})

	return restrictLegacyPlayback(mux)
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--diagnostics" {
		executable, err := os.Executable()
		if err == nil {
			err = runServiceDiagnostics(os.Stdout, filepath.Dir(executable))
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	appendLog("=== Anirium Service Starting ===")
	options, optionErr := parseServiceStartupOptions(os.Args[1:])
	if optionErr != nil {
		fmt.Fprintln(os.Stderr, optionErr)
		os.Exit(2)
	}
	loadProviderServers()
	// Oculta a janela de console/cmd do Windows imediatamente (aplicação nativa de bandeja)
	consoleHwnd, _, _ := procGetConsoleWindow.Call()
	if consoleHwnd != 0 {
		procShowWindow.Call(consoleHwnd, SW_HIDE)
	}

	// 1. Garantir Instância Única Soberana
	// Verifica se a porta 4004 já está em uso por outra instância
	testConn, testErr := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", options.Port), 500*time.Millisecond)
	if testErr == nil {
		testConn.Close()
		appendLog("Found existing instance on port 4004")
		targetClass := utf16Ptr("AniriumServiceGUIClass")
		existingHwnd, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(targetClass)), 0)
		if existingHwnd != 0 && !options.Headless {
			appendLog("Restoring existing window")
			procShowWindow.Call(existingHwnd, SW_RESTORE)
			procShowWindow.Call(existingHwnd, SW_SHOWNORMAL)
			procSetForeground.Call(existingHwnd)
			os.Exit(0)
		}
	}

	// 2. Abre a porta canônica do nó P2P (4004)
	canonicalPort := options.Port

	listener, lErr := listenLocalPlayerHTTP(canonicalPort)
	if lErr != nil {
		appendLog("Local listener unavailable; retrying")
		time.Sleep(1 * time.Second)
		listener, lErr = listenLocalPlayerHTTP(canonicalPort)
		if lErr != nil {
			appendLog("Local listener unavailable")
			if options.Headless {
				fmt.Fprintln(os.Stderr, lErr)
				os.Exit(1)
			}
			os.Exit(0)
		}
	}
	appendLog(fmt.Sprintf("Listening on %s", listener.Addr()))

	selectedPort := listener.Addr().(*net.TCPAddr).Port

	// 3. Inicializa o cliente BitTorrent de streaming
	appendLog("Initializing torrent client...")
	cl, err := initTorrentClientWithOptions(options)
	if err == nil {
		torrentClient = cl
		defer shutdownTorrentClient()
		go startStatsTracker()
		appendLog("Torrent client initialized successfully")
	} else {
		appendLog("Torrent client unavailable")
		if options.Headless {
			listener.Close()
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	if options.Headless {
		json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "listening", "port": selectedPort})
		startHTTPServer(selectedPort, listener)
		return
	}

	// 4. Inicia o servidor HTTP de streaming sequencial em segundo plano
	go func() {
		appendLog("Starting HTTP streaming server...")
		startHTTPServer(selectedPort, listener)
	}()

	// 5. Executa a interface nativa e loop de eventos Win32/Tray na thread principal
	appendLog("Calling initNativeWindow...")
	initNativeWindow(selectedPort)
	appendLog("Main exiting normally")
}
