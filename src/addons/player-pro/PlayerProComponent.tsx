"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Hls from "hls.js";
import { preferredAudio, preferredSubtitle, nextKnownEpisode, shouldSkipIntro, finalEpisodeEnd } from "./playbackPreferences";
import { episodeTimeFromProgramDate } from "./episodeClock";
import { fetchPreparedSubtitle } from "./subtitleDelivery";
import { bufferedAhead } from "./bufferAhead";
import { usePlaybackBuffer } from "./usePlaybackBuffer";
import { canStartBufferedPlayback } from "./playbackBuffer";
import { playbackStatusMessage, playbackFailureStatus } from "./playbackStatus";
import { existingSubtitleOptions, nextSubtitleOption } from "./subtitleOptions";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  RefreshCw,
  AlertCircle,
  Subtitles,
  Languages,
  Sliders,
  Wifi,
  WifiOff,
  Check,
  ChevronDown,
  Folder,
  Link2,
  ExternalLink,
  ShieldCheck,
  Download,
  Volume2,
  Volume1,
  VolumeX,
} from "lucide-react";
import { AniriumPlayerProps } from "@/lib/extensions/types";

/**
 * Anirium Player Pro Component (O Reprodutor Soberano & Ponte de Mídia)
 *
 * Arquitetura Canônica:
 * 1. O Core delega o slot ao Player Pro.
 * 2. O Player Pro detecta a API do Anirium+ Service local na porta 4004.
 * 3. Exibe apenas opções reais entregues pelo manifesto do serviço:
 *    - Multi-Quality (1080p, 720p, 480p)
 *    - Multi-Dub (Áudio Original Japonês, Dublado PT-BR, etc.)
 *    - Multi-Sub (Legendas sincronizadas em VTT/Overlay)
 */
export default function PlayerProComponent({
  anime,
  preferences,
  initialEpisode,
  initialSeasonIdx,
  onBack,
  onOpenOverview,
  onOpenFranchise,
  onProgress,
  onChangeEpisode,
}: AniriumPlayerProps) {
  const preferenceSnapshotRef = useRef(preferences);
  const manualAudioRef = useRef(false);
  const manualSubtitleRef = useRef(false);
  const introEvaluatedRef = useRef(false);
  const advancedEpisodeRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const selectedAudioRef = useRef("");
  const playerSessionRef = useRef("");
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackPositionRef = useRef<{ key: string; time: number; playing: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSavedTimeRef = useRef<number>(0);
	const windowRequestRef = useRef<AbortController | null>(null);
	const windowTargetRef = useRef<{ position: number; playing: boolean } | null>(null);
	const authorizationResumeRef = useRef<{ position: number; playing: boolean } | null>(null);
	const episodeOffsetRef = useRef(0);
	const [windowAttachmentRevision, setWindowAttachmentRevision] = useState(0);
	const [windowPending, setWindowPending] = useState(false);
	const [serviceWindow, setServiceWindow] = useState<{ start: number; quality: string; audio?: string; muxedAudio?: boolean; deliveredDuration: number; episodeDuration: number; endOfEpisode: boolean; playlistUrl: string; continuousPlaylistUrl?: string; timelineStart?: number; audioTracks?: Array<{ language: string; status: string; processingFailed?: boolean }> } | null>(null);

  const [volume, setVolume] = useState<number>(100); // 0% a 150%
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState("");
  const [showVolumeSlider, setShowVolumeSlider] = useState<boolean>(false);

  // Tamanho e Configuração das Legendas (Pequena, Média, Grande, Gigante)
  const [subtitleSize, setSubtitleSize] = useState<"sm" | "md" | "lg" | "xl">("md");
  const [showSubSettings, setShowSubSettings] = useState<boolean>(false);
  const [parsedCues, setParsedCues] = useState<{ start: number; end: number; text: string }[]>([]);
  const [currentCueText, setCurrentCueText] = useState<string>("");
  const [subtitleLoadStatus, setSubtitleLoadStatus] = useState("off");
  const [subtitleRetry, setSubtitleRetry] = useState(0);
  const [subtitleCoverageEnd, setSubtitleCoverageEnd] = useState(0);
	const [subtitleManualRequired, setSubtitleManualRequired] = useState(false);
	const [subtitleDelay, setSubtitleDelay] = useState(0);
  const playbackIntentRef = useRef(true);

  const seasonsList = useMemo(() => {
    if (anime?.seasons && anime.seasons.length > 0) {
      return anime.seasons;
    }
    return [
      {
        id: anime?.mal_id || 0,
        idMal: anime?.idMal,
        seasonNumber: 1,
        title: anime?.title || "Temporada 1",
        title_english: anime?.title_english,
        format: anime?.format || "TV",
        episodes: anime?.episodes ?? null,
        status: anime?.status || "UNKNOWN",
        year: anime?.year,
        cover: anime?.images?.webp?.large_image_url || anime?.images?.jpg?.large_image_url || "",
      },
    ];
  }, [anime]);

  const [currentSeasonIdx, setCurrentSeasonIdx] = useState<number>(initialSeasonIdx || 0);
  const [currentEp, setCurrentEp] = useState<number>(initialEpisode || 1);

  // Sincroniza estado interno caso o usuário navegue ou mude de episódio externamente
  useEffect(() => {
    if (initialEpisode && initialEpisode !== currentEp) {
      setCurrentEp(initialEpisode);
    }
  }, [initialEpisode]);

  useEffect(() => {
    if (initialSeasonIdx !== undefined && initialSeasonIdx !== currentSeasonIdx) {
      setCurrentSeasonIdx(initialSeasonIdx);
    }
  }, [initialSeasonIdx]);

  const currentSeason = seasonsList[currentSeasonIdx] || seasonsList[0];
  const totalEpisodes = currentSeason?.episodes ?? null;

  // 1. Detecção do Anirium+ Service (Nó Local / LAN na porta 4001)
  const [serviceEndpoint, setServiceEndpoint] = useState<string>("http://localhost:4004");
  const [isServiceOnline, setIsServiceOnline] = useState<boolean>(false);
  const [isDetectingService, setIsDetectingService] = useState<boolean>(true);
  const [deviceId, setDeviceId] = useState<string>("");
  const [serviceToken, setServiceToken] = useState<string>("");
  const [playbackTicket, setPlaybackTicket] = useState<string>("");
  const [serviceStatus, setServiceStatus] = useState<string>("offline");
  const [serviceManifest, setServiceManifest] = useState<{
	 windowOnDemand?: boolean;
	 continuousBuffer?: boolean;
	 episodeDuration?: number;
	qualityOnDemand?: boolean;
    qualities: string[];
    audios: string[];
	 audioChoices?: string[];
    audioTracks?: Array<{ id: string; language: string; status: string; processingFailed?: boolean }>;
    subtitles: string[];
    subtitleTracks?: Array<{ id: string; language: string; title?: string }>;
    variants: Array<{ quality: string; playlistUrl?: string; status: string; processingFailed?: boolean }>;
  } | null>(null);

  // 2. Opções de vídeo, áudio e legendas declaradas pelo manifesto do Service.
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(true);

  // Seleções ativas de mídia (estilo Netflix/YouTube)
  const [selectedQuality, setSelectedQuality] = useState<string>("");
  const [qualityRequestRevision, setQualityRequestRevision] = useState(0);
  const [selectedAudio, setSelectedAudio] = useState<string>("");
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>("");
  const [subtitleOption, setSubtitleOption] = useState(0);

  // Menus flutuantes estilo streaming nobre
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);
  const [showSubMenu, setShowSubMenu] = useState<boolean>(false);

  // Estados de Reprodução
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [decoderPlaying, setDecoderPlaying] = useState(false);
	const completedPositionRef = useRef<number | null>(null);
	const [playbackEnded, setPlaybackEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [downloadedPercent, setDownloadedPercent] = useState<number>(0);
  const [bufferAheadSeconds, setBufferAheadSeconds] = useState(0);

  // Mídia independente: arquivo local ou link HTTP direto.
  const [customMediaSrc, setCustomMediaSrc] = useState<string>("");
  const [customLinkInput, setCustomLinkInput] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Telemetria ao vivo do Anirium Service (/stats) — substitui contagem estática do scraper
  const [livePeers, setLivePeers] = useState<number | null>(null);
  const [liveDownloadRate, setLiveDownloadRate] = useState<string>("");
  const [liveUploadRate, setLiveUploadRate] = useState<string>("");
  const [liveTotalDownloaded, setLiveTotalDownloaded] = useState<string>("");
  const [liveTotalUploaded, setLiveTotalUploaded] = useState<string>("");

  useEffect(() => {
    const storageKey = "anirium.device.id";
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    if (!playerSessionRef.current) playerSessionRef.current = crypto.randomUUID();
    const existing = window.localStorage.getItem(storageKey) || crypto.randomUUID();
    window.localStorage.setItem(storageKey, existing);
    setDeviceId(existing);
    const release = () => {
      void fetch("/api/service/session", { method: "DELETE", keepalive: true,
        headers: { "x-anirium-device": existing, "x-anirium-player-session": playerSessionRef.current } }).catch(() => {});
    };
    const handlePageHide = (event: PageTransitionEvent) => {
      // A cached page keeps the same Player instance when restored. Its lease
      // may expire while suspended, but must not be permanently tombstoned.
      if (!event.persisted) release();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      // React development replay remounts effects immediately. Do not revoke
      // the same live instance during that replay.
      releaseTimerRef.current = setTimeout(release, 0);
    };
  }, []);

  // 1. Detectar nó local Anirium+ Service (sonda portas candidatas periodicamente)
  useEffect(() => {
    let isMounted = true;
    const candidatePorts = [4004];

    async function probePort(port: number): Promise<string | null> {
      const hosts = ["127.0.0.1", "localhost"];
      for (const host of hosts) {
        try {
          const res = await fetch(`http://${host}:${port}/health`, {
            mode: "cors",
            signal: AbortSignal.timeout(1200),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            // Exige estritamente o executável nativo do Anirium Service rodando localmente
            if (
              data.isNative === true ||
              data.engine === "anirium-native-torrent" ||
              (data.status === "online" && data.service === "Anirium Player Pro Torrent Node")
            ) {
              return `http://${host}:${port}`;
            }
          }
        } catch {
          // Ignora erros de conexão ao sondar portas
        }
      }
      return null;
    }

    async function checkService() {
      for (const port of candidatePorts) {
        if (!isMounted) return;
        const endpoint = await probePort(port);
        if (endpoint && isMounted) {
          setIsServiceOnline(true);
          setServiceEndpoint(endpoint);
          setIsDetectingService(false);
          return;
        }
      }
      if (isMounted) {
        setIsServiceOnline(false);
        setIsDetectingService(false);
      }
    }

    checkService();
    // Polling a cada 3 segundos para detecção automática instantânea assim que o usuário abrir o .exe
    const interval = setInterval(checkService, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 2. O Player pede uma sessão ao Core e contexto de episódio ao serviço.
  const preparationRef = useRef<AbortController | null>(null);
  const fetchSources = useCallback(async () => {
    preparationRef.current?.abort();
    const controller = new AbortController();
    preparationRef.current = controller;
    const isCurrent = () => preparationRef.current === controller && !controller.signal.aborted;
    setIsLoadingSources(true);
    setPlaybackTicket("");
    setServiceManifest(null);
    setServiceToken("");
    try {
      if (!isServiceOnline || !deviceId) { setServiceStatus("service-offline"); return; }
      const session = await fetch("/api/service/session", { headers: { "x-anirium-device": deviceId, "x-anirium-player-session": playerSessionRef.current }, cache: "no-store", signal: controller.signal });
      const sessionData = await session.json();
      if (!isCurrent()) return;
      if (!session.ok || sessionData.status !== "authorized" || typeof sessionData.token !== "string" || !sessionData.token) {
        setServiceStatus(playbackFailureStatus(sessionData, session.status));
        setServiceToken("");
        return;
      }
      setServiceStatus("authorized");
      setServiceToken(sessionData.token);
      const prepared = await fetch(`${serviceEndpoint}/playback/prepare`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: sessionData.token,
          deviceId,
          title: currentSeason.title || anime.title || anime.title_english || "",
          titleEnglish: currentSeason.title_english || "",
          titleRomaji: currentSeason.title || anime.title || "",
          season: currentSeason.seasonNumber || 1,
          episode: currentEp,
		  malId: currentSeason.idMal || 0,
		  episodeCount: currentSeason.episodes || 0,
		  format: currentSeason.format || "",
        }),
      });
      const data = await prepared.json();
      if (!isCurrent()) return;
      if (!prepared.ok) { setPlaybackTicket(""); setServiceToken(""); setServiceStatus(playbackFailureStatus(data, prepared.status)); }
      else if (data.sources === 0 || data.status === "no-sources") { setServiceToken(""); setServiceStatus("no-sources"); }
      else if (typeof data.playbackTicket === "string" && data.playbackTicket) { setPlaybackTicket(data.playbackTicket); setServiceStatus("preparing"); }
      else { setServiceToken(""); setServiceStatus("service-error"); }
    } catch (e) {
      if (!isCurrent()) return;
      console.warn("[PlayerPro][Service] Falha ao preparar reprodução");
      // The independent health probe owns connectivity; a preparation error
      // may be an invalid response or authorization failure, not an offline node.
      setServiceStatus("service-error");
    } finally {
      if (isCurrent()) setIsLoadingSources(false);
    }
  }, [anime, currentEp, currentSeason, deviceId, isServiceOnline, serviceEndpoint]);

  const retryAuthorization = useCallback(() => {
    authorizationResumeRef.current = { position: currentTime, playing: playbackIntentRef.current };
    void fetchSources();
  }, [currentTime, fetchSources]);

  useEffect(() => {
    if (!playbackTicket || !isServiceOnline || !deviceId) return;
    let active = true;
    const controller = new AbortController();
    let renewing = false;
    const reject = (status: string) => {
      if (active) {
        console.warn("[PlayerPro][Sessão] Renovação rejeitada", { status });
        setServiceStatus(status); setServiceManifest(null); setPlaybackTicket(""); setServiceToken("");
      }
    };
    const renew = async () => {
      if (!active || renewing) return;
      renewing = true;
      let stage = "core-session";
      let httpStatus: number | null = null;
      try {
        const session = await fetch("/api/service/session", { signal: controller.signal, cache: "no-store", headers: { "x-anirium-device": deviceId, "x-anirium-player-session": playerSessionRef.current } });
        httpStatus = session.status;
        const data = await session.json();
        if (!active) return;
        if (!session.ok || data.status !== "authorized" || typeof data.token !== "string" || !data.token) { reject(playbackFailureStatus(data, session.status)); return; }
        stage = "service-renew";
        httpStatus = null;
        const response = await fetch(`${serviceEndpoint}/playback/renew`, {
          signal: controller.signal,
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playbackTicket, token: data.token, deviceId }),
        });
        httpStatus = response.status;
        if (!response.ok) { reject(playbackFailureStatus(await response.json().catch(() => ({})), response.status)); return; }
        if (active) {
          setServiceToken(data.token);
          console.info("[PlayerPro][Sessão] Renovação confirmada", { status: response.status });
        }
      } catch (failure) {
        if (active) console.warn("[PlayerPro][Sessão] Falha de renovação", { stage, httpStatus, category: failure instanceof Error && failure.name === "AbortError" ? "aborted" : failure instanceof SyntaxError ? "invalid-json" : "transport" });
        reject("core_unavailable");
      } finally { renewing = false; }
    };
    const timer = setInterval(renew, 120000);
    const onVisible = () => { if (document.visibilityState === "visible") void renew(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [playbackTicket, isServiceOnline, deviceId, serviceEndpoint]);

  // Reseta mídias customizadas ao trocar de episódio ou temporada
  useEffect(() => {
    authorizationResumeRef.current = null;
    // Preferences apply to a new episode; live manual selections take priority.
    preferenceSnapshotRef.current = preferences;
    manualAudioRef.current = false; manualSubtitleRef.current = false;
    introEvaluatedRef.current = false;
    advancedEpisodeRef.current = null;
    setSelectedAudio(""); setSelectedSubtitle("");
    setCustomMediaSrc("");
    setCustomLinkInput("");
    setShowCustomInput(false);
  }, [anime.mal_id, currentEp, currentSeasonIdx]);

  useEffect(() => {
    if (customMediaSrc) {
      preparationRef.current?.abort();
      setPlaybackTicket("");
      setServiceToken("");
      setServiceManifest(null);
      setIsLoadingSources(false);
      return;
    }
    fetchSources();
    return () => preparationRef.current?.abort();
  }, [fetchSources, isServiceOnline, customMediaSrc]);

  useEffect(() => {
    if (!isServiceOnline || !serviceToken || !deviceId || !playbackTicket) {
      setServiceManifest(null);
      return;
    }
    let mounted = true;
    const controller = new AbortController();
    let loading = false;
    const loadManifest = async () => {
      if (!mounted || loading) return;
      loading = true;
      try {
        const response = await fetch(`${serviceEndpoint}/manifest`, { signal: controller.signal, cache: "no-store",
          headers: { Authorization: `Bearer ${serviceToken}`, "X-Anirium-Device": deviceId } });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          if (mounted) {
            const status = playbackFailureStatus(failure, response.status);
            console.warn("[PlayerPro][Service] Manifesto rejeitado", { httpStatus: response.status, status });
            setServiceManifest(null); setServiceStatus(status); setPlaybackTicket(""); setServiceToken("");
          }
          return;
        }
        if (!response.ok) throw new Error("Manifest unavailable");
        const manifest = await response.json();
        if (mounted && ["ready", "preparing", "stalled"].includes(manifest.status)) {
          setServiceManifest({
			 windowOnDemand: manifest.windowOnDemand === true,
			 continuousBuffer: manifest.continuousBuffer === true,
			 episodeDuration: Number.isFinite(manifest.episodeDuration) && manifest.episodeDuration > 0 ? manifest.episodeDuration : 0,
            qualityOnDemand: manifest.qualityOnDemand === true,
            qualities: Array.isArray(manifest.qualities) ? manifest.qualities : [],
            audios: Array.isArray(manifest.audios) ? manifest.audios : [],
			 audioChoices: Array.isArray(manifest.audioChoices) ? manifest.audioChoices.filter((language: unknown) => typeof language === "string" && language.length > 0 && language.length <= 32) : undefined,
            audioTracks: Array.isArray(manifest.audioTracks) ? manifest.audioTracks : [],
            subtitles: Array.isArray(manifest.subtitles) ? manifest.subtitles : [],
            subtitleTracks: Array.isArray(manifest.subtitleTracks) ? manifest.subtitleTracks.filter((track: { id?: unknown; language?: unknown }) => typeof track.id === "string" && typeof track.language === "string") : [],
            variants: Array.isArray(manifest.variants) ? manifest.variants : [],
          });
          setServiceStatus(manifest.status);
        }
      } catch (error) {
        if (mounted) {
          console.warn("[PlayerPro][Service] Falha ao obter manifesto");
          setServiceManifest(null);
          setPlaybackTicket("");
          setServiceToken("");
          setServiceStatus("service-error");
        }
      } finally { loading = false; }
    };
    loadManifest();
    const interval = setInterval(loadManifest, 2500);
    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [isServiceOnline, serviceEndpoint, serviceToken, deviceId, playbackTicket]);

  const manifestDiagnosticRef = useRef("");
  useEffect(() => {
    if (!serviceManifest) return;
    const diagnostic = {
      status: serviceStatus,
      windowOnDemand: serviceManifest.windowOnDemand,
      qualities: serviceManifest.qualities,
      audioTracks: (serviceManifest.audioTracks || []).map(track => ({ language: track.language, status: track.status })),
      subtitleTracks: (serviceManifest.subtitleTracks || []).map(track => ({ language: track.language })),
    };
    const signature = JSON.stringify(diagnostic);
    if (signature === manifestDiagnosticRef.current) return;
    manifestDiagnosticRef.current = signature;
    console.info("[PlayerPro][Service] Manifesto atualizado", diagnostic);
  }, [serviceManifest, serviceStatus]);

  // 3. Matriz Unificada de Qualidades Disponíveis (preenchida dinamicamente pelas fontes)
  const availableQualities = useMemo(() => {
    if (customMediaSrc) return [];
    return serviceManifest?.qualities || [];
  }, [serviceManifest, customMediaSrc]);

  // 4. Matriz unificada de áudios existentes no manifesto.
  const availableAudios = useMemo(() => {
    if (customMediaSrc) return [];
	if (serviceManifest?.continuousBuffer) return serviceManifest.audioChoices || serviceManifest.audios || [];
	if (serviceWindow) return (serviceWindow.audioTracks || []).filter(track => track.status === "ready").map(track => track.language);
    return serviceManifest?.audios || [];
  }, [serviceManifest, serviceWindow, customMediaSrc]);

  const existingAudios = useMemo(() => customMediaSrc ? [] : Array.from(new Set([
    ...availableAudios,
    ...(serviceWindow?.audioTracks || serviceManifest?.audioTracks || []).map(track => track.language),
  ])), [availableAudios, serviceManifest, serviceWindow, customMediaSrc]);

  // 5. Matriz unificada de legendas existentes no manifesto.
  const availableSubtitles = useMemo(() => {
    if (customMediaSrc) return ["Desativado"];
    return ["Desativado", ...Array.from(new Set(existingSubtitleOptions(serviceManifest?.subtitleTracks || []).map(track => track.language)))];
  }, [serviceManifest, customMediaSrc]);



  // Efeito para sincronizar as seleções padrão de forma inteligente sem forçar opções inexistentes
  useEffect(() => {
    // As qualidades vêm ordenadas pelo Service; não inventar variantes Auto.
    if (availableQualities.length > 0) {
      if (!selectedQuality || !availableQualities.includes(selectedQuality)) {
        setSelectedQuality(availableQualities[0]);
      }
    }

    const audio = preferredAudio(availableAudios, preferenceSnapshotRef.current?.preferredAudio);
    if (audio && ((!manualAudioRef.current && selectedAudio !== audio) || !availableAudios.includes(selectedAudio))) setSelectedAudio(audio);
    const subtitle = preferredSubtitle(availableSubtitles, preferenceSnapshotRef.current?.preferredSubtitles);
    if (subtitle && ((!manualSubtitleRef.current && selectedSubtitle !== subtitle) || !availableSubtitles.includes(selectedSubtitle))) setSelectedSubtitle(subtitle);
  }, [availableQualities, availableAudios, availableSubtitles, selectedQuality, selectedAudio, selectedSubtitle]);

  // 7. Resolução da URL de Streaming de Vídeo
	const sessionChoicesRef = useRef({ audio: "", subtitle: "" });
	const sessionSubtitleOptions = existingSubtitleOptions(serviceManifest?.subtitleTracks || [], selectedSubtitle);
	sessionChoicesRef.current = { audio: selectedAudio, subtitle: sessionSubtitleOptions[subtitleOption % Math.max(1, sessionSubtitleOptions.length)]?.id || "" };
	const requestServiceWindow = useCallback(async (position: number, quality: string, playing: boolean) => {
		completedPositionRef.current = null;
		setPlaybackEnded(false);
		if (!playbackTicket || !isServiceOnline || customMediaSrc || !Number.isFinite(position) || position < 0) return;
		windowRequestRef.current?.abort();
		const controller = new AbortController();
		windowRequestRef.current = controller;
		windowTargetRef.current = { position, playing };
		playbackIntentRef.current = playing;
		setWindowPending(true);
		// The Service retires the old queue when seeking. Stop its network
		// loader before requesting replacement media; keep the decoder paused.
		hlsRef.current?.stopLoad();
		videoRef.current?.pause();
		setDecoderPlaying(false);
		setIsPlaying(playing);
		setPlaybackError("");
		const started = performance.now();
		let timedOut = false;
		const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
		console.info("[PlayerPro][Trecho] Solicitando", JSON.stringify({ position, quality }));
		const sessionURL = `${serviceEndpoint}/playback/session?playbackTicket=${encodeURIComponent(playbackTicket)}`;
		try {
			let response = await fetch(sessionURL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seek", quality, position, playing, ...sessionChoicesRef.current }), signal: controller.signal });
			const deadline = Date.now() + 120000;
			for (;;) {
				if (!response.ok) throw new Error(response.status === 401 ? "A sessão expirou. Reabra o episódio." : "O Service não conseguiu preparar este trecho.");
				const { window } = await response.json();
				if (controller.signal.aborted) return;
				if (window.quality !== quality || window.start !== Math.floor(position / 4) * 4) throw new Error("O Service respondeu com outro trecho.");
				if (window.status === "ready") {
					if (window.continuousPlaylistUrl !== undefined && (!/^\/hls\/window-\d+-\d+-video\/continuous-master\.m3u8$/.test(window.continuousPlaylistUrl) || !Number.isFinite(window.timelineStart) || window.timelineStart < 0 || window.timelineStart > window.start)) throw new Error("Timeline contínua inválida entregue pelo Service.");
					if (!/^\/hls\/window-[\w-]+\/master\.m3u8$/.test(window.playlistUrl) || !Number.isFinite(window.deliveredDuration) || window.deliveredDuration <= 0 || !Array.isArray(window.audioTracks) || window.audioTracks.some((track: { language?: unknown; status?: unknown }) => !track || typeof track.language !== "string" || typeof track.status !== "string")) throw new Error("Trecho inválido entregue pelo Service.");
					setServiceWindow(window);
					setWindowAttachmentRevision(revision => revision + 1);
					console.info("[PlayerPro][Trecho] Disponível", JSON.stringify({ position, quality, deliveredDuration: window.deliveredDuration, elapsedMs: Math.round(performance.now() - started) }));
					return;
				}
				if (window.status !== "preparing" || Date.now() >= deadline) throw new Error("Este trecho está indisponível. Tente novamente.");
				await new Promise<void>((resolve, reject) => {
					const aborted = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
					const timer = setTimeout(() => { controller.signal.removeEventListener("abort", aborted); resolve(); }, 500);
					controller.signal.addEventListener("abort", aborted, { once: true });
				});
				response = await fetch(sessionURL, { signal: controller.signal, cache: "no-store" });
			}
		} catch (error) {
			if (windowRequestRef.current === controller && (timedOut || !controller.signal.aborted)) {
				setPlaybackError(timedOut ? "Tempo esgotado aguardando este trecho. Tente novamente." : error instanceof Error ? error.message : "Não foi possível solicitar o trecho.");
				console.warn("[PlayerPro][Trecho] Indisponível", JSON.stringify({ position, quality, timedOut, elapsedMs: Math.round(performance.now() - started) }));
			}
		} finally {
			clearTimeout(timeout);
			if (windowRequestRef.current === controller) {
				windowRequestRef.current = null;
				setWindowPending(false);
			}
		}
	}, [playbackTicket, isServiceOnline, customMediaSrc, serviceEndpoint]);

	useEffect(() => {
		windowRequestRef.current?.abort();
		setServiceWindow(null);
		setWindowPending(false);
		windowTargetRef.current = playbackTicket && !customMediaSrc ? authorizationResumeRef.current : null;
		if (playbackTicket && !customMediaSrc) authorizationResumeRef.current = null;
		episodeOffsetRef.current = 0;
		return () => { windowRequestRef.current?.abort(); };
	}, [playbackTicket, customMediaSrc]);

	useEffect(() => {
		if (serviceWindow && selectedQuality && (serviceWindow.quality !== selectedQuality || (serviceWindow.muxedAudio && selectedAudio && serviceWindow.audio !== selectedAudio))) {
			const target = windowTargetRef.current;
			void requestServiceWindow(target?.position ?? currentTime, selectedQuality, target?.playing ?? isPlaying);
		}
	}, [selectedQuality, selectedAudio]);

	// Legacy window delivery requests its immediate successor. Continuous
	// sessions let the Service scheduler own preparation and promotion.
	useEffect(() => {
		if (serviceManifest?.continuousBuffer || !serviceWindow || serviceWindow.endOfEpisode || !playbackTicket || customMediaSrc || !isServiceOnline) return;
		const controller = new AbortController();
		const query = new URLSearchParams({ quality: serviceWindow.quality,
			position: String(serviceWindow.start + serviceWindow.deliveredDuration),
			playbackTicket, mode: "prefetch" });
		const started = performance.now();
		void fetch(`${serviceEndpoint}/playback/window?${query}`, { method: "POST", signal: controller.signal }).then(response => {
			if (controller.signal.aborted) return;
			// Acceptance means the job was scheduled, not that its media is ready.
			console.info("[PlayerPro][Pré-buffer] Resposta do Service", JSON.stringify({
				position: serviceWindow.start + serviceWindow.deliveredDuration,
				quality: serviceWindow.quality, status: response.status,
				accepted: response.ok, elapsedMs: Math.round(performance.now() - started),
			}));
		}).catch(() => {
			if (!controller.signal.aborted) console.info("[PlayerPro][Pré-buffer] Solicitação não confirmada");
			// Continuation owns the visible error; do not interrupt active media.
		});
		return () => controller.abort();
	}, [serviceWindow, playbackTicket, customMediaSrc, isServiceOnline, serviceEndpoint, serviceManifest?.continuousBuffer]);

  useEffect(() => {
    if (serviceWindow || !serviceManifest?.qualityOnDemand || !selectedQuality || !playbackTicket || !isServiceOnline || customMediaSrc) return;
    if (serviceManifest.windowOnDemand) {
      void requestServiceWindow(windowTargetRef.current?.position ?? 0, selectedQuality, windowTargetRef.current?.playing ?? true);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ quality: selectedQuality, playbackTicket });
    void fetch(`${serviceEndpoint}/playback/variant?${query}`, {
      method: "POST", signal: controller.signal,
    }).then(response => {
      if (controller.signal.aborted) return;
      if (response.status === 401) {
        setServiceStatus("session-expired");
        setServiceManifest(null);
        setPlaybackTicket("");
        setServiceToken("");
      }
      else if (!response.ok) setPlaybackError("O Service não conseguiu preparar a qualidade solicitada. Verifique se ele está atualizado.");
    }).catch(() => {
      if (!controller.signal.aborted) setPlaybackError("Não foi possível solicitar esta qualidade ao Service.");
    });
    return () => controller.abort();
  }, [serviceManifest?.qualityOnDemand, serviceManifest?.windowOnDemand, selectedQuality, qualityRequestRevision, playbackTicket, isServiceOnline, serviceEndpoint, customMediaSrc, requestServiceWindow]);

  const jointBuffer = usePlaybackBuffer({
    enabled: serviceManifest?.continuousBuffer === true && isServiceOnline && !!serviceWindow && !customMediaSrc && !windowPending && !playbackEnded,
    endpoint: serviceEndpoint, ticket: playbackTicket, timeline: serviceWindow?.continuousPlaylistUrl?.replace('continuous-master.m3u8', 'master.m3u8') || serviceWindow?.playlistUrl || "",
    position: windowTargetRef.current?.position ?? currentTime, playing: playbackIntentRef.current, audio: selectedAudio,
    subtitle: existingSubtitleOptions(serviceManifest?.subtitleTracks || [], selectedSubtitle)[subtitleOption % Math.max(1, existingSubtitleOptions(serviceManifest?.subtitleTracks || [], selectedSubtitle).length)]?.id || "",
  });

  const streamSrc = useMemo(() => {
    if (customMediaSrc) return customMediaSrc;
	if (serviceManifest?.continuousBuffer) return serviceWindow?.continuousPlaylistUrl && /^\/hls\/window-\d+-\d+-video\/continuous-master\.m3u8$/.test(serviceWindow.continuousPlaylistUrl) && playbackTicket && isServiceOnline ? `${serviceEndpoint}${serviceWindow.continuousPlaylistUrl}?playbackTicket=${encodeURIComponent(playbackTicket)}&attachmentRevision=${windowAttachmentRevision}` : "";
	if (serviceWindow && playbackTicket && isServiceOnline) return `${serviceEndpoint}${serviceWindow.playlistUrl}?playbackTicket=${encodeURIComponent(playbackTicket)}&attachmentRevision=${windowAttachmentRevision}`;
    const readyVariant = serviceManifest?.variants.find((variant) =>
      variant.quality === selectedQuality && variant.status === "ready" && variant.playlistUrl
    );
    if (readyVariant?.playlistUrl && isServiceOnline) {
      if (!playbackTicket) return "";
      return `${serviceEndpoint}${readyVariant.playlistUrl}?playbackTicket=${encodeURIComponent(playbackTicket)}&audioRevision=${encodeURIComponent((serviceManifest?.audios || []).join(","))}`;
    }

    if (serviceManifest && isServiceOnline && !customMediaSrc) return "";

    // Modo independente do serviço: arquivo local ou link HTTP direto.
    if (customMediaSrc) return customMediaSrc;
    return "";
  }, [customMediaSrc, isServiceOnline, serviceEndpoint, serviceManifest, selectedQuality, playbackTicket, serviceWindow, windowAttachmentRevision, jointBuffer.state?.playlistUrl]);

  useEffect(() => {
    const video = videoRef.current;
    setPlaybackError("");
    setBufferAheadSeconds(0);
    setDownloadedPercent(0);
    if (!video || !streamSrc) return;
    const sourceKey = customMediaSrc || playbackTicket;
	completedPositionRef.current = null;
	setPlaybackEnded(false);
    const previous = playbackPositionRef.current;
    const restorePosition = () => {
		const origin = video.seekable.length > 0 ? video.seekable.start(0) : 0;
		episodeOffsetRef.current = serviceWindow ? (serviceManifest?.continuousBuffer ? serviceWindow.timelineStart ?? serviceWindow.start : serviceWindow.start) - origin : 0;
		const target = windowTargetRef.current;
		if (serviceWindow && target) {
			video.currentTime = Math.max(origin, target.position - episodeOffsetRef.current);
			setDuration(serviceWindow.episodeDuration || serviceManifest?.episodeDuration || serviceWindow.start + serviceWindow.deliveredDuration);
			if (target.playing && !serviceManifest?.continuousBuffer) video.play().catch(() => {});
			else video.pause();
			return;
		}
      if (previous?.key === sourceKey && previous.time > 0) {
        video.currentTime = Math.min(previous.time, Number.isFinite(video.duration) ? video.duration : previous.time);
        if (previous.playing && !serviceManifest?.continuousBuffer) video.play().catch(() => {});
        else video.pause();
      }
    };
    video.addEventListener("loadedmetadata", restorePosition, { once: true });
    let hls: Hls | undefined;
    const isPlaylist = /\.m3u8(?:[?#]|$)/i.test(streamSrc);
    if (isPlaylist && Hls.isSupported()) {
      hls = new Hls(serviceManifest?.continuousBuffer ? { startPosition: 0, maxBufferLength: 60, maxMaxBufferLength: 120, backBufferLength: 48 } : {});
      hlsRef.current = hls;
      const applyAudioSelection = () => {
        const index = hls?.audioTracks.findIndex(track => track.lang === selectedAudioRef.current) ?? -1;
        if (hls && index >= 0) hls.audioTrack = index;
      };
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, applyAudioSelection);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
		  // An already dispatched request can race with stopLoad. Replacement
		  // failures are reported by the owned window request, not the old loader.
		  if (windowRequestRef.current) return;
          setPlaybackError("Não foi possível reproduzir a fila de buffer. Verifique o Service e a sessão.");
          // Terminal diagnostic only: no URLs, tokens, reasons or raw errors.
          console.warn("[PlayerPro][HLS] Falha terminal", JSON.stringify({ type: data.type, details: data.details, status: data.response?.code ?? null, position: video.currentTime, paused: video.paused, readyState: video.readyState, fragment: data.frag?.sn ?? null, buffered: Array.from({ length: video.buffered.length }, (_, i) => [video.buffered.start(i), video.buffered.end(i)]) }));
          hls?.destroy();
        }
      });
      hls.loadSource(streamSrc);
      hls.attachMedia(video);
    } else if (!isPlaylist || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamSrc;
    } else {
      setPlaybackError("Este navegador não oferece suporte à reprodução HLS.");
    }
    return () => {
      playbackPositionRef.current = { key: sourceKey, time: readEpisodeTime(), playing: !video.paused };
      video.removeEventListener("loadedmetadata", restorePosition);
      hls?.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [streamSrc]);

  useEffect(() => {
    selectedAudioRef.current = selectedAudio;
    const hls = hlsRef.current;
    const index = hls?.audioTracks.findIndex(track => track.lang === selectedAudio) ?? -1;
    if (hls && index >= 0) hls.audioTrack = index;
  }, [selectedAudio]);

  // URL da legenda selecionada sincronizada com o manifesto do serviço.
  const subtitleSrc = useMemo(() => {
    if (!selectedSubtitle || selectedSubtitle === "Desativado" || !isServiceOnline || !playbackTicket) return "";
    const tracks = existingSubtitleOptions(serviceManifest?.subtitleTracks || [], selectedSubtitle);
    if (!tracks.length || customMediaSrc) return "";
    const track = tracks[subtitleOption % tracks.length];
    // A selected subtitle belongs to the whole episode. Seeking must not
    // replace it with another partial extraction or discard already loaded cues.
    return `${serviceEndpoint}/subtitles?trackId=${encodeURIComponent(track.id)}&playbackTicket=${encodeURIComponent(playbackTicket)}`;
  }, [selectedSubtitle, subtitleOption, serviceManifest, customMediaSrc, isServiceOnline, serviceEndpoint, playbackTicket]);

  useEffect(() => {
    if (!serviceManifest?.continuousBuffer || customMediaSrc || !videoRef.current) return;
    const ready = jointBuffer.state && canStartBufferedPlayback(jointBuffer.state, bufferAheadSeconds, Math.max(0, subtitleCoverageEnd - currentTime), currentTime, decoderPlaying);
    if (playbackIntentRef.current && ready) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [serviceManifest?.continuousBuffer, customMediaSrc, jointBuffer.state, bufferAheadSeconds, subtitleCoverageEnd, currentTime, isPlaying, decoderPlaying]);

  useEffect(() => {
    // A later video fallback can invalidate the alignment of an already loaded
    // embedded track. Preserve the complete subtitle and expose manual timing.
    if (jointBuffer.state?.subtitleUnverified === true) setSubtitleManualRequired(true);
  }, [jointBuffer.state]);


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomMediaSrc(url);
      setShowCustomInput(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (customMediaSrc.startsWith("blob:")) URL.revokeObjectURL(customMediaSrc);
    };
  }, [customMediaSrc]);

  const handleApplyCustomLink = () => {
    const trimmed = customLinkInput.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      setCustomMediaSrc(trimmed);
      setShowCustomInput(false);
    }
  };

  const loadedSubtitleTrackRef = useRef("");
  // Sincronização e Parse de Legendas VTT / SRT em Memória
  useEffect(() => {
    if (!subtitleSrc) {
      setSubtitleCoverageEnd(0);
      loadedSubtitleTrackRef.current = "";
      setSubtitleLoadStatus("off");
      console.info("[PlayerPro][Legendas] Nenhuma faixa solicitada");
      setParsedCues([]);
      setCurrentCueText("");
      return;
    }

    let isMounted = true;
    setSubtitleLoadStatus("loading");
    const controller = new AbortController();
    // Never log the request URL: it carries the playback credential.
    const trackId = new URL(subtitleSrc).searchParams.get("trackId");
    const trackKey = `${playbackTicket}:${trackId}`;
    if (loadedSubtitleTrackRef.current !== trackKey) {
      setSubtitleCoverageEnd(0);
      setParsedCues([]);
      setCurrentCueText("");
      loadedSubtitleTrackRef.current = trackKey;
    }
    const started = performance.now();
    const requestedWindow = new URL(subtitleSrc).searchParams.get("start");
    const subtitleDeadline = setTimeout(() => {
      if (!isMounted) return;
      setSubtitleLoadStatus("timeout");
      console.warn("[PlayerPro][Legendas] Tempo limite de resposta do Service", { elapsedMs: Math.round(performance.now() - started) });
      controller.abort();
    }, 15 * 60 * 1000 + 30000);
    console.info("[PlayerPro][Legendas] Solicitando faixa ao Service", JSON.stringify({ windowStart: requestedWindow === null ? null : Number(requestedWindow) }));
    const pendingDiagnostic = setTimeout(() => {
      console.info("[PlayerPro][Legendas] Ainda aguardando resposta do Service; geração não confirmada", { elapsedMs: Math.round(performance.now() - started) });
    }, 10000);
    async function loadSubtitles() {
      try {
        const res = await fetchPreparedSubtitle(subtitleSrc, controller.signal);
        if (!isMounted || controller.signal.aborted) return;
        console.info("[PlayerPro][Legendas] Resposta do Service", JSON.stringify({ status: res.status, elapsedMs: Math.round(performance.now() - started) }));
        if (!res.ok) {
          if (isMounted) setSubtitleLoadStatus(`error:${res.status}`);
          console.warn("[PlayerPro][Legendas] Service não entregou a faixa", { status: res.status });
          return;
        }
        const text = await res.text();
        if (!isMounted || controller.signal.aborted) return;
        const responseOffset = Number(res.headers.get("X-Anirium-Subtitle-Offset") || 0);
		setSubtitleManualRequired(res.headers.get("X-Anirium-Subtitle-Alignment") === "unverified");
        const cueOffset = Number.isFinite(responseOffset) && responseOffset >= 0 ? responseOffset : 0;

        // Parser universal de WebVTT / SRT para marcações de tempo e texto
        const cues: { start: number; end: number; text: string }[] = [];
        const parseTimestamp = (t: string): number => {
          const parts = t.trim().split(":");
          if (parts.length === 3) {
            const h = parseFloat(parts[0]);
            const m = parseFloat(parts[1]);
            const s = parseFloat(parts[2].replace(",", "."));
            return h * 3600 + m * 60 + s;
          } else if (parts.length === 2) {
            const m = parseFloat(parts[0]);
            const s = parseFloat(parts[1].replace(",", "."));
            return m * 60 + s;
          }
          return 0;
        };

        const blocks = text.replace(/\r\n|\r/g, "\n").split(/\n\s*\n/);
        for (const block of blocks) {
          const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("-->")) {
              const timeParts = lines[i].split("-->");
              if (timeParts.length === 2) {
                const start = parseTimestamp(timeParts[0]);
                const end = parseTimestamp(timeParts[1]);
                const cueLines = lines.slice(i + 1).filter((l) => !l.startsWith("NOTE") && !l.startsWith("STYLE"));
                const cleanText = cueLines
                  .join("\n")
                  .replace(/<[^>]+>/g, "") // remove HTML/VTT tags
                  .replace(/\{[^}]+\}/g, "") // remove ASS styling
                  .trim();
                if (cleanText && end > start) {
                  cues.push({ start: start + cueOffset, end: end + cueOffset, text: cleanText });
                }
              }
              break;
            }
          }
        }

        setParsedCues(cues);
        setSubtitleCoverageEnd(requestedWindow !== null ? Number(requestedWindow) + 60 : 86400);
        // A valid bounded window can contain no dialogue. It is not a missing
        // language, conversion error or failed subtitle track.
        setSubtitleLoadStatus(cues.length ? "ready" : requestedWindow !== null ? "window-empty" : "empty");
        console.info("[PlayerPro][Legendas] Faixa analisada", JSON.stringify({ characters: text.length, cues: cues.length, firstCueStart: cues[0]?.start ?? null, lastCueEnd: cues.at(-1)?.end ?? null }));
        if (!cues.length && requestedWindow === null) console.warn("[PlayerPro][Legendas] Resposta sem trechos de legenda válidos");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (isMounted) setSubtitleLoadStatus("connection-error");
        console.warn("[PlayerPro][Legendas] Falha de conexão ao carregar faixa");
      } finally {
        clearTimeout(pendingDiagnostic);
        clearTimeout(subtitleDeadline);
      }
    }

    loadSubtitles();
    return () => {
      isMounted = false;
      clearTimeout(pendingDiagnostic);
      clearTimeout(subtitleDeadline);
      if (!controller.signal.aborted) console.info("[PlayerPro][Legendas] Encerrando solicitação da faixa");
      controller.abort();
    };
  }, [subtitleSrc, subtitleRetry, playbackTicket]);

  // Recompute even while paused or immediately after a track finishes loading.
  // Every subtitle language uses the same episode clock, not local HLS time.
  useEffect(() => {
    const subtitleTime = currentTime - subtitleDelay;
    const active = parsedCues.filter(cue => subtitleTime >= cue.start && subtitleTime < cue.end);
    setCurrentCueText(active.map(cue => cue.text).join("\n"));
  }, [parsedCues, currentTime, subtitleDelay]);

	useEffect(() => {
		setSubtitleDelay(0);
		setSubtitleManualRequired(false);
	}, [subtitleSrc]);

  const handleVolumeChange = (newVal: number) => {
    const clamped = Math.max(0, Math.min(100, newVal));
    setVolume(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }

    if (videoRef.current) {
      videoRef.current.volume = clamped / 100;
      if (clamped > 0 && isMuted) {
        videoRef.current.muted = false;
      }
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = volume / 100;
      }
    } else {
      setIsMuted(true);
      if (videoRef.current) {
        videoRef.current.muted = true;
      }
    }
  };

  // Volume e mudo precisam valer também quando o <video> é montado agora (o ref não dispara efeito sozinho).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume / 100;
    video.muted = isMuted;
  }, [volume, isMuted, streamSrc, customMediaSrc, isServiceOnline]);

  const togglePlay = () => {
    if (serviceManifest?.continuousBuffer && !customMediaSrc && completedPositionRef.current !== null) {
      void requestServiceWindow(0, selectedQuality, true);
      return;
    }
    if (!videoRef.current) return;
    if (serviceManifest?.continuousBuffer && !customMediaSrc) {
      playbackIntentRef.current = !playbackIntentRef.current;
      if (windowTargetRef.current) windowTargetRef.current.playing = playbackIntentRef.current;
      setIsPlaying(playbackIntentRef.current);
      if (!playbackIntentRef.current) videoRef.current.pause();
      return;
    }
    const target = windowTargetRef.current;
    if (target) {
      // A paused decoder during preparation is not a request to replay the
      // previous playlist. Change only the intent consumed by restorePosition.
      target.playing = !target.playing;
      setIsPlaying(target.playing);
      return;
    }
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const readEpisodeTime = () => {
	if (completedPositionRef.current !== null) return completedPositionRef.current;
    const video = videoRef.current;
    if (!video) return 0;
    if (serviceManifest?.continuousBuffer && !customMediaSrc) {
      const position = episodeTimeFromProgramDate(hlsRef.current?.playingDate ?? null);
      if (position !== null) {
        episodeOffsetRef.current = position - video.currentTime;
        return position;
      }
    }
    return Math.max(0, video.currentTime + episodeOffsetRef.current);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
	const mediaTime = readEpisodeTime();
	const target = windowTargetRef.current;
	if (target && !windowRequestRef.current && !videoRef.current.seeking && Math.abs(mediaTime - target.position) < 0.2) windowTargetRef.current = null;
	const curr = serviceWindow && !customMediaSrc && !serviceManifest?.continuousBuffer ? Math.min(serviceWindow.start + serviceWindow.deliveredDuration, Math.max(serviceWindow.start, mediaTime)) : mediaTime;
    const dur = customMediaSrc ? videoRef.current.duration || 0 : serviceManifest?.episodeDuration || duration || videoRef.current.duration || 0;
    if (!introEvaluatedRef.current && preferenceSnapshotRef.current?.autoSkipIntro && !customMediaSrc) {
      if (curr >= 5) introEvaluatedRef.current = true; // A resume/manual seek is not an opening.
      else if (playbackIntentRef.current && shouldSkipIntro(true, curr, dur, Boolean(windowRequestRef.current || windowTargetRef.current || videoRef.current.seeking))) {
        introEvaluatedRef.current = true;
        seekTo(85);
        return;
      }
    }
    setCurrentTime(curr);
    handleProgress();

    // Subtitle rendering follows currentTime through its own reactive effect.

    const seasonEntityId = anime.seasons?.[currentSeasonIdx]?.entityId ?? (!anime.seasons?.length && currentSeasonIdx === 0 ? anime.seasonEntityId : undefined);
    if (seasonEntityId && dur > 0 && Math.abs(curr - lastSavedTimeRef.current) >= 10) {
      lastSavedTimeRef.current = curr;
      onProgress?.({
        animeId: anime.mal_id,
        seasonIdx: currentSeasonIdx,
        seasonEntityId,
        episode: currentEp,
        currentTime: curr,
        duration: dur,
        completed: curr / dur > 0.85,
      });
    }
  };

  const handleProgress = () => {
    if (!videoRef.current || !videoRef.current.duration) return;
    if (serviceManifest?.continuousBuffer && !customMediaSrc && !windowTargetRef.current && !windowRequestRef.current) setCurrentTime(readEpisodeTime());
    const b = videoRef.current.buffered;
    const dur = customMediaSrc ? videoRef.current.duration : serviceManifest?.episodeDuration || duration || videoRef.current.duration;
    const ahead = bufferedAhead(b, videoRef.current.currentTime);
    setBufferAheadSeconds(ahead);
    setDownloadedPercent(Number.isFinite(dur) && dur > 0 ? Math.min(100, (ahead / dur) * 100) : 0);
  };

  // The joint-buffer gate holds the decoder paused until it opens, and a
  // paused element fires no timeupdate. Hls.js feeds MSE, where progress
  // events are not guaranteed once the network goes idle. The browser
  // reserve is therefore also refreshed on playback milestones and polled
  // while continuous mode holds the pause, so loaded buffer alone opens
  // the gate.
  const handleProgressRef = useRef(handleProgress);
  handleProgressRef.current = handleProgress;
  useEffect(() => {
    if (!serviceManifest?.continuousBuffer || customMediaSrc) return;
    const interval = setInterval(() => handleProgressRef.current(), 1000);
    return () => clearInterval(interval);
  }, [serviceManifest?.continuousBuffer, customMediaSrc]);

  const seekRelative = (sec: number) => {
    if (!videoRef.current) return;
	const position = windowTargetRef.current?.position ?? readEpisodeTime();
	seekTo(Math.max(0, Math.min(Math.max(0, duration - 0.05), position + sec)));
  };

	const seekTo = (position: number) => {
		const video = videoRef.current;
		if (!video) return;
		if (customMediaSrc) { video.currentTime = position; return; }
		if (!serviceManifest?.windowOnDemand) {
			for (let index = 0; index < video.seekable.length; index++) {
				if (position >= video.seekable.start(index) && position <= video.seekable.end(index)) {
					video.currentTime = position;
					return;
				}
			}
			setPlaybackError("Este trecho ainda não está disponível. Atualize o Service para usar o seek sob demanda.");
			return;
		}
		void requestServiceWindow(position, selectedQuality, windowTargetRef.current?.playing ?? (serviceManifest?.continuousBuffer ? playbackIntentRef.current : !video.paused));
	};

  const switchQuality = (q: string) => {
    if (q === selectedQuality && (playbackError || serviceManifest?.variants.some(variant => variant.quality === q && variant.status === "stalled"))) {
      setPlaybackError("");
	  const target = windowTargetRef.current;
	  if (target || serviceWindow) {
		void requestServiceWindow(target?.position ?? currentTime, q, target?.playing ?? isPlaying);
	  } else {
		setQualityRequestRevision(revision => revision + 1);
	  }
    }
    setSelectedQuality(q);
    setShowQualityMenu(false);
  };

  // Atalhos de Teclado Globais do Player Pro (QoL)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora atalhos se o usuário estiver digitando em um input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case "Space":
        case "KeyK":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekRelative(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekRelative(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          // Padrão máximo pelo teclado é 100%
          handleVolumeChange(Math.min(100, volume + 10));
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 10));
          break;
        case "KeyF":
          e.preventDefault();
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
          } else {
            document.exitFullscreen();
            setIsFullscreen(false);
          }
          break;
        case "KeyM":
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, volume, isMuted, duration, selectedQuality, requestServiceWindow, customMediaSrc, serviceManifest?.windowOnDemand]);

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#0B0B0D] flex flex-col select-none overflow-hidden text-[#FFF9F0]"
    >
      {/* Top Header Bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-[#0B0B0D]/95 via-[#0B0B0D]/60 to-transparent">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1A1A1F]/90 hover:bg-[#23232A] text-[#FFF9F0] border border-[#3A3A43] transition shadow text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4 text-[#FFC766]" />
            <span>Voltar</span>
          </button>

          {/* Breadcrumb Soberano Interligado dos 4 Níveis (Franquia > Obra > Temporada > Episódio) */}
          <div className="flex items-center gap-1.5 text-xs">
            {/* 1. Franquia */}
            <button
              onClick={() => {
                const fRoot = anime.franchise_root || anime.title_english || anime.title;
                if (onOpenFranchise) onOpenFranchise(fRoot);
                else onBack();
              }}
              className="text-[#FFC766] hover:underline font-mono font-bold truncate max-w-[120px] sm:max-w-[160px]"
              title="Abrir Universo/Franquia"
            >
              {anime.franchise_root || anime.title_english || anime.title}
            </button>

            <span className="text-[#3A3A43]">•</span>

            {/* 2. Obra */}
            <button
              onClick={() => {
                if (onOpenOverview) onOpenOverview();
                else onBack();
              }}
              className="text-[#EADCC8] hover:text-[#FFF9F0] truncate max-w-[130px] sm:max-w-[180px] font-semibold"
              title="Voltar à Visão Geral da Obra"
            >
              {currentSeason.title_english || currentSeason.title || anime.title}
            </button>

            <span className="text-[#3A3A43] hidden sm:inline">•</span>

            {/* 3. Temporada */}
            <button
              onClick={onBack}
              className="hidden sm:inline-block text-[#38BDF8] hover:underline font-mono text-[11px]"
              title="Ver grade de episódios da temporada"
            >
              T#{currentSeason.seasonNumber}
            </button>

            <span className="text-[#3A3A43] hidden sm:inline">•</span>

            {/* 4. Episódio Ativo */}
            <span className="px-2 py-0.5 rounded-full bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/40 font-mono text-[11px] font-bold">
              Ep. {currentEp}
            </span>
          </div>
        </div>

        {/* Indicador de Status do Anirium+ Service (Apenas exibido quando conectado) */}
        <div className="flex items-center gap-2">
          {isServiceOnline && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-[11px] font-mono text-emerald-400 shadow-sm"
              title="API do Anirium+ Service local conectada"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Anirium+ Service Conectado</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black">
        {/* O Player Pro não abre providers; oferece apenas o modo independente quando o serviço está offline. */}
        {streamSrc && (isServiceOnline || customMediaSrc) ? (
          <div
            className="relative w-full h-full flex items-center justify-center cursor-pointer"
            onClick={togglePlay}
          >
            {windowPending && !playbackError && (
              <div role="status" className="absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded bg-black/80 px-3 py-2 text-xs text-white">
                Preparando próximo trecho no Service…
              </div>
            )}
            {selectedSubtitle !== "Desativado" && subtitleLoadStatus !== "ready" && subtitleLoadStatus !== "off" && subtitleLoadStatus !== "window-empty" && (
              <div role="status" className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded bg-black/80 px-3 py-2 text-xs text-white">
                {subtitleLoadStatus === "loading" ? "Aguardando legenda do Service…" : subtitleLoadStatus === "timeout" ? "O Service demorou para entregar esta legenda. Tente novamente ou escolha outra faixa." : subtitleLoadStatus === "empty" ? "Legenda recebida sem trechos válidos" : "Falha ao carregar legenda"}
                {subtitleLoadStatus !== "loading" && (
                  <button type="button" className="ml-3 underline" onClick={(event) => { event.stopPropagation(); setSubtitleRetry(value => value + 1); }}>Tentar novamente</button>
                )}
              </div>
            )}
            <video
              ref={videoRef}
              crossOrigin={customMediaSrc ? undefined : "anonymous"}
              className={`w-full h-full object-contain ${
                subtitleSize === "sm"
                  ? "[&::cue]:text-sm"
                  : subtitleSize === "lg"
                  ? "[&::cue]:text-2xl"
                  : subtitleSize === "xl"
                  ? "[&::cue]:text-3xl"
                  : "[&::cue]:text-lg"
              }`}
              onTimeUpdate={handleTimeUpdate}
              onProgress={handleProgress}
              onCanPlay={handleProgress}
              onCanPlayThrough={handleProgress}
              onPlay={() => { setDecoderPlaying(true); setIsPlaying(true); }}
              onPause={() => { setDecoderPlaying(false); setIsPlaying(serviceManifest?.continuousBuffer && !customMediaSrc ? playbackIntentRef.current : windowTargetRef.current?.playing ?? false); }}
              onError={() => setPlaybackError("Não foi possível reproduzir esta mídia.")}
              onLoadedMetadata={() => setDuration(customMediaSrc ? videoRef.current?.duration || 0 : serviceWindow?.episodeDuration || serviceManifest?.episodeDuration || (serviceWindow ? serviceWindow.start + serviceWindow.deliveredDuration : videoRef.current?.duration || 0))}
			  onEnded={() => {
                if (advancedEpisodeRef.current === `${anime.mal_id}:${currentSeasonIdx}:${currentEp}`) return;
				if (serviceWindow && !serviceWindow.endOfEpisode && !serviceManifest?.continuousBuffer) void requestServiceWindow(serviceWindow.start + serviceWindow.deliveredDuration, selectedQuality, true);
				else {
					completedPositionRef.current = Math.max(currentTime, readEpisodeTime());
					setCurrentTime(completedPositionRef.current);
					setPlaybackEnded(true);
					playbackIntentRef.current = false;
					setIsPlaying(false);
                    const position = completedPositionRef.current;
                    const episodeDuration = serviceManifest?.episodeDuration || duration;
                    const key = `${anime.mal_id}:${currentSeasonIdx}:${currentEp}`;
                    if (!customMediaSrc && finalEpisodeEnd(position, episodeDuration, serviceWindow?.endOfEpisode)) {
                      const seasonEntityId = anime.seasons?.[currentSeasonIdx]?.entityId ?? (!anime.seasons?.length && currentSeasonIdx === 0 ? anime.seasonEntityId : undefined);
                      if (seasonEntityId) onProgress?.({animeId:anime.mal_id,seasonEntityId,seasonIdx:currentSeasonIdx,episode:currentEp,currentTime:position,duration:episodeDuration,completed:true});
                      const next = nextKnownEpisode(seasonsList.map(season => season.episodes), currentSeasonIdx, currentEp);
                      if (preferenceSnapshotRef.current?.autoNextEpisode && next && advancedEpisodeRef.current !== key) {
                        advancedEpisodeRef.current = key;
                        playbackIntentRef.current = true;
                        setCurrentSeasonIdx(next.season); setCurrentEp(next.episode);
                        onChangeEpisode?.(next.episode, next.season);
                      }
                    }
				}
			  }}
              autoPlay={!serviceManifest?.continuousBuffer}
              playsInline
            >
            </video>
            {serviceManifest?.continuousBuffer && !customMediaSrc && !windowPending && !playbackEnded && (!jointBuffer.state || !canStartBufferedPlayback(jointBuffer.state, bufferAheadSeconds, Math.max(0, subtitleCoverageEnd - currentTime), currentTime, decoderPlaying)) && (
              <div role="status" className="absolute inset-x-4 top-4 rounded-lg bg-black/90 p-3 text-sm text-amber-200">
                {jointBuffer.error || "Preparando buffer de vídeo, áudio e legendas…"}
              </div>
            )}
            {playbackError && (
              <div role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-black/90 p-3 text-sm text-red-200">
                {playbackError}
				{!customMediaSrc && playbackTicket && selectedQuality && (
				  <button onClick={() => switchQuality(selectedQuality)} className="ml-3 underline text-white">Tentar novamente</button>
				)}
              </div>
            )}
            {!playbackError && !customMediaSrc && (serviceWindow ? serviceWindow.audioTracks?.some(track => track.language === selectedAudio && track.processingFailed) : serviceManifest?.variants.some(variant => variant.quality === selectedQuality && variant.processingFailed) || serviceManifest?.audioTracks?.some(track => track.language === selectedAudio && track.processingFailed)) && (
              <div role="status" className="absolute inset-x-4 top-4 rounded-lg bg-black/90 p-3 text-sm text-amber-200">
                O Service interrompeu o processamento do vídeo ou áudio selecionado. Os trechos já disponíveis continuam reproduzíveis, mas a mídia não foi concluída. Você pode selecionar outra qualidade ou faixa de áudio disponível.
              </div>
            )}

            {/* Renderização de Legendas na Tela (Overlay Pro acima da barra de controle z-35) */}
            {!customMediaSrc && currentCueText && selectedSubtitle && selectedSubtitle !== "Desativado" && (
              <div className="absolute bottom-20 sm:bottom-24 inset-x-4 flex justify-center pointer-events-none select-none z-35">
                <div
                  className={`bg-black/85 backdrop-blur-md text-white font-medium text-center rounded-lg px-5 py-2 shadow-2xl border border-white/20 max-w-3xl whitespace-pre-line leading-relaxed ${
                    subtitleSize === "sm"
                      ? "text-xs sm:text-sm"
                      : subtitleSize === "lg"
                      ? "text-lg sm:text-2xl font-semibold"
                      : subtitleSize === "xl"
                      ? "text-xl sm:text-3xl font-bold"
                      : "text-sm sm:text-lg"
                  }`}
                  style={{
                    textShadow: "0 2px 4px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,0.8)",
                  }}
                >
                  {currentCueText}
                </div>
              </div>
            )}


            {/* Ícone flutuante sutil de play/pause no centro ao clicar */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none transition-all">
                <div className="w-16 h-16 rounded-full bg-[#0B0B0D]/80 border border-[#FFC766]/50 flex items-center justify-center shadow-2xl backdrop-blur-sm">
                  <Play className="w-8 h-8 text-[#FFC766] fill-current ml-1" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-6 max-w-lg space-y-4">
            {isLoadingSources && isServiceOnline ? (
              <div className="space-y-3">
                <RefreshCw className="w-8 h-8 text-[#FFC766] animate-spin mx-auto" />
                <h3 className="font-serif text-base font-bold text-[#FFF9F0]">
                  Player Pro • Buscando Fontes...
                </h3>
                <p className="text-xs text-[#EADCC8]/60">
                  Consultando extensões e provedores habilitados em sua conta.
                </p>
              </div>
            ) : (
              <div className="bg-[#141418] border border-[#3A3A43] rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                  <AlertCircle className="w-6 h-6" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-serif text-lg font-bold text-[#FFF9F0]">
                    {playbackStatusMessage(isServiceOnline ? serviceStatus : "service-offline").title}
                  </h3>
                  <p className="text-xs text-[#EADCC8]/70 leading-relaxed max-w-md mx-auto">
                    {playbackStatusMessage(isServiceOnline ? serviceStatus : "service-offline").description}
                  </p>
                </div>

                {/* Opções de Reprodução Soberana */}
                <div className="flex flex-col gap-2.5 pt-2 max-w-md mx-auto">
                  {isServiceOnline && serviceStatus === "core_unavailable" && (
                    <button type="button" onClick={retryAuthorization} className="w-full py-2.5 px-4 rounded-xl border border-[#FFC766]/50 text-xs font-semibold text-[#FFC766]">
                      Tentar novamente a partir de {formatTime(currentTime)}
                    </button>
                  )}
                  {!isServiceOnline && (
                    <a href="ms-windows-store://pdp/?productid=9MV35DDQ6SBD" className="w-full py-2.5 px-4 rounded-xl border border-[#FFC766]/50 text-xs font-semibold text-[#FFC766] flex items-center justify-center gap-2">
                      <Download className="w-4 h-4" />Abrir na Microsoft Store
                    </a>
                  )}
                  {/* 1. Usar Arquivo Local */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,.mkv,.mp4,.webm"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#1A1A1F] hover:bg-[#23232A] border border-[#3A3A43] hover:border-[#FFC766]/50 text-xs font-semibold text-[#FFF9F0] flex items-center justify-center gap-2 transition shadow-sm"
                  >
                    <Folder className="w-4 h-4 text-[#FFC766]" />
                    <span>Utilizar Arquivo de Vídeo Local (MP4 / MKV)</span>
                  </button>

                  {/* 2. Inserir link HTTP direto do episódio */}
                  <button
                    type="button"
                    onClick={() => setShowCustomInput(!showCustomInput)}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#1A1A1F] hover:bg-[#23232A] border border-[#3A3A43] hover:border-[#FFC766]/50 text-xs font-semibold text-[#FFF9F0] flex items-center justify-center gap-2 transition shadow-sm"
                  >
                    <Link2 className="w-4 h-4 text-[#FFC766]" />
                    <span>Inserir Link Direto do Ep. {currentEp} (MP4)</span>
                  </button>

                  {showCustomInput && (
                    <div className="p-3 rounded-2xl bg-[#0B0B0D] border border-[#3A3A43] space-y-2 animate-in fade-in duration-150">
                      <div className="text-[11px] text-[#FFC766] font-mono font-medium text-left">
                        Link específico para o Episódio {currentEp}:
                      </div>
                      <input
                        type="text"
                        value={customLinkInput}
                        onChange={(e) => setCustomLinkInput(e.target.value)}
                        placeholder={`Cole o link do Ep. ${currentEp} (https://...mp4)`}
                        className="w-full p-2.5 rounded-xl bg-[#1A1A1F] border border-[#3A3A43] text-xs font-mono text-[#FFF9F0] placeholder:text-[#EADCC8]/30 focus:outline-none focus:border-[#FFC766]"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCustomLink}
                        className="w-full py-2 rounded-xl bg-[#FFC766] hover:bg-[#e6b358] text-[#0B0B0D] text-xs font-bold transition shadow"
                      >
                        Carregar Mídia do Episódio {currentEp}
                      </button>
                    </div>
                  )}

                  {/* 3. Redirecionar para o Distribuidor Oficial Licenciado */}
                  {anime.streaming_links && anime.streaming_links.length > 0 ? (
                    <a
                      href={anime.streaming_links[0].url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-950/80 to-[#1A1A1F] hover:from-emerald-900/90 hover:to-[#23232A] border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-center justify-center gap-2 transition shadow-sm mt-1"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Assistir no Canal Oficial ({anime.streaming_links[0].site})</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  ) : (
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent((anime.title_english || anime.title) + " assistir online oficial")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-950/80 to-[#1A1A1F] hover:from-emerald-900/90 hover:to-[#23232A] border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-center justify-center gap-2 transition shadow-sm mt-1"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Buscar Distribuição Oficial Licenciada</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls Bar (Nobre / Estilo Netflix & YouTube) */}
      <div className="absolute bottom-0 inset-x-0 z-30 p-4 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/85 to-transparent space-y-2">
        {/* Progress Timeline */}
        <div
          className="relative h-2 w-full bg-[#23232A] rounded-full cursor-pointer overflow-hidden group"
          onClick={(e) => {
            if (!videoRef.current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            seekTo(Math.min(Math.max(0, duration - 0.05), clickPos * duration));
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-[#3A3A43]/80 rounded-full transition-all"
            title={`Buffer do navegador: ${bufferAheadSeconds.toFixed(1)}s à frente${jointBuffer.state ? ` • Service: ${jointBuffer.state.buffer.commonAhead.toFixed(1)}s conjuntos` : jointBuffer.error ? ` • ${jointBuffer.error}` : ""}`}
            style={{ left: `${(currentTime / (duration || 1)) * 100}%`, width: `${downloadedPercent}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#FFC766] to-[#FFB347] rounded-full shadow-[0_0_8px_#FFC766]"
            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between text-xs text-[#FFF9F0] pt-1">
          {/* Esquerda: Play, Skip, Tempo */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              className="w-8 h-8 rounded-full bg-[#FFC766] text-[#0B0B0D] flex items-center justify-center hover:scale-105 transition shadow font-bold"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <button onClick={() => seekRelative(-10)} className="hover:text-[#FFC766] transition" title="Voltar 10s">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={() => seekRelative(10)} className="hover:text-[#FFC766] transition" title="Avançar 10s">
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="font-mono text-xs text-[#EADCC8]">
              <span>{formatTime(currentTime)}</span> / <span>{formatTime(duration)}</span>
            </div>

            {/* Controle de Volume até 150% com Amplificação Web Audio */}
            <div
              className="relative flex items-center gap-1.5 group"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={toggleMute}
                className="hover:text-[#FFC766] transition p-1"
                title={isMuted ? "Desmutar" : `Volume: ${volume}%`}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : volume < 50 ? (
                  <Volume1 className="w-4 h-4 text-[#EADCC8]" />
                ) : (
                  <Volume2 className={`w-4 h-4 ${volume > 100 ? "text-[#FFC766]" : "text-[#EADCC8]"}`} />
                )}
              </button>

              {/* Slider de Volume Expansível (0% - 100%) */}
              <div
                className={`flex items-center gap-1.5 transition-all duration-200 overflow-hidden ${
                  showVolumeSlider ? "w-28 opacity-100" : "w-0 opacity-0"
                }`}
              >
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-16 h-1 bg-[#3A3A43] rounded-lg appearance-none cursor-pointer accent-[#FFC766]"
                />
                <span className="text-[10px] font-mono font-bold text-[#EADCC8]/80">
                  {isMuted ? "0%" : `${volume}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Centro / Direita: Multi-Qualidade, Multi-Áudio, Multi-Sub e Tela Cheia */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Seletor de Qualidade (Multi-Quality) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowQualityMenu(!showQualityMenu);
                  setShowAudioMenu(false);
                  setShowSubMenu(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766]/50 text-xs font-mono text-[#EADCC8] transition"
                title="Seletor de Qualidade de Vídeo"
                disabled={!!customMediaSrc}
              >
                <Sliders className="w-3.5 h-3.5 text-[#FFC766]" />
                <span>{customMediaSrc ? "Original" : selectedQuality}</span>
                <ChevronDown className="w-3 h-3 text-[#EADCC8]/60" />
              </button>

              {showQualityMenu && !customMediaSrc && (
                <div className="absolute bottom-full right-0 mb-2 w-36 bg-[#1A1A1F] border border-[#3A3A43] rounded-2xl shadow-2xl p-1.5 space-y-1 z-40">
                  <div className="text-[10px] font-mono text-[#EADCC8]/60 px-2 py-0.5 uppercase">Qualidade</div>
                  {availableQualities.map((q) => (
                    <button
                      key={q}
                      onClick={() => switchQuality(q)}
                      title={serviceManifest?.variants.some(variant => variant.quality === q && variant.status === "stalled") ? "Clique para tentar preparar esta qualidade novamente" : ""}
                      className={`w-full text-left px-2 py-1 rounded-xl text-xs flex items-center justify-between transition ${
                        selectedQuality === q ? "bg-[#FFC766] text-[#0B0B0D] font-bold" : "text-[#FFF9F0] hover:bg-[#23232A]"
                      }`}
                    >
                      <span>{q}</span>
                      {selectedQuality === q && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Seletor de Faixa de Áudio (Multi-Dub) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowAudioMenu(!showAudioMenu);
                  setShowQualityMenu(false);
                  setShowSubMenu(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766]/50 text-xs font-medium text-[#EADCC8] transition"
                title="Seletor de Idioma de Áudio"
                disabled={!!customMediaSrc}
              >
                <Languages className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden md:inline truncate max-w-[80px]">{customMediaSrc ? "Original" : selectedAudio}</span>
              </button>

              {showAudioMenu && !customMediaSrc && (
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#1A1A1F] border border-[#3A3A43] rounded-2xl shadow-2xl p-1.5 space-y-1 z-40">
                  <div className="text-[10px] font-mono text-[#EADCC8]/60 px-2 py-0.5 uppercase">Faixa de Áudio</div>
                  {existingAudios.map((aud) => (
                    <button
                      key={aud}
                      disabled={!availableAudios.includes(aud)}
                      title={availableAudios.includes(aud) ? "" : serviceManifest?.audioTracks?.find(track => track.language === aud)?.status === "stalled" ? "Processamento interrompido" : "Preparando faixa"}
                      onClick={() => {
                        manualAudioRef.current = true;
                        setSelectedAudio(aud);
                        setShowAudioMenu(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center justify-between transition disabled:opacity-50 disabled:cursor-wait ${
                        selectedAudio === aud ? "bg-[#FFC766] text-[#0B0B0D] font-bold" : "text-[#FFF9F0] hover:bg-[#23232A]"
                      }`}
                    >
                      <span className="truncate">{aud}{!availableAudios.includes(aud) ? " • aguardando" : ""}</span>
                      {selectedAudio === aud && <Check className="w-3 h-3 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Seletor de Legendas (Multi-Sub) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSubMenu(!showSubMenu);
                  setShowQualityMenu(false);
                  setShowAudioMenu(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766]/50 text-xs font-medium text-[#EADCC8] transition"
                title="Seletor de Legendas Sincronizadas"
                disabled={!!customMediaSrc}
              >
                <Subtitles className="w-3.5 h-3.5 text-pink-400" />
                <span className="hidden md:inline truncate max-w-[80px]">{customMediaSrc ? "Desativado" : selectedSubtitle || "Desativado"}</span>
              </button>

              {showSubMenu && !customMediaSrc && (
                <div className="absolute bottom-full right-0 mb-2 w-56 bg-[#1A1A1F] border border-[#3A3A43] rounded-2xl shadow-2xl p-2 space-y-2 z-40">
                  {/* Seletor de Tamanho de Legenda */}
                  <div>
                    <div className="text-[10px] font-mono text-[#EADCC8]/60 px-1 py-0.5 uppercase">
                      Tamanho da Legenda
                    </div>
                    <div className="grid grid-cols-4 gap-1 pt-1">
                      {(["sm", "md", "lg", "xl"] as const).map((sz) => (
                        <button
                          key={sz}
                          onClick={() => setSubtitleSize(sz)}
                          className={`py-1 rounded-lg text-[10px] font-mono font-bold transition text-center ${
                            subtitleSize === sz
                              ? "bg-[#FFC766] text-[#0B0B0D]"
                              : "bg-[#23232A] text-[#EADCC8] hover:bg-[#2e2e38]"
                          }`}
                        >
                          {sz === "sm" ? "P" : sz === "md" ? "M" : sz === "lg" ? "G" : "GG"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[#3A3A43]/50 pt-1">
                    {subtitleManualRequired && (
                      <div className="flex items-center justify-between gap-1 pb-2" role="group" aria-label="Ajustar sincronização da legenda">
                        <button aria-label="Adiantar legenda meio segundo" onClick={() => setSubtitleDelay(value => Math.max(-120, value - 0.5))}>−0,5s</button>
                        <button aria-label="Restaurar sincronização da legenda" title="Sincronização não verificada. Clique para zerar o ajuste." onClick={() => setSubtitleDelay(0)}>{subtitleDelay > 0 ? '+' : ''}{subtitleDelay.toFixed(1)}s</button>
                        <button aria-label="Atrasar legenda meio segundo" onClick={() => setSubtitleDelay(value => Math.min(120, value + 0.5))}>+0,5s</button>
                      </div>
                    )}
                    <div className="text-[10px] font-mono text-[#EADCC8]/60 px-1 py-0.5 uppercase">
                      Faixas Disponíveis
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5 pt-1 pr-0.5">
                      {availableSubtitles.map((sub) => (
                        <button
                          key={sub}
                          onClick={() => {
                            const count = existingSubtitleOptions(serviceManifest?.subtitleTracks || [], sub).length;
                            setSubtitleOption(nextSubtitleOption(selectedSubtitle, sub, subtitleOption, count));
                            manualSubtitleRef.current = true;
                            setSelectedSubtitle(sub);
                            setShowSubMenu(false);
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center justify-between transition ${
                            selectedSubtitle === sub ? "bg-[#FFC766] text-[#0B0B0D] font-bold" : "text-[#FFF9F0] hover:bg-[#23232A]"
                          }`}
                        >
                          <span className="truncate">{sub}{sub !== "Desativado" && ` (${selectedSubtitle === sub ? subtitleOption % Math.max(1, existingSubtitleOptions(serviceManifest?.subtitleTracks || [], sub).length) + 1 : 1}/${existingSubtitleOptions(serviceManifest?.subtitleTracks || [], sub).length})`}</span>
                          {selectedSubtitle === sub && <Check className="w-3 h-3 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navegador de Episódios */}
            <div className="flex items-center gap-1">
              <button
                disabled={currentEp <= 1}
                onClick={() => {
                  const nextEp = Math.max(1, currentEp - 1);
                  setCurrentEp(nextEp);
                  onChangeEpisode?.(nextEp, currentSeasonIdx);
                }}
                className="p-1 rounded hover:text-[#FFC766] disabled:opacity-30"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1A1A1F] border border-[#3A3A43]">
                Ep. {currentEp} de {totalEpisodes ?? "?"}
              </span>
              <button
                disabled={totalEpisodes == null || currentEp >= totalEpisodes}
                onClick={() => {
                  if (totalEpisodes == null) return;
                  const nextEp = Math.min(totalEpisodes, currentEp + 1);
                  setCurrentEp(nextEp);
                  onChangeEpisode?.(nextEp, currentSeasonIdx);
                }}
                className="p-1 rounded hover:text-[#FFC766] disabled:opacity-30"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Botão Tela Cheia */}
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  containerRef.current?.requestFullscreen();
                  setIsFullscreen(true);
                } else {
                  document.exitFullscreen();
                  setIsFullscreen(false);
                }
              }}
              className="p-1 hover:text-[#FFC766] transition ml-1"
              title="Tela Cheia"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
