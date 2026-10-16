"use client";

import React from "react";
import { Star, Plus, Play, Sparkles } from "lucide-react";
import { Anime } from "@/types/anime";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";

interface AnimeCardProps {
  anime: Anime;
  onSelect: (anime: Anime) => void;
  onPlay?: (anime: Anime) => void;
  userProgress?: {
    episodeNumber?: number;
    completed?: boolean;
    progressPercent?: number;
  };
}

/**
 * Card de Anime 100% Modular e Stringado (TGCode Standard)
 * - Zero strings hardcoded: herda textos e paletas da ThemeContext.
 * - Formas e geometria intuitiva com micro-indicadores.
 * - Explicações completas em Tooltip on-demand.
 * - Suporte a feedback de progresso do usuário (Gamificação).
 */
export default function AnimeCard({
  anime,
  onSelect,
  onPlay,
  userProgress,
}: AnimeCardProps) {
  const { strings, getLocalizedTitle } = useDesignTheme();

  const seasonCover = anime.seasons?.[0]?.cover;
  const imageUrl =
    anime.images?.webp?.large_image_url ||
    anime.images?.jpg?.large_image_url ||
    anime.images?.jpg?.image_url ||
    seasonCover ||
    "/assets/logos/Anirium-Persona-LogoArtistica.png";

  const displayTitle = getLocalizedTitle(anime);
  const isAiring = anime.status?.toLowerCase().includes("airing") || anime.status?.toLowerCase().includes("releasing");

  return (
    <div
      onClick={() => onSelect(anime)}
      className="group relative flex-none w-[135px] sm:w-[160px] md:w-[180px] aspect-[2/3] rounded-2xl overflow-hidden bg-[var(--color-bg-surface,#1A1A1F)] border border-[var(--color-border-default,#3A3A43)]/60 hover:border-[var(--color-accent-gold,#FFC766)] cursor-pointer transition-all duration-300 transform hover:scale-[1.04] hover:z-20 hover:shadow-2xl hover:shadow-[var(--color-accent-gold,#FFC766)]/10"
    >
      {/* Imagem do Poster */}
      <img
        src={imageUrl}
        alt={displayTitle}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />

      {/* Vinheta de Gradiente */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-base,#0B0B0D)] via-transparent to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

      {/* Micro-Badges no topo com Tooltip on-demand */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-auto z-10">
        {anime.score ? (
          <Tooltip content={`Avaliação Geral: ${anime.score}/10`}>
            <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-bold text-[var(--color-accent-gold,#FFC766)] border border-[var(--color-accent-gold,#FFC766)]/30 shadow">
              <Star className="w-3 h-3 fill-[var(--color-accent-gold,#FFC766)] text-[var(--color-accent-gold,#FFC766)]" />
              <span>{anime.score}</span>
            </div>
          </Tooltip>
        ) : <div />}

        {isAiring && (
          <Tooltip content={strings.statusBadges.releasing}>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse border border-emerald-950 shadow" />
          </Tooltip>
        )}
      </div>

      {/* Barra de Progresso do Usuário (Gamificação / History) */}
      {userProgress?.progressPercent !== undefined && userProgress.progressPercent > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-800 z-10">
          <div
            className="h-full bg-[var(--color-accent-gold,#FFC766)] transition-all duration-300"
            style={{ width: `${Math.min(userProgress.progressPercent, 100)}%` }}
          />
        </div>
      )}

      {/* Conteúdo Overlay compacto */}
      <div className="absolute inset-x-0 bottom-0 p-3 z-10 flex flex-col justify-end">
        <h4 className="text-xs md:text-sm font-bold text-[var(--color-text-primary,#FFF9F0)] line-clamp-1 leading-snug">
          {displayTitle}
        </h4>

        {/* Linha de Metadados Mínimos com Tooltips */}
        <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400 font-medium">
          {anime.episodes && (
            <Tooltip content={`Total de episódios da obra: ${anime.episodes}`}>
              <span>{anime.episodes} eps</span>
            </Tooltip>
          )}

          {userProgress?.episodeNumber && (
            <Tooltip content={`Último episódio assistido: Ep. ${userProgress.episodeNumber}`}>
              <span className="text-[var(--color-accent-gold,#FFC766)] font-semibold">
                Ep. {userProgress.episodeNumber}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
