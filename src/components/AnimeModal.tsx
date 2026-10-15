"use client";
import { recommendCanonicalResume, readCanonicalProgress, scopedEpisodeProgress, type ScopedEpisodeProgress } from "../lib/profilePlaybackIdentity";
import { isEpisodeBookmarked } from "@/lib/bookmarkIdentity";

import ModalDialog from "./ModalDialog";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Play,
  Star,
  Layers,
  Calendar,
  Film,
  Tv,
  ShieldCheck,
  ExternalLink,
  Info,
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Zap,
  Heart,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { Anime } from "@/types/anime";
import { useUser } from "@/context/UserContext";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";
import { resolveApiUrl } from "@/lib/apiConfig";

interface AnimeModalProps {
  anime: Anime | null;
  onClose: () => void;
  onPlayEpisode: (anime: Anime, episodeNum: number, seasonIdx: number) => void;
  onResumeEpisode: (animeId: number, seasonEntityId: string, episodeEntityId: string) => boolean | Promise<boolean>;
  onOpenFranchise?: (franchiseRoot: string) => void;
}

type ModalView = "overview" | "episodes" | "trailer";

export default function AnimeModal({ anime, onClose, onPlayEpisode, onResumeEpisode, onOpenFranchise }: AnimeModalProps) {
  const { user, level, watchHistory, bookmarks, bookmarkItems, toggleEntityBookmark, switchLevel, levelChangeError, hasPlayerAddon } = useUser();
  const [currentView, setCurrentView] = useState<ModalView>("overview");
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState<number>(0);
  const [selectedFormat, setSelectedFormat] = useState<string>("ALL");
  const [selectedEp, setSelectedEp] = useState<number>(1);
  const [episodeViewMode, setEpisodeViewMode] = useState<"cards" | "grid">("cards");
  const [activeEpisodeBatch, setActiveEpisodeBatch] = useState<number>(0);
  const [progressState, setProgressState] = useState<ScopedEpisodeProgress>({ownerId:null,seasonEntityId:null,episodes:{}});
  const progressSeasonId = anime?.seasons?.[selectedSeasonIdx]?.entityId ?? (!anime?.seasons?.length && selectedSeasonIdx===0 ? anime?.seasonEntityId : undefined);
  const progressMap = scopedEpisodeProgress(progressState,user?.id ?? null,progressSeasonId);
  const [isLoadingProgress, setIsLoadingProgress] = useState<boolean>(false);
  const [progressError, setProgressError] = useState(false);
  const [progressRevision, setProgressRevision] = useState(0);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState(false);

  const isAniriumPlus = Boolean(user && level >= 2);
  const isBookmarked = anime ? (isAniriumPlus && bookmarks.includes(anime.mal_id)) : false;
  // O switch no perfil do usuário determina se o botão do episódio abre o player ou redireciona
  const isPlayerEnabledOnEpisodes = Boolean(isAniriumPlus && hasPlayerAddon && user?.settings?.usePlayerOnEpisodes);

  // Ponto exato onde o usuário Anirium+ parou na obra
  const resumeEpisodeInfo = useMemo(() => recommendCanonicalResume(anime,watchHistory,progressMap), [anime,watchHistory,progressMap]);
  const handleResume = async () => {
    if (!anime || resumeLoading) return;
    if (resumeEpisodeInfo.isResume) {
      setResumeLoading(true);
      setResumeError(false);
      try { if (!(await onResumeEpisode(anime.mal_id,resumeEpisodeInfo.seasonEntityId,resumeEpisodeInfo.episodeEntityId))) setResumeError(true); }
      catch { setResumeError(true); }
      finally { setResumeLoading(false); }
    } else { setCurrentView("episodes"); }
  };

  // Reset to overview when opening new anime
  useEffect(() => {
    if (anime) {
      setCurrentView("overview");
      setSelectedSeasonIdx(0);
      setSelectedFormat("ALL");
      setSelectedEp(1);
      setActiveEpisodeBatch(0);
    }
  }, [anime?.mal_id]);

  // Carregar progresso de episódios do usuário
  useEffect(() => {
    if (!anime?.mal_id) return;
    const controller = new AbortController();
    setProgressState({ownerId:user?.id ?? null,seasonEntityId:progressSeasonId ?? null,episodes:{}});
    setIsLoadingProgress(true);
    setProgressError(false);
    const params = new URLSearchParams({animeId:String(anime.mal_id),seasonIdx:String(selectedSeasonIdx)});
    const seasonId = progressSeasonId;
    if (!seasonId) {
      setIsLoadingProgress(false);
      setProgressError(true);
      return;
    }
    params.set("seasonEntityId",seasonId);
    fetch(resolveApiUrl(`/api/progress?${params}`),{signal:controller.signal, credentials: "include"})
      .then((res) => { if (!res.ok) throw new Error("Progress unavailable"); return res.json(); })
      .then((data) => {
        if (!controller.signal.aborted && data.userId === user?.id && data.success && Array.isArray(data.episodes)) {
          const map = readCanonicalProgress(data,seasonId);
          if (map) setProgressState({ownerId:user?.id ?? null,seasonEntityId:seasonId,episodes:map});
          else setProgressError(true);
        } else if (!controller.signal.aborted) setProgressError(true);
      })
      .catch(() => { if (!controller.signal.aborted) setProgressError(true); })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingProgress(false); });
    return () => controller.abort();
  }, [anime,selectedSeasonIdx,user?.id,progressSeasonId,progressRevision]);

  // Lista unificada de produções da franquia
  const seasonsList = useMemo(() => {
    if (anime?.seasons && anime.seasons.length > 0) {
      return anime.seasons;
    }
    return [
      {
        id: anime?.mal_id || 0,
        entityId: anime?.seasonEntityId,
        idMal: anime?.idMal,
        seasonNumber: 1,
        title: anime?.title || "Temporada 1",
        title_english: anime?.title_english,
        format: anime?.format || "TV",
        episodes: anime?.episodes ?? null,
        status: anime?.status || "UNKNOWN",
        year: anime?.year,
        cover: anime?.images?.webp?.large_image_url || "",
      },
    ];
  }, [anime]);

  // Formatos presentes na franquia
  const formatCounts = useMemo(() => {
    const counts = { ALL: seasonsList.length, TV: 0, MOVIE: 0, OVA: 0, SPECIAL: 0 };
    for (const s of seasonsList) {
      const f = (s.format || "TV").toUpperCase();
      if (f === "MOVIE") counts.MOVIE++;
      else if (f === "OVA" || f === "ONA") counts.OVA++;
      else if (f === "SPECIAL" || f === "MUSIC" || f === "SPINOFF") counts.SPECIAL++;
      else counts.TV++;
    }
    return counts;
  }, [seasonsList]);

  // Produções filtradas por formato
  const filteredSeasons = useMemo(() => {
    if (selectedFormat === "ALL") return seasonsList;
    return seasonsList.filter((s) => {
      const f = (s.format || "TV").toUpperCase();
      if (selectedFormat === "TV") return f === "TV";
      if (selectedFormat === "MOVIE") return f === "MOVIE";
      if (selectedFormat === "OVA") return f === "OVA" || f === "ONA";
      if (selectedFormat === "SPECIAL") return f === "SPECIAL" || f === "MUSIC" || f === "SPINOFF";
      return true;
    });
  }, [seasonsList, selectedFormat]);

  const currentSeason = seasonsList[selectedSeasonIdx] || seasonsList[0];
  const totalEpisodes = currentSeason?.episodes ?? null;

  // Faixas de episódios (máximo de 24 episódios por lote para manter o determinismo sem scroll caótico)
  const batchSize = 24;
  const totalBatches = totalEpisodes == null ? 0 : Math.ceil(totalEpisodes / batchSize);
  const currentBatchEpisodes = useMemo(() => {
    if (totalEpisodes == null) return [];
    const start = activeEpisodeBatch * batchSize + 1;
    const end = Math.min(totalEpisodes, (activeEpisodeBatch + 1) * batchSize);
    const eps: number[] = [];
    for (let i = start; i <= end; i++) {
      eps.push(i);
    }
    return eps;
  }, [activeEpisodeBatch, totalEpisodes]);

  // Métricas de progresso da temporada
  const watchedCountInSeason = useMemo(() => {
    if (totalEpisodes == null) return Object.entries(progressMap).filter(([key,value]) => /^[1-9]\d*$/.test(key) && value.completed).length;
    let count = 0;
    for (let i = 1; i <= totalEpisodes; i++) {
      if (progressMap[i]?.completed) count++;
    }
    return count;
  }, [progressMap, totalEpisodes]);

  if (!anime) return null;

  const backdrop =
    anime.banner_image ||
    anime.images.webp?.large_image_url ||
    anime.images.jpg?.large_image_url ||
    anime.images.jpg?.image_url;

  const posterCover =
    anime.images.webp?.large_image_url ||
    anime.images.jpg?.large_image_url ||
    anime.images.jpg?.image_url;

  // Links oficiais verificados
  const validStreamingLinks = (anime.streaming_links || []).filter((link) => {
    const s = (link.site || "").toLowerCase();
    const isSocial = s.includes("twitter") || s.includes("instagram") || s.includes("tiktok") || s.includes("weibo");
    return !isSocial && !link.url.includes("/search?q=");
  });

  const franchiseName = anime.franchise_root || anime.title_english || anime.title;

  return (
    <ModalDialog
      label={anime.title_portuguese || anime.title_english || anime.title}
      onClose={onClose}
      className="p-0 fixed inset-0 z-50 w-screen h-screen bg-[#0B0B0D] text-[#FFF9F0] flex flex-col overflow-hidden select-none animate-in fade-in duration-150"
    >
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        {levelChangeError && <p role="alert" className="flex-none p-2 text-sm text-rose-400">Não foi possível alterar o nível. Tente novamente.</p>}
        {/* Top App Bar Nobre */}
        <div className="h-14 flex-none border-b border-[#3A3A43]/60 px-2 sm:px-6 flex items-center justify-between gap-1 sm:gap-2 bg-[#141418]/95 backdrop-blur-md z-30">
          {/* Top Bar: Breadcrumb Interligado dos 4 Níveis (Franquia > Obra > Temporada > Episódio) */}
          <div className="flex items-center gap-1 sm:gap-2.5 min-w-0">
            {/* 1. Nível Franquia / Série */}
            {onOpenFranchise ? (
              <button
                onClick={() => onOpenFranchise(franchiseName)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-[#1A1A1F] hover:bg-[#23232A] text-[#FFC766] border border-[#FFC766]/30 text-xs font-mono font-bold transition shadow-sm group shrink-0"
                title={`Ver universo da franquia ${franchiseName}`}
                aria-label={`Ver universo da franquia ${franchiseName}`}
              >
                <Layers className="w-3.5 h-3.5 text-[#FFC766] group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline truncate sm:max-w-[170px]">{franchiseName}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A1A1F] border border-[#3A3A43] text-xs font-mono text-[#FFC766] shrink-0">
                <Layers className="w-3.5 h-3.5" />
                <span className="truncate max-w-[110px]">{franchiseName}</span>
              </div>
            )}

            <ChevronRight className="w-3.5 h-3.5 text-[#3A3A43] shrink-0" />

            {/* 2. Nível Obra */}
            <button
              onClick={() => setCurrentView("overview")}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition min-w-0 ${
                currentView === "overview"
                  ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-md"
                  : "bg-[#1A1A1F] hover:bg-[#23232A] text-[#EADCC8] hover:text-[#FFF9F0] border border-[#3A3A43]"
              }`}
              title="Visão Geral da Obra"
              aria-label={`Visão geral de ${anime.title_portuguese || anime.title_english || anime.title}`}
            >
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[76px] sm:max-w-[160px]">
                {anime.title_portuguese || anime.title_english || anime.title}
              </span>
            </button>

            <ChevronRight className="w-3.5 h-3.5 text-[#3A3A43] shrink-0" />

            {/* 3. Nível Temporada */}
            <button
              onClick={() => setCurrentView("episodes")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-semibold transition shrink-0 ${
                currentView === "episodes"
                  ? "bg-[#38BDF8] text-[#0B0B0D] font-bold shadow-md"
                  : "bg-[#1A1A1F] hover:bg-[#23232A] text-[#EADCC8] hover:text-[#FFF9F0] border border-[#3A3A43]"
              }`}
              title={`Temporada #${currentSeason.seasonNumber}: ${currentSeason.title}`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>T#{currentSeason.seasonNumber}</span>
              <span className="hidden md:inline font-sans font-normal text-[11px] opacity-80 truncate max-w-[110px]">
                ({currentSeason.episodes} eps)
              </span>
            </button>

            {/* 4. Nível Episódio (Se houver progresso ou reprodução rápida) */}
            {resumeEpisodeInfo.isResume && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#3A3A43] shrink-0 hidden sm:inline" />
                <button
                  onClick={handleResume}
                  disabled={resumeLoading}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-bold transition shadow-sm shrink-0"
                  title={`Reproduzir onde parou: Ep. ${resumeEpisodeInfo.episodeNum}`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Ep. {resumeEpisodeInfo.episodeNum}</span>
                </button>
              </>
            )}
          </div>

          {/* Navigation Controls (Trailer + Fechar) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCurrentView("episodes")}
              className={`px-2 sm:px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                currentView === "episodes"
                  ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-md"
                  : "text-[#EADCC8] hover:text-[#FFF9F0]"
              }`}
              title="Lista de episódios e produções"
              aria-label="Lista de episódios e produções"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Episódios</span>
            </button>
            {anime.trailer?.youtube_id && (
              <button
                onClick={() => setCurrentView("trailer")}
                className={`hidden sm:flex px-4 py-1.5 rounded-full transition-all items-center gap-1.5 ${
                  currentView === "trailer"
                    ? "bg-[#E5484D] text-white font-bold shadow-md"
                    : "text-[#EADCC8] hover:text-[#FFF9F0]"
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Trailer</span>
              </button>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full bg-[#1A1A1F]/80 hover:bg-[#23232A] border border-[#3A3A43] flex items-center justify-center text-[#EADCC8] hover:text-[#FFF9F0] transition shadow-lg"
            title="Fechar Modal"
            aria-label="Fechar ficha"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport de Conteúdo: Full-screen Stage sem scroll externo */}
        {isAniriumPlus && (isLoadingProgress || resumeLoading || progressError || resumeError) && <div className="flex-none flex flex-wrap items-center gap-2 px-3 py-1 sm:px-6">
            {isAniriumPlus && (isLoadingProgress || resumeLoading) && <span role="status" className="text-xs text-[#EADCC8]">{resumeLoading ? "Confirmando episódio…" : "Carregando progresso…"}</span>}
            {isAniriumPlus && (progressError || resumeError) && <span role="alert" className="text-xs text-[#FFC766]">{resumeError ? "Retomada indisponível." : "Progresso indisponível."} <button type="button" onClick={() => { setResumeError(false); setProgressRevision(value => value + 1); }} className="underline">Tentar novamente</button></span>}
        </div>}

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* ==================== VIEW 1: VISÃO GERAL CANÔNICA (FULL CONTENT ON-SCREEN) ==================== */}
          {currentView === "overview" && (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0 animate-in fade-in duration-200">
              {/* Painel Esquerdo: Hero Cinematográfico & Detalhes da Obra (5 colunas) */}
              <div className="lg:col-span-5 relative flex flex-col justify-between p-6 sm:p-8 overflow-hidden border-b lg:border-b-0 lg:border-r border-[#3A3A43]/60 bg-gradient-to-b from-[#141418] via-[#0B0B0D] to-[#0B0B0D]">
                {/* Backdrop com Blur Atmosférico */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                  <img
                    src={backdrop}
                    alt={anime.title}
                    className="w-full h-full object-cover object-center filter brightness-[0.25] blur-sm scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/85 to-transparent" />
                  <div className="absolute inset-0 bg-[#0B0B0D]/60" />
                </div>

                {/* Conteúdo Superior */}
                <div className="relative z-10 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {anime.score && (
                      <span className="flex items-center gap-1 text-[#FFC766] font-bold bg-[#FFC766]/15 border border-[#FFC766]/30 px-2.5 py-0.5 rounded-full">
                        <Star className="w-3.5 h-3.5 fill-[#FFC766]" />
                        <span>{anime.score}</span>
                      </span>
                    )}
                    {anime.year && (
                      <span className="flex items-center gap-1 text-[#EADCC8] bg-[#1A1A1F]/80 px-2.5 py-0.5 rounded-full border border-[#3A3A43] font-mono">
                        <Calendar className="w-3 h-3 text-[#FFC766]" />
                        <span>{anime.year}</span>
                      </span>
                    )}
                    {anime.format && (
                      <span className="text-[#38BDF8] bg-[#38BDF8]/15 border border-[#38BDF8]/30 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase">
                        {anime.format}
                      </span>
                    )}
                    {anime.status && (
                      <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase">
                        {anime.status}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-mono text-[#FFC766] uppercase tracking-wider">
                      Franquia: {franchiseName}
                    </span>
                    <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#FFF9F0] leading-tight">
                      {anime.title_portuguese || anime.title_english || anime.title}
                    </h1>
                    <div className="text-xs text-[#EADCC8]/70 flex flex-wrap items-center gap-2">
                      <span className="text-[#FFF9F0] font-medium">{anime.title}</span>
                      {anime.title_japanese && (
                        <span className="text-[#FFC766]/80 italic">({anime.title_japanese})</span>
                      )}
                    </div>
                  </div>

                  {/* Sinopse Compacta */}
                  <div className="bg-[#1A1A1F]/60 backdrop-blur-sm border border-[#3A3A43]/60 rounded-2xl p-4">
                    <h3 className="font-serif text-[11px] font-bold uppercase tracking-wider text-[#FFC766] mb-1.5 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      <span>Sinopse Canônica</span>
                    </h3>
                    <p className="text-xs text-[#EADCC8]/90 leading-relaxed line-clamp-4 lg:line-clamp-6">
                      {anime.synopsis || "Sem descrição disponível para esta obra."}
                    </p>
                  </div>
                </div>

                {/* CTAs Inferiores e Metadados Rápidos */}
                <div className="relative z-10 pt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {isAniriumPlus ? (
                      <>
                        <button
                          onClick={handleResume}
                  disabled={resumeLoading}
                          className="flex items-center gap-2 bg-gradient-to-r from-[#FFC766] to-[#FFB347] hover:brightness-110 text-[#0B0B0D] font-bold px-6 py-2.5 rounded-full active:scale-95 transition-all text-xs sm:text-sm shadow-xl shadow-[#FFC766]/20"
                          title={resumeEpisodeInfo.isResume ? `Continuar Episódio ${resumeEpisodeInfo.episodeNum}` : "Selecionar episódio"}
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>{resumeEpisodeInfo.isResume ? `Continuar (Ep. ${resumeEpisodeInfo.episodeNum})` : "Assistir"}</span>
                        </button>
                        <button
                          onClick={() => setCurrentView("episodes")}
                          className="flex items-center gap-2 bg-[#1A1A1F] hover:bg-[#23232A] text-[#FFF9F0] border border-[#3A3A43] font-semibold px-4 py-2.5 rounded-full transition-all text-xs shadow-md active:scale-95"
                        >
                          <Tv className="w-4 h-4 text-[#FFC766]" />
                          <span>Episódios</span>
                        </button>
                      </>
                    ) : hasPlayerAddon ? (
                      <button
                        onClick={() => setCurrentView("episodes")}
                        className="flex items-center gap-2 bg-gradient-to-r from-[#FFC766] to-[#FFB347] hover:brightness-110 text-[#0B0B0D] font-bold px-6 py-2.5 rounded-full active:scale-95 transition-all text-xs sm:text-sm shadow-xl shadow-[#FFC766]/20"
                      >
                        <Tv className="w-4 h-4" />
                        <span>Ver Episódios</span>
                      </button>
                    ) : validStreamingLinks.length > 0 ? (
                      <>
                        <a
                          href={validStreamingLinks[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 bg-[#FFC766] hover:bg-[#FFB347] text-[#0B0B0D] font-bold px-5 py-2.5 rounded-full active:scale-95 transition-all text-xs shadow-xl shadow-[#FFC766]/20"
                        >
                          <ShieldCheck className="w-4 h-4 fill-[#0B0B0D] text-[#FFC766]" />
                          <span>Oficial ({validStreamingLinks[0].site})</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                        </a>
                        <button
                          onClick={() => setCurrentView("episodes")}
                          className="flex items-center gap-2 bg-[#1A1A1F] hover:bg-[#23232A] text-[#FFF9F0] border border-[#3A3A43] font-semibold px-4 py-2.5 rounded-full transition-all text-xs"
                        >
                          <Tv className="w-4 h-4 text-[#FFC766]" />
                          <span>Episódios</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setCurrentView("episodes")}
                        className="flex items-center gap-2 bg-gradient-to-r from-[#FFC766] to-[#FFB347] hover:brightness-110 text-[#0B0B0D] font-bold px-5 py-2.5 rounded-full active:scale-95 transition-all text-xs"
                      >
                        <Tv className="w-4 h-4" />
                        <span>Ver Episódios</span>
                      </button>
                    )}

                    {user && (
                      <button
                        onClick={() => {
                          if (!isAniriumPlus) {
                            switchLevel(2);
                            return;
                          }
                          if (anime.workEntityId) toggleEntityBookmark("SERIES", anime.workEntityId);
                        }}
                        disabled={isAniriumPlus && !anime.workEntityId}
                        className={`flex items-center gap-2 font-semibold px-3.5 py-2.5 rounded-full border transition-all text-xs active:scale-95 ${
                          isBookmarked
                            ? "bg-[#E5484D]/15 text-[#E5484D] border-[#E5484D]/40"
                            : "bg-[#1A1A1F] hover:bg-[#23232A] text-[#EADCC8] border-[#3A3A43]"
                        }`}
                        title={
                          isAniriumPlus && !anime.workEntityId
                            ? "Favorito indisponível: obra sem vínculo"
                            : !isAniriumPlus
                            ? "Favoritos é exclusivo do Anirium+"
                            : isBookmarked
                            ? "Remover dos favoritos"
                            : "Salvar nos favoritos"
                        }
                      >
                        <Heart className={`w-4 h-4 ${isBookmarked ? "fill-[#E5484D] text-[#E5484D]" : ""}`} />
                        <span>{isBookmarked ? "Salvo" : "Salvar"}</span>
                      </button>
                    )}
                  </div>

                  {/* Passaporte de Informação Compacto */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#EADCC8]/60 pt-2 border-t border-[#3A3A43]/40">
                    <span>Estúdio: <strong className="text-[#FFF9F0]">{anime.studios?.[0]?.name || "Original"}</strong></span>
                    <span>Total: <strong className="text-[#FFC766]">{currentSeason.episodes || anime.episodes || "—"} eps</strong></span>
                    <span>Status: <strong className="text-emerald-400">{anime.status || "Não informado"}</strong></span>
                  </div>
                </div>
              </div>

              {/* Painel Direito: Linhagem Canônica da Franquia & Distribuidores (7 colunas) */}
              <div className="lg:col-span-7 flex flex-col p-6 sm:p-8 overflow-hidden min-h-0 bg-[#0E0E12]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#3A3A43]/60 flex-none">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#FFC766]" />
                      <h3 className="font-serif text-sm sm:text-base font-bold text-[#FFF9F0]">
                        Genealogia Canônica da Franquia
                      </h3>
                    </div>
                    <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                      Universo <strong>{franchiseName}</strong> • {seasonsList.length} produções conectadas em ordem de estreia.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {onOpenFranchise && (
                      <button
                        onClick={() => onOpenFranchise(franchiseName)}
                        className="px-3 py-1 rounded-full bg-[#FFC766]/15 text-[#FFC766] border border-[#FFC766]/30 text-xs font-semibold hover:bg-[#FFC766]/25 transition flex items-center gap-1 font-mono"
                      >
                        <span>Ver Universo</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setCurrentView("episodes")}
                      className="text-xs font-semibold text-[#FFC766] hover:underline flex items-center gap-1 font-mono"
                    >
                      <span>Ver Episódios</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Filtro de Formatos */}
                <div className="flex items-center gap-1.5 py-3 flex-none overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setSelectedFormat("ALL")}
                    className={`text-xs px-3 py-1 rounded-full font-semibold transition-all flex-none ${
                      selectedFormat === "ALL"
                        ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                        : "bg-[#1A1A1F] text-[#EADCC8] hover:text-white border border-[#3A3A43]"
                    }`}
                  >
                    Todas as Obras ({formatCounts.ALL})
                  </button>

                  {formatCounts.TV > 0 && (
                    <button
                      onClick={() => setSelectedFormat("TV")}
                      className={`text-xs px-3 py-1 rounded-full font-semibold transition-all flex-none ${
                        selectedFormat === "TV"
                          ? "bg-[#38BDF8] text-[#0B0B0D] font-bold shadow-sm"
                          : "bg-[#1A1A1F] text-[#EADCC8] hover:text-white border border-[#3A3A43]"
                      }`}
                    >
                      Séries TV ({formatCounts.TV})
                    </button>
                  )}

                  {formatCounts.MOVIE > 0 && (
                    <button
                      onClick={() => setSelectedFormat("MOVIE")}
                      className={`text-xs px-3 py-1 rounded-full font-semibold transition-all flex-none ${
                        selectedFormat === "MOVIE"
                          ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                          : "bg-[#1A1A1F] text-[#EADCC8] hover:text-white border border-[#3A3A43]"
                      }`}
                    >
                      Filmes ({formatCounts.MOVIE})
                    </button>
                  )}

                  {(formatCounts.OVA > 0 || formatCounts.SPECIAL > 0) && (
                    <button
                      onClick={() => setSelectedFormat("OVA")}
                      className={`text-xs px-3 py-1 rounded-full font-semibold transition-all flex-none ${
                        selectedFormat === "OVA"
                          ? "bg-[#34D399] text-[#0B0B0D] font-bold shadow-sm"
                          : "bg-[#1A1A1F] text-[#EADCC8] hover:text-white border border-[#3A3A43]"
                      }`}
                    >
                      OVAs & Especiais ({formatCounts.OVA + formatCounts.SPECIAL})
                    </button>
                  )}
                </div>

                {/* Grade de Produções da Franquia Adaptável ao Viewport Restante */}
                <div className="flex-1 overflow-y-auto no-scrollbar pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-h-0">
                  {filteredSeasons.map((season) => {
                    const originalIdx = seasonsList.findIndex((s) => s.id === season.id);
                    const isCurrent = selectedSeasonIdx === (originalIdx >= 0 ? originalIdx : 0);

                    return (
                      <div
                        key={season.id}
                        onClick={() => {
                          setSelectedSeasonIdx(originalIdx >= 0 ? originalIdx : 0);
                          setSelectedEp(1);
                          setCurrentView("episodes");
                        }}
                        className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all cursor-pointer group shadow-sm h-fit ${
                          isCurrent
                            ? "bg-[#23232A] border-[#FFC766] shadow-[0_0_12px_rgba(255,199,102,0.15)]"
                            : "bg-[#141418] hover:bg-[#1A1A1F] border-[#3A3A43] hover:border-[#FFC766]/50"
                        }`}
                      >
                        <div className="w-11 h-14 rounded-xl overflow-hidden bg-[#0B0B0D] flex-none relative">
                          <img
                            src={season.cover || posterCover}
                            alt={season.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute top-0 right-0 bg-black/85 px-1 py-0.2 text-[8px] font-bold rounded-bl text-[#FFC766] font-mono">
                            #{season.seasonNumber}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className={`text-[8px] font-bold px-1.5 py-0.2 rounded-full font-mono ${
                                season.format === "MOVIE"
                                  ? "bg-[#FFC766]/15 text-[#FFC766] border border-[#FFC766]/30"
                                  : season.format === "OVA"
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800/40"
                                  : "bg-sky-950 text-sky-300 border border-sky-800/40"
                              }`}
                            >
                              {season.format === "MOVIE"
                                ? "FILME"
                                : season.format === "OVA"
                                ? "OVA"
                                : season.format === "SPECIAL"
                                ? "ESPECIAL"
                                : "SÉRIE TV"}
                            </span>
                            {season.year && (
                              <span className="text-[9px] text-[#EADCC8]/60 font-mono">
                                {season.year}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-[#FFF9F0] truncate group-hover:text-[#FFC766] transition-colors">
                            {season.title}
                          </h4>
                          <p className="text-[10px] text-[#EADCC8]/60 font-mono">
                            {season.format === "MOVIE" ? "Longa-metragem" : season.episodes == null ? "Total não informado" : `${season.episodes} episódios`}
                          </p>
                        </div>

                        <ChevronRight className="w-4 h-4 text-[#3A3A43] group-hover:text-[#FFC766] group-hover:translate-x-0.5 transition-all flex-none" />
                      </div>
                    );
                  })}
                </div>

                {/* Distribuidores Oficiais Verificados na Barra Inferior */}
                {validStreamingLinks.length > 0 && (
                  <div className="pt-3 mt-2 border-t border-[#3A3A43]/60 flex-none flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                    <span className="text-[10px] font-mono text-[#EADCC8]/60 flex items-center gap-1.5 flex-none">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Transmissão Oficial:</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {validStreamingLinks.slice(0, 3).map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg border border-[#3A3A43] bg-[#141418] hover:bg-[#23232A] text-[10px] font-semibold text-[#FFF9F0] flex items-center gap-1.5 transition flex-none"
                        >
                          <span>{link.site}</span>
                          <ExternalLink className="w-3 h-3 text-[#FFC766]" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== VIEW 2: EPISÓDIOS & ANIRIUM+ (FULL STAGE) ==================== */}
          {currentView === "episodes" && (
            <div className="flex-1 flex flex-col p-4 sm:p-6 space-y-3 overflow-hidden min-h-0 animate-in fade-in duration-200">
              {/* Contexto da Temporada Selecionada + Seletor de Modo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#3A3A43]/60 pb-3 flex-none">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-[#FFC766]">
                    <span>FRANQUIA: {franchiseName.toUpperCase()}</span>
                    <span>•</span>
                    <span>TEMPORADA #{currentSeason.seasonNumber}</span>
                  </div>
                  <h2 className="font-serif text-lg sm:text-xl font-bold text-[#FFF9F0] flex items-center gap-2 mt-0.5">
                    <Play className="w-4 h-4 text-[#FFC766] fill-[#FFC766]" />
                    <span>{currentSeason.title}</span>
                  </h2>
                  {totalEpisodes == null && <p className="text-xs text-[#EADCC8]/60">Total de episódios não informado pela fonte.</p>}
                </div>

                {/* Seletor de Modo de Exibição (Cards vs Grid) */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-[#1A1A1F] border border-[#3A3A43] p-1 rounded-full text-xs">
                    <button
                      onClick={() => setEpisodeViewMode("cards")}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition ${
                        episodeViewMode === "cards"
                          ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                          : "text-[#EADCC8] hover:text-white"
                      }`}
                      title="Exibição em Cards com Telemetria"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Cards Detalhados</span>
                    </button>
                    <button
                      onClick={() => setEpisodeViewMode("grid")}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition ${
                        episodeViewMode === "grid"
                          ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                          : "text-[#EADCC8] hover:text-white"
                      }`}
                      title="Exibição em Grade Compacta"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Grade Rápida</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Barra Compacta de Temporadas e Faixas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 flex-none bg-[#141418] p-2.5 rounded-2xl border border-[#3A3A43]/60">
                {/* Seletor de Produção da Franquia */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">
                  <span className="text-[11px] font-mono text-[#EADCC8]/60 flex-none flex items-center gap-1">
                    <Layers className="w-3 h-3 text-[#FFC766]" /> Temp:
                  </span>
                  {seasonsList.map((season, idx) => {
                    const isSelected = selectedSeasonIdx === idx;
                    return (
                      <button
                        key={season.id}
                        onClick={() => {
                          setSelectedSeasonIdx(idx);
                          setSelectedEp(1);
                          setActiveEpisodeBatch(0);
                        }}
                        className={`flex-none px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                          isSelected
                            ? "bg-[#FFC766] text-[#0B0B0D] border-[#FFC766] font-bold shadow-sm"
                            : "bg-[#1A1A1F] text-[#EADCC8] border-[#3A3A43] hover:border-[#FFC766]/40 hover:bg-[#23232A]"
                        }`}
                      >
                        <span className="font-mono">#{season.seasonNumber}</span>
                        <span className="truncate max-w-[120px]">{season.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Seletor de Faixas de Episódios */}
                {totalBatches > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-none border-t sm:border-t-0 sm:border-l border-[#3A3A43]/60 sm:pl-3 pt-1.5 sm:pt-0">
                    <span className="text-[11px] text-[#EADCC8]/60 font-mono">Faixa:</span>
                    {Array.from({ length: totalBatches }).map((_, bIdx) => {
                      const bStart = bIdx * batchSize + 1;
                      const bEnd = Math.min(totalEpisodes ?? 0, (bIdx + 1) * batchSize);
                      const isActive = activeEpisodeBatch === bIdx;
                      return (
                        <button
                          key={bIdx}
                          onClick={() => setActiveEpisodeBatch(bIdx)}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition ${
                            isActive
                              ? "bg-[#FFC766] text-[#0B0B0D] font-bold"
                              : "bg-[#23232A] text-[#EADCC8] hover:text-white"
                          }`}
                        >
                          {bStart}-{bEnd}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* LISTAGEM DE EPISÓDIOS: Scroll interno contido, tela nunca rola */}
              <div className="flex-1 overflow-y-auto no-scrollbar pr-1 min-h-0">
                {episodeViewMode === "cards" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {currentBatchEpisodes.map((epNum) => {
                      const progress = progressMap[epNum];
                      const episodeSeasonId = seasonsList[selectedSeasonIdx]?.entityId ?? ((anime.seasons?.length ?? 0) === 0 && selectedSeasonIdx === 0 ? anime.seasonEntityId : undefined);
                      const episodeBookmarked = Boolean(episodeSeasonId && isEpisodeBookmarked(bookmarkItems,epNum,episodeSeasonId));
                      const isCompleted = progress?.completed;
                      const inProgress = progress && !progress.completed && progress.watchedSeconds > 0;

                      const handleEpisodeClick = () => {
                        if (!isPlayerEnabledOnEpisodes) {
                          if (validStreamingLinks.length > 0) {
                            window.open(validStreamingLinks[0].url, "_blank");
                          } else {
                            window.open(`https://www.google.com/search?q=${encodeURIComponent((anime.title_english || anime.title) + " assistir online oficial")}`, "_blank");
                          }
                          return;
                        }
                        onPlayEpisode(anime, epNum, selectedSeasonIdx);
                      };

                      const officialProvider = validStreamingLinks[0]?.site || "Oficial";

                      return (
                        <div
                          key={epNum}
                          onClick={handleEpisodeClick}
                          className="group p-2.5 rounded-2xl bg-[#141418] border border-[#3A3A43] hover:border-[#FFC766] transition-all cursor-pointer flex items-center justify-between gap-2.5 shadow-sm hover:bg-[#1A1A1F]"
                          title={!isPlayerEnabledOnEpisodes ? (validStreamingLinks.length > 0 ? `Canal oficial ${validStreamingLinks[0].site}` : `Episódio ${epNum}`) : `Reproduzir Episódio ${epNum}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Miniatura do Episódio com Play Overlay */}
                            <div className="relative w-14 h-11 rounded-xl overflow-hidden bg-[#0B0B0D] flex-none border border-[#3A3A43]/50">
                              <img
                                src={currentSeason.cover || posterCover}
                                alt={`Episódio ${epNum}`}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-[#FFC766]/20 transition-colors">
                                {!isPlayerEnabledOnEpisodes ? (
                                  <ExternalLink className="w-3.5 h-3.5 text-white group-hover:text-[#FFC766] transition-colors" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 text-white group-hover:text-[#FFC766] fill-current transition-colors" />
                                )}
                              </div>
                              {isCompleted && (
                                <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5 shadow">
                                  <Check className="w-2 h-2 text-black stroke-[3]" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition-colors">
                                  Episódio {epNum}
                                </span>
                                {isCompleted && (
                                  <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                                    CONCLUÍDO
                                  </span>
                                )}
                                {inProgress && (
                                  <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-400">
                                    PAUSADO
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-[#EADCC8]/60 font-mono">
                                <span className="text-emerald-400 font-bold flex items-center gap-1" title="Distribuidor licenciado">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                  <span>{officialProvider}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-none">
                            {user && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isAniriumPlus) {
                                    switchLevel(2);
                                    return;
                                  }
                                  if (!episodeSeasonId) return;
                                  toggleEntityBookmark("EPISODE", episodeSeasonId, anime.mal_id, selectedSeasonIdx, epNum, episodeSeasonId);
                                }}
                                className={`w-7 h-7 rounded-full border flex items-center justify-center transition shadow ${
                                  episodeBookmarked
                                    ? "bg-[#E5484D]/20 text-[#E5484D] border-[#E5484D]/40"
                                    : "bg-[#23232A] text-[#EADCC8]/60 border-[#3A3A43] hover:text-[#FFF9F0] hover:border-[#FFC766]/50"
                                }`}
                                title={
                                  !isAniriumPlus
                                    ? "Favoritar episódio é exclusivo Anirium+"
                                    : episodeBookmarked
                                    ? "Remover episódio dos favoritos"
                                    : "Favoritar este episódio"
                                }
                              >
                                <Heart
                                  className={`w-3 h-3 ${
                                    episodeBookmarked
                                      ? "fill-[#E5484D] text-[#E5484D]"
                                      : ""
                                  }`}
                                />
                              </button>
                            )}

                            <button
                              className="w-7 h-7 rounded-full bg-[#23232A] group-hover:bg-[#FFC766] text-[#EADCC8] group-hover:text-[#0B0B0D] flex items-center justify-center transition shadow"
                              title={!isPlayerEnabledOnEpisodes ? `Abrir em ${officialProvider}` : `Reproduzir Episódio ${epNum}`}
                            >
                              {!isPlayerEnabledOnEpisodes ? (
                                <ExternalLink className="w-3 h-3" />
                              ) : (
                                <Play className="w-3 h-3 fill-current ml-0.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Modo Grade Rápida */
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
                    {currentBatchEpisodes.map((epNum) => {
                      const progress = progressMap[epNum];
                      const episodeSeasonId = seasonsList[selectedSeasonIdx]?.entityId ?? ((anime.seasons?.length ?? 0) === 0 && selectedSeasonIdx === 0 ? anime.seasonEntityId : undefined);
                      const episodeBookmarked = Boolean(episodeSeasonId && isEpisodeBookmarked(bookmarkItems,epNum,episodeSeasonId));
                      const isCompleted = progress?.completed;
                      const inProgress = progress && !progress.completed && progress.watchedSeconds > 0;

                      const handleGridClick = () => {
                        if (!isPlayerEnabledOnEpisodes) {
                          if (validStreamingLinks.length > 0) {
                            window.open(validStreamingLinks[0].url, "_blank");
                          } else {
                            window.open(`https://www.google.com/search?q=${encodeURIComponent((anime.title_english || anime.title) + " assistir online oficial")}`, "_blank");
                          }
                          return;
                        }
                        onPlayEpisode(anime, epNum, selectedSeasonIdx);
                      };

                      return (
                        <button
                          key={epNum}
                          onClick={handleGridClick}
                          title={!isPlayerEnabledOnEpisodes ? (validStreamingLinks.length > 0 ? `Canal oficial ${validStreamingLinks[0].site}` : `Episódio ${epNum}`) : `Reproduzir Episódio ${epNum}`}
                          className={`h-11 rounded-xl text-xs font-mono font-bold transition-all flex flex-col items-center justify-center border shadow-sm active:scale-95 group ${
                            isCompleted
                              ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/40 hover:border-emerald-500"
                              : inProgress
                              ? "bg-amber-950/60 text-amber-300 border-amber-800/40 hover:border-amber-500"
                              : "bg-[#141418] text-[#EADCC8] border-[#3A3A43] hover:border-[#FFC766] hover:text-white"
                          }`}
                        >
                          <span className="group-hover:scale-110 transition-transform">
                            {epNum}
                          </span>
                          {isCompleted && (
                            <span className="text-[8px] text-emerald-400 font-sans font-normal">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== VIEW 3: TRAILER OFICIAL ==================== */}
          {currentView === "trailer" && anime.trailer?.youtube_id && (
            <div className="flex-1 flex flex-col p-4 sm:p-8 space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-[#3A3A43]/60 pb-4">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#FFF9F0] flex items-center gap-2">
                    <Film className="w-5 h-5 text-[#FFC766]" />
                    <span>Trailer Oficial Promocional</span>
                  </h2>
                  <p className="text-xs text-[#EADCC8]/60 mt-0.5">
                    {anime.title_portuguese || anime.title_english || anime.title}
                  </p>
                </div>
              </div>

              <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-[#3A3A43] shadow-2xl bg-black flex-1 min-h-[300px]">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${anime.trailer.youtube_id}?autoplay=1`}
                  title={`${anime.title} Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
