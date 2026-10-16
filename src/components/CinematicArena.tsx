"use client";

import React, { useState } from "react";
import { Play, Star, Info, ShieldCheck, Heart, Sparkles, ChevronRight, X } from "lucide-react";
import { Anime } from "@/types/anime";
import { useDesignTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import Tooltip from "./Tooltip";

interface CinematicArenaProps {
  anime: Anime | null;
  onPlayEpisode: (anime: Anime, episodeNum: number, seasonIdx: number) => void;
  onOpenDetails: (anime: Anime) => void;
}

/**
 * Arena Cinematográfica com Aura de Edge-Diffusion (~85 linhas)
 * - Foco ativo vivo com iluminação volumétrica derivada das bordas da imagem.
 * - Transição fluida: divide-se organicamente entre foco e episódios ao tocar em 'Episódios'.
 */
export default function CinematicArena({ anime, onPlayEpisode, onOpenDetails }: CinematicArenaProps) {
  const { strings, getLocalizedTitle, tokens } = useDesignTheme();
  const { user, level: tier, bookmarks, toggleEntityBookmark } = useUser();
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);

  if (!anime) {
    return (
      <div
        className="w-full h-full flex items-center justify-center font-mono text-xs select-none"
        style={{ color: "var(--color-text-muted)" }}
      >
        {strings.labels.selectAnimeFromTrack}
      </div>
    );
  }

  const poster =
    anime.images?.webp?.large_image_url ||
    anime.images?.jpg?.large_image_url ||
    anime.images?.jpg?.image_url ||
    "/assets/logos/Anirium-Persona-LogoArtistica.png";

  const banner = anime.banner_image || poster;
  const isBookmarked = bookmarks.includes(anime.mal_id);
  const totalEps = anime.episodes || 12;
  const activeTitle = getLocalizedTitle(anime);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Aura Edge-Diffusion Bloom (Projeção viva volumétrica dos pixels da borda da imagem) */}
      <div
        className="absolute inset-0 opacity-40 blur-3xl pointer-events-none transition-all duration-1000 scale-125"
        style={{
          backgroundImage: `url(${banner})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
          filter: "brightness(0.7) saturate(1.8)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, var(--color-bg-base) 0%, rgba(11,11,13,0.6) 60%, transparent 100%)",
        }}
      />

      {/* 2. Palco da Arena (Modo Foco ou Modo Dividido Fluido) */}
      <div className="relative z-10 w-full max-w-7xl h-full flex items-center gap-6">
        {/* Lado Esquerdo / Foco Principal */}
        <div className={`transition-all duration-500 ease-out flex flex-col justify-center ${isSplitMode ? "w-full md:w-5/12" : "w-full max-w-3xl"}`}>
          {/* Tag de Formato e Nota Canônica */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: "var(--color-bg-raised)",
                borderColor: "var(--color-border-highlight)",
                color: "var(--color-accent-gold)",
              }}
            >
              {anime.format || strings.labels.format}
            </span>
            {anime.score && (
              <span className="flex items-center gap-1 text-[11px] font-mono" style={{ color: "var(--color-accent-gold)" }}>
                <Star className="w-3 h-3 fill-current" />
                <span>{anime.score.toFixed(1)}</span>
              </span>
            )}
            <span style={{ color: "var(--color-text-muted)" }}>•</span>
            <span className="text-[11px] font-mono" style={{ color: "var(--color-text-muted)" }}>
              {anime.year || strings.labels.year}
            </span>
          </div>

          {/* Título Monumental Reativo ao Idioma */}
          <h1
            className="font-serif text-2xl sm:text-4xl font-extrabold leading-tight drop-shadow-md line-clamp-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            {activeTitle}
          </h1>

          {/* Sinopse Reduzida */}
          <p
            className="text-xs sm:text-sm line-clamp-2 sm:line-clamp-3 mt-2 font-normal leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {anime.synopsis || "Metadados canônicos registrados no catálogo oficial."}
          </p>

          {/* Ações Cinemáticas do Palco */}
          <div className="flex items-center gap-3 mt-5 flex-wrap">
            <button
              onClick={() => onPlayEpisode(anime, 1, 0)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition transform active:scale-95"
              style={{
                backgroundColor: "var(--color-accent-gold)",
                color: "#000000",
              }}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{strings.actions.play}</span>
            </button>

            <button
              onClick={() => setIsSplitMode(!isSplitMode)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-xs transition"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            >
              <span>{isSplitMode ? strings.actions.closeEpisodes : strings.actions.viewEpisodes}</span>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSplitMode ? "rotate-90" : ""}`} />
            </button>

            <Tooltip text={isBookmarked ? strings.actions.removeFromFavorites : strings.actions.addToFavorites} position="bottom">
              <button
                onClick={() => toggleEntityBookmark("SERIES", `anime-${anime.mal_id}`, anime.mal_id)}
                className="p-2.5 rounded-xl border transition"
                style={{
                  backgroundColor: isBookmarked ? "rgba(229, 72, 77, 0.2)" : "var(--color-bg-surface)",
                  borderColor: isBookmarked ? "#E5484D" : "var(--color-border-default)",
                  color: isBookmarked ? "#E5484D" : "var(--color-text-secondary)",
                }}
              >
                <Heart className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} />
              </button>
            </Tooltip>

            <button
              onClick={() => onOpenDetails(anime)}
              className="p-2.5 rounded-xl border transition"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-secondary)",
              }}
              title={strings.actions.details}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lado Direito: Linha do Tempo de Episódios na Arena Dividida */}
        {isSplitMode && (
          <div
            className="hidden md:flex flex-1 h-[75%] backdrop-blur-xl border rounded-3xl p-4 flex-col animate-in fade-in slide-in-from-right-4 duration-300"
            style={{
              backgroundColor: "var(--color-bg-overlay)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <div className="flex items-center justify-between border-b pb-2 mb-2" style={{ borderColor: "var(--color-border-default)" }}>
              <span className="text-xs font-mono font-bold" style={{ color: "var(--color-accent-gold)" }}>
                {strings.labels.chronology} {anime.seasons && anime.seasons.length > 1 ? `(T${selectedSeasonIdx + 1})` : `(${totalEps})`}
              </span>
              <button
                onClick={() => setIsSplitMode(false)}
                style={{ color: "var(--color-text-muted)" }}
                className="hover:opacity-80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Abas de Temporada caso existam */}
            {anime.seasons && anime.seasons.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-2 pb-1">
                {anime.seasons.map((s, sIdx) => (
                  <button
                    key={s.id || sIdx}
                    onClick={() => setSelectedSeasonIdx(sIdx)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition"
                    style={{
                      backgroundColor: selectedSeasonIdx === sIdx ? "var(--color-accent-gold)" : "var(--color-bg-raised)",
                      color: selectedSeasonIdx === sIdx ? "#000000" : "var(--color-text-muted)",
                    }}
                  >
                    T{s.seasonNumber || sIdx + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 lg:grid-cols-3 gap-2 pr-1">
              {Array.from({ length: Math.min((anime.seasons?.[selectedSeasonIdx]?.episodes) || totalEps, 48) }).map((_, idx) => {
                const epNum = idx + 1;
                return (
                  <button
                    key={epNum}
                    onClick={() => onPlayEpisode(anime, epNum, selectedSeasonIdx)}
                    className="p-2.5 rounded-xl border transition flex items-center justify-between text-left group"
                    style={{
                      backgroundColor: "var(--color-bg-surface)",
                      borderColor: "var(--color-border-default)",
                    }}
                  >
                    <div>
                      <span className="text-[10px] font-mono block" style={{ color: "var(--color-text-muted)" }}>
                        {strings.labels.episode.toUpperCase()}
                      </span>
                      <span className="text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>
                        #{epNum}
                      </span>
                    </div>
                    <Play className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:fill-current" style={{ color: "var(--color-accent-gold)" }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
