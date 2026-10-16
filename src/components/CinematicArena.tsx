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
  const { strings } = useDesignTheme();
  const { user, level: tier, bookmarks, toggleEntityBookmark } = useUser();
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);

  if (!anime) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-600 font-mono text-xs">
        SELECIONE UMA OBRA NA ESTEIRA
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
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/60 to-transparent pointer-events-none" />

      {/* 2. Palco da Arena (Modo Foco ou Modo Dividido Fluido) */}
      <div className="relative z-10 w-full max-w-7xl h-full flex items-center gap-6">
        {/* Lado Esquerdo / Foco Principal */}
        <div className={`transition-all duration-500 ease-out flex flex-col justify-center ${isSplitMode ? "w-full md:w-5/12" : "w-full max-w-3xl"}`}>
          {/* Tag de Formato e Nota Canônica */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
              {anime.format || "SÉRIE TV"}
            </span>
            {anime.score && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400">
                <Star className="w-3 h-3 fill-amber-400" />
                <span>{anime.score.toFixed(1)}</span>
              </span>
            )}
            <span className="text-zinc-500">•</span>
            <span className="text-[11px] font-mono text-zinc-400">{anime.year || "Canônico"}</span>
          </div>

          {/* Título Monumental */}
          <h1 className="font-serif text-2xl sm:text-4xl font-extrabold text-white leading-tight drop-shadow-md line-clamp-2">
            {anime.title_portuguese || anime.title_english || anime.title}
          </h1>

          {/* Sinopse Reduzida com Tooltip */}
          <p className="text-xs sm:text-sm text-zinc-300/80 line-clamp-2 sm:line-clamp-3 mt-2 font-normal leading-relaxed">
            {anime.synopsis || "Metadados factuais canônicos registrados no sistema."}
          </p>

          {/* Ações Cinemáticas do Palco */}
          <div className="flex items-center gap-3 mt-5 flex-wrap">
            <button
              onClick={() => onPlayEpisode(anime, 1, 0)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>{strings.actions.play}</span>
            </button>

            <button
              onClick={() => setIsSplitMode(!isSplitMode)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 text-white font-semibold text-xs transition"
            >
              <span>{isSplitMode ? "Fechar Episódios" : "Ver Episódios"}</span>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSplitMode ? "rotate-90" : ""}`} />
            </button>

            <Tooltip text={isBookmarked ? "Remover dos Favoritos" : "Favoritar Obra"} position="bottom">
              <button
                onClick={() => toggleEntityBookmark("SERIES", `anime-${anime.mal_id}`, anime.mal_id)}
                className={`p-2.5 rounded-xl border transition ${
                  isBookmarked
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                    : "bg-zinc-900/80 text-zinc-400 border-zinc-700/80 hover:text-white"
                }`}
              >
                <Heart className={`w-4 h-4 ${isBookmarked ? "fill-rose-400" : ""}`} />
              </button>
            </Tooltip>

            <button
              onClick={() => onOpenDetails(anime)}
              className="p-2.5 rounded-xl bg-zinc-900/80 text-zinc-400 hover:text-white border border-zinc-700/80 transition"
              title="Mais Informações"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lado Direito: Linha do Tempo de Episódios na Arena Dividida */}
        {isSplitMode && (
          <div className="hidden md:flex flex-1 h-[75%] bg-black/60 backdrop-blur-xl border border-zinc-800 rounded-3xl p-4 flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-3">
              <span className="text-xs font-mono font-bold text-amber-400">CRONOLOGIA DE EPISÓDIOS ({totalEps})</span>
              <button onClick={() => setIsSplitMode(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 lg:grid-cols-3 gap-2 pr-1">
              {Array.from({ length: Math.min(totalEps, 24) }).map((_, idx) => {
                const epNum = idx + 1;
                return (
                  <button
                    key={epNum}
                    onClick={() => onPlayEpisode(anime, epNum, selectedSeasonIdx)}
                    className="p-2.5 rounded-xl bg-zinc-900/70 hover:bg-amber-400/10 border border-zinc-800 hover:border-amber-400/50 transition flex items-center justify-between text-left group"
                  >
                    <div>
                      <span className="text-[10px] font-mono text-zinc-400 block">EPISÓDIO</span>
                      <span className="text-xs font-bold text-white group-hover:text-amber-300">#{epNum}</span>
                    </div>
                    <Play className="w-3.5 h-3.5 text-zinc-600 group-hover:text-amber-400 group-hover:fill-amber-400" />
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
