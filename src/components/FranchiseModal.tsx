"use client";

import ModalDialog from "./ModalDialog";

import React, { useState, useMemo } from "react";
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
  Clock,
  Sparkles,
  Trophy,
  Network,
  CheckCircle2,
} from "lucide-react";
import { Anime, CanonicalFranchise } from "@/types/anime";
import { FranchiseGroup } from "@/lib/franchiseUtils";
import { useUser } from "@/context/UserContext";

interface FranchiseModalProps {
  franchise: FranchiseGroup | CanonicalFranchise | null;
  onClose: () => void;
  onSelectAnime: (anime: Anime) => void;
  onPlayEpisode: (anime: Anime, episodeNum: number, seasonIdx: number) => void;
}

export default function FranchiseModal({
  franchise,
  onClose,
  onSelectAnime,
  onPlayEpisode,
}: FranchiseModalProps) {
  if (!franchise) return null;
  return <FranchiseDetails franchise={franchise} onClose={onClose} onSelectAnime={onSelectAnime} onPlayEpisode={onPlayEpisode} />;
}

function FranchiseDetails({ franchise, onClose, onSelectAnime, onPlayEpisode }: Omit<FranchiseModalProps, "franchise"> & { franchise: NonNullable<FranchiseModalProps["franchise"]> }) {
  const { user, hasPlayerAddon } = useUser();
  const [selectedFormat, setSelectedFormat] = useState<string>("ALL");

  const rep = franchise.representativeAnime;
  const franchiseTitle =
    franchise.rootTitle || franchise.title_portuguese || franchise.title_english || rep.title;

  const backdrop =
    rep.banner_image ||
    rep.images?.webp?.large_image_url ||
    rep.images?.jpg?.large_image_url;

  // Lista de produções do universo
  const productionsList = useMemo(() => {
    if (franchise.memberAnimes && franchise.memberAnimes.length > 0) {
      return franchise.memberAnimes;
    }
    if (rep.seasons && rep.seasons.length > 0) {
      return rep.seasons.map((s) => ({
        ...rep,
        mal_id: s.id || rep.mal_id,
        title: s.title,
        format: s.format,
        year: s.year || rep.year,
        episodes: s.episodes,
        status: s.status,
        images: {
          ...rep.images,
          webp: { ...rep.images.webp, large_image_url: s.cover || rep.images.webp?.large_image_url },
        },
      }));
    }
    return [rep];
  }, [franchise, rep]);

  // Filtros de formato
  const filteredProductions = useMemo(() => {
    if (selectedFormat === "ALL") return productionsList;
    return productionsList.filter((prod) => {
      const f = (prod.format || "TV").toUpperCase();
      if (selectedFormat === "TV") return f === "TV" || f === "TV_SHORT";
      if (selectedFormat === "MOVIE") return f === "MOVIE";
      if (selectedFormat === "OVA") return f === "OVA" || f === "ONA";
      if (selectedFormat === "SPECIAL") return f === "SPECIAL" || f === "SPINOFF";
      return f === selectedFormat;
    });
  }, [productionsList, selectedFormat]);

  return (
    <ModalDialog
      label={franchiseTitle}
      onClose={onClose}
      className="p-0 fixed inset-0 z-50 w-screen h-screen bg-[#0B0B0D] text-[#FFF9F0] flex flex-col overflow-hidden select-none animate-in fade-in duration-150"
    >
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <div className="h-14 flex-none border-b border-[#3A3A43]/60 px-4 sm:px-6 flex items-center justify-between bg-[#141418]/95 backdrop-blur-md z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A1A1F] hover:bg-[#23232A] text-[#FFF9F0] border border-[#3A3A43] transition text-xs font-semibold shadow-sm shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FFC766]" />
              <span>Voltar</span>
            </button>

            <span className="text-[#3A3A43] shrink-0">•</span>

            {/* Breadcrumb da Franquia */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFC766]/15 border border-[#FFC766]/40 text-xs font-mono text-[#FFC766] font-bold shadow-sm shrink-0">
              <Network className="w-3.5 h-3.5 text-[#FFC766]" />
              <span className="truncate max-w-[150px] sm:max-w-none">{franchiseTitle}</span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-[#3A3A43] shrink-0" />

            {/* Obra Principal */}
            <button
              onClick={() => onSelectAnime(rep)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A1A1F] hover:bg-[#23232A] border border-[#3A3A43] text-xs font-semibold text-[#EADCC8] hover:text-[#FFF9F0] transition shadow-sm shrink-0"
              title="Abrir Obra Principal"
            >
              <Info className="w-3.5 h-3.5 text-[#FFC766]" />
              <span className="truncate max-w-[120px] sm:max-w-[180px]">
                {rep.title_portuguese || rep.title_english || rep.title}
              </span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#1A1A1F]/80 hover:bg-[#23232A] border border-[#3A3A43] flex items-center justify-center text-[#EADCC8] hover:text-[#FFF9F0] transition shadow-lg shrink-0"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport Full Content: Split-View 2 Colunas Sem Scroll da Janela */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0 bg-[#0E0E12]">
          {/* Coluna Esquerda (5 colunas): Hero da Franquia & Ações */}
          <div className="lg:col-span-5 relative flex flex-col justify-between p-6 sm:p-8 overflow-hidden border-b lg:border-b-0 lg:border-r border-[#3A3A43]/60 bg-gradient-to-b from-[#141418] via-[#0B0B0D] to-[#0B0B0D]">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <img
                src={backdrop}
                alt={franchiseTitle}
                className="w-full h-full object-cover object-center filter brightness-[0.25] blur-sm scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/85 to-transparent" />
              <div className="absolute inset-0 bg-[#0B0B0D]/60" />
            </div>

            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-[#0B0B0D] font-bold bg-[#FFC766] px-2.5 py-0.5 rounded-full shadow font-mono text-[11px]">
                  <Trophy className="w-3 h-3 fill-current" />
                  <span>Nota Geral: {franchise.averageScore ? franchise.averageScore.toFixed(1) : "—"}</span>
                </span>

                <span className="text-[#EADCC8] bg-[#1A1A1F]/80 px-2.5 py-0.5 rounded-full border border-[#3A3A43] font-mono text-[11px]">
                  {franchise.yearsRange || "Anos Ativos"}
                </span>

                <span className="text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/30 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold">
                  {franchise.worksCount} Produções
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-mono text-[#FFC766] uppercase tracking-wider">
                  Universo Narrativo
                </span>
                <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#FFF9F0] leading-tight drop-shadow-lg">
                  {franchiseTitle}
                </h1>
              </div>

              <div className="bg-[#1A1A1F]/60 backdrop-blur-sm border border-[#3A3A43]/60 rounded-2xl p-4">
                <p className="text-xs text-[#EADCC8]/90 leading-relaxed line-clamp-4 lg:line-clamp-6">
                  {rep.synopsis || "Universo canônico consolidado com todas as suas obras, arcos e lançamentos correlatos."}
                </p>
              </div>
            </div>

            {/* Ações Rápidas */}
            <div className="relative z-10 pt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onSelectAnime(rep)}
                className="flex items-center gap-2 font-bold px-5 py-2.5 rounded-full bg-gradient-to-r from-[#FFC766] to-[#FFB347] text-[#0B0B0D] shadow-xl shadow-[#FFC766]/20 active:scale-95 hover:brightness-110 transition text-xs sm:text-sm"
                title="Ver detalhes da obra principal"
              >
                <Info className="w-4 h-4" />
                <span>Obra Principal</span>
              </button>

              {!user || !hasPlayerAddon ? (
                rep.streaming_links && rep.streaming_links.length > 0 ? (
                  <a
                    href={rep.streaming_links[0].url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-[#1A1A1F]/90 hover:bg-[#23232A] text-emerald-400 border border-emerald-500/40 font-semibold px-4 py-2.5 rounded-full active:scale-95 transition text-xs sm:text-sm shadow-md"
                    title={`Assistir oficial em ${rep.streaming_links[0].site}`}
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Oficial ({rep.streaming_links[0].site})</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </a>
                ) : (
                  <button
                    onClick={() => onSelectAnime(rep)}
                    className="flex items-center gap-2 bg-[#1A1A1F]/90 hover:bg-[#23232A] text-[#FFF9F0] border border-[#3A3A43] font-semibold px-4 py-2.5 rounded-full active:scale-95 transition text-xs sm:text-sm shadow-md"
                  >
                    <Tv className="w-4 h-4 text-[#FFC766]" />
                    <span>Ver Obra</span>
                  </button>
                )
              ) : (
                <button
                  onClick={() => onPlayEpisode(rep, 1, 0)}
                  className="flex items-center gap-2 bg-[#1A1A1F]/90 hover:bg-[#23232A] text-[#FFF9F0] border border-[#3A3A43] font-semibold px-4 py-2.5 rounded-full active:scale-95 transition text-xs sm:text-sm shadow-md"
                >
                  <Play className="w-4 h-4 fill-current text-[#FFC766]" />
                  <span>Assistir Início</span>
                </button>
              )}
            </div>
          </div>

          {/* Coluna Direita (7 colunas): Cronologia & Árvore Genealógica */}
          <div className="lg:col-span-7 flex flex-col p-6 sm:p-8 overflow-hidden min-h-0 bg-[#0E0E12]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#3A3A43]/60 flex-none">
              <div>
                <h3 className="font-serif text-sm sm:text-base font-bold text-[#FFF9F0] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#FFC766]" />
                  <span>Cronologia & Linhagem da Franquia</span>
                </h3>
                <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                  Todas as produções em ordem canônica de lançamento e continuidade.
                </p>
              </div>

              {/* Filtro por Formato */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {["ALL", "TV", "MOVIE", "OVA"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setSelectedFormat(fmt)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                      selectedFormat === fmt
                        ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                        : "bg-[#1A1A1F] text-[#EADCC8] hover:text-white border border-[#3A3A43]"
                    }`}
                  >
                    {fmt === "ALL" ? "Todas" : fmt === "TV" ? "Séries TV" : fmt === "MOVIE" ? "Filmes" : "OVAs"}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de Produções da Franquia no Viewport Restante */}
            <div className="flex-1 overflow-y-auto no-scrollbar pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 py-3 min-h-0">
              {filteredProductions.map((prod, idx) => {
                const cover =
                  prod.images?.webp?.large_image_url ||
                  prod.images?.jpg?.large_image_url;

                return (
                  <div
                    key={prod.mal_id || idx}
                    onClick={() => onSelectAnime(prod)}
                    className="p-2.5 rounded-2xl bg-[#141418] border border-[#3A3A43] hover:border-[#FFC766] transition cursor-pointer flex items-center justify-between gap-3 shadow-sm hover:bg-[#1A1A1F] group h-fit"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-[#0B0B0D] flex-none">
                        <img
                          src={cover}
                          alt={prod.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute top-0 left-0 bg-black/80 px-1 py-0.2 text-[8px] font-mono text-[#FFC766] font-bold rounded-br">
                          #{idx + 1}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-[#0B0B0D] text-[#FFC766] border border-[#FFC766]/30 font-bold">
                            {prod.format || "TV"}
                          </span>
                          {prod.year && (
                            <span className="text-[9px] text-[#EADCC8]/60 font-mono">
                              {prod.year}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-[#FFF9F0] group-hover:text-[#FFC766] truncate transition-colors">
                          {prod.title_portuguese || prod.title_english || prod.title}
                        </h4>
                        <p className="text-[10px] text-[#EADCC8]/60 mt-0.5 font-mono">
                          {prod.episodes ? `${prod.episodes} episódios` : "Longa-metragem"}
                        </p>
                      </div>
                    </div>

                    <div className="w-7 h-7 rounded-full bg-[#23232A] group-hover:bg-[#FFC766] text-[#EADCC8] group-hover:text-[#0B0B0D] flex items-center justify-center transition shadow flex-none">
                      <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}
