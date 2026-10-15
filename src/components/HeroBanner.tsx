"use client";

import React from "react";
import { ChevronRight, Play, Sparkles, Orbit, Compass, Calendar, Info } from "lucide-react";
import { Anime } from "@/types/anime";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";

interface HeroBannerProps {
  anime: Anime | null;
  onPlay: (anime: Anime) => void;
  onMoreInfo: (anime: Anime) => void;
  userLevel?: number;
}

/**
 * Hero Banner 100% Modular e Stringado (TGCode Standard)
 * - Lobby Viewport-First: visual enxuto que cabe na tela sem forçar scroll cego.
 * - Textos, labels e cores dinâmicos do dicionário de strings/tokens.
 * - Tooltips on-demand para contextualização completa.
 * - Movimento e ambientação fluida com aceleração por hardware.
 */
export default function HeroBanner({
  anime,
  onPlay,
  onMoreInfo,
  userLevel = 0,
}: HeroBannerProps) {
  const { strings } = useDesignTheme();

  const seasonCover = anime?.seasons?.[0]?.cover;
  const title =
    anime?.title_portuguese ||
    anime?.title_english ||
    anime?.title ||
    anime?.synonyms?.[0] ||
    anime?.franchise_root ||
    anime?.seasons?.[0]?.title ||
    strings.global.appName;

  const posterUrl =
    anime?.images?.webp?.large_image_url ||
    anime?.images?.jpg?.large_image_url ||
    anime?.images?.jpg?.image_url ||
    seasonCover ||
    "/assets/logos/Anirium-Persona-LogoArtistica.png";

  return (
    <section className="relative w-full pt-20 pb-8 sm:pt-24 sm:pb-10 md:pt-28 md:pb-12 px-4 md:px-8 select-none overflow-hidden">
      {/* Background Ambience & Glows Fluidos */}
      <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[var(--color-accent-gold,#FFC766)]/5 rounded-full blur-[140px] pointer-events-none transform -rotate-12" />
      <div className="absolute top-1/4 right-10 w-[400px] h-[400px] bg-[var(--color-accent-amber,#FFB347)]/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Grid Viewport-First com Proporção Otimizada */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
        {/* Coluna Esquerda: Marca e Tipografia Reduzida com Tooltips */}
        <div className="lg:col-span-7 space-y-4 z-10 text-left">
          {/* Badge de Nível e Gamificação On-Demand */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-bg-surface,#1A1A1F)] border border-[var(--color-border-default,#3A3A43)] text-xs font-mono tracking-wider text-[var(--color-accent-gold,#FFC766)] shadow">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent-gold,#FFC766)] animate-pulse" />
            <span>{strings.global.appName}</span>
            <span className="text-zinc-500">|</span>
            <Tooltip content={strings.gamification.levels[userLevel as keyof typeof strings.gamification.levels]?.tooltip || strings.global.appTagline}>
              <span className="cursor-help font-bold underline decoration-dotted decoration-[var(--color-accent-gold,#FFC766)]">
                {strings.gamification.levels[userLevel as keyof typeof strings.gamification.levels]?.name || strings.global.appTagline}
              </span>
            </Tooltip>
          </div>

          {/* Tipografia Principal Enxuta */}
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[var(--color-text-primary,#FFF9F0)] leading-[1.15]">
            Descubra. Conecte. <br />
            <span className="text-[var(--color-accent-gold,#FFC766)] italic">
              {title}
            </span>
          </h1>

          {/* Sinopse Reduzida com Tooltip On-Demand para leitura completa */}
          {anime?.synopsis && (
            <Tooltip content={anime.synopsis} className="w-full">
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary,#EADCC8)]/80 max-w-xl font-normal leading-relaxed line-clamp-2 cursor-help">
                {anime.synopsis}
              </p>
            </Tooltip>
          )}

          {/* Ações Primárias Gamificadas */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => anime && onPlay(anime)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[var(--color-accent-gold,#FFC766)] to-[var(--color-accent-amber,#FFB347)] text-[var(--color-bg-base,#0B0B0D)] font-bold text-xs sm:text-sm shadow-lg shadow-[var(--color-accent-gold,#FFC766)]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{strings.actions.play}</span>
            </button>

            <button
              onClick={() => anime && onMoreInfo(anime)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-bg-surface,#1A1A1F)] text-[var(--color-text-primary,#FFF9F0)] font-semibold text-xs sm:text-sm border border-[var(--color-border-default,#3A3A43)] hover:border-[var(--color-accent-gold,#FFC766)] hover:bg-[var(--color-bg-raised,#23232A)] transition-all"
            >
              <Info className="w-4 h-4 text-[var(--color-accent-gold,#FFC766)]" />
              <span>{strings.actions.details}</span>
            </button>
          </div>
        </div>

        {/* Coluna Direita: Showcase Visual Minimalista */}
        {posterUrl && (
          <div className="lg:col-span-5 relative flex justify-center lg:justify-end z-10">
            <div
              onClick={() => anime && onMoreInfo(anime)}
              className="relative w-[180px] sm:w-[220px] lg:w-[250px] aspect-[2/3] rounded-2xl overflow-hidden border border-[var(--color-border-default,#3A3A43)]/80 shadow-2xl hover:border-[var(--color-accent-gold,#FFC766)] cursor-pointer transition-all duration-300 transform hover:scale-105"
            >
              <img
                src={posterUrl}
                alt={title}
                className="w-full h-full object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-base,#0B0B0D)] via-transparent to-transparent opacity-60" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
