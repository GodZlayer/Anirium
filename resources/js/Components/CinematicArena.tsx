import React from "react";
import { Play, Info, Bookmark, Sparkles, Star, Calendar } from "lucide-react";
import { AnimeRecord } from "./AnimeCard";
import { useDesignTheme } from "../context/ThemeContext";

interface CinematicArenaProps {
  anime: AnimeRecord | null;
  onPlay?: (anime: AnimeRecord) => void;
  onToggleBookmark?: (anime: AnimeRecord) => void;
  isBookmarked?: boolean;
}

export function CinematicArena({
  anime,
  onPlay,
  onToggleBookmark,
  isBookmarked = false,
}: CinematicArenaProps) {
  const { tokens, strings, getLocalizedTitle, getLocalizedSynopsis } = useDesignTheme();

  if (!anime) {
    return (
      <div
        className="w-full h-80 rounded-3xl border flex items-center justify-center p-8 text-center"
        style={{
          backgroundColor: tokens.colors.bgSurface,
          borderColor: tokens.colors.borderDefault,
        }}
      >
        <span className="text-sm font-semibold tracking-wider uppercase opacity-60" style={{ color: tokens.colors.textMuted }}>
          {strings.labels.selectAnimeFromTrack}
        </span>
      </div>
    );
  }

  const localizedTitle = getLocalizedTitle(anime);
  const localizedSynopsis = getLocalizedSynopsis(anime);

  return (
    <div
      className="relative w-full h-[380px] rounded-3xl overflow-hidden border transition-all duration-700 shadow-2xl flex flex-col justify-end p-8"
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      {/* Background Banner com Efeito Parallax Estilizado */}
      <div className="absolute inset-0 z-0">
        <img
          src={anime.banner_image || anime.cover_image}
          alt={localizedTitle}
          className="w-full h-full object-cover object-center filter brightness-90 contrast-105"
        />
        {/* Degradê Canônico Multi-Camadas com Abertura para Tokens */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to top, ${tokens.colors.bgSurface} 0%, ${tokens.colors.bgSurface}B3 55%, transparent 100%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, ${tokens.colors.bgSurface}E6 0%, transparent 60%, ${tokens.colors.bgSurface}66 100%)`,
          }}
        />
      </div>

      {/* Conteúdo Overlay */}
      <div className="relative z-10 max-w-2xl flex flex-col gap-3">
        {/* Badges de Metadados e Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-md border"
            style={{
              backgroundColor: tokens.colors.bgOverlay,
              color: tokens.colors.accentGold,
              borderColor: tokens.colors.accentGold,
            }}
          >
            <Sparkles className="w-3 h-3 fill-current" />
            {strings.labels.highlightTitle}
          </span>

          {anime.score && (
            <span
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md border"
              style={{
                backgroundColor: tokens.colors.bgOverlay,
                color: tokens.colors.textPrimary,
                borderColor: tokens.colors.borderDefault,
              }}
            >
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {anime.score.toFixed(1)} {strings.labels.score}
            </span>
          )}

          <span
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-md border"
            style={{
              backgroundColor: tokens.colors.bgOverlay,
              color: tokens.colors.textMuted,
              borderColor: tokens.colors.borderDefault,
            }}
          >
            <Calendar className="w-3 h-3" />
            {strings.labels.year}
          </span>
        </div>

        {/* Título Principal Reativo ao Idioma */}
        <h1
          className="text-3xl lg:text-4xl font-black tracking-tight drop-shadow-md line-clamp-1"
          style={{ color: tokens.colors.textPrimary }}
        >
          {localizedTitle}
        </h1>

        {/* Sinopse Dinâmica Regionalizada */}
        <p
          className="text-xs lg:text-sm line-clamp-2 leading-relaxed drop-shadow"
          style={{ color: tokens.colors.textSecondary }}
        >
          {localizedSynopsis}
        </p>

        {/* Controles de Ação Primária */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => onPlay?.(anime)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider shadow-xl transition-all duration-300 hover:scale-105 cursor-pointer"
            style={{
              backgroundColor: tokens.colors.accentGold,
              color: tokens.colors.bgBase,
            }}
          >
            <Play className="w-4 h-4 fill-current" />
            {strings.actions.play}
          </button>

          <button
            onClick={() => onToggleBookmark?.(anime)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-xs border backdrop-blur-md transition-all duration-300 hover:bg-white/10 cursor-pointer"
            style={{
              backgroundColor: tokens.colors.bgOverlay,
              borderColor: isBookmarked ? tokens.colors.accentGold : tokens.colors.borderDefault,
              color: isBookmarked ? tokens.colors.accentGold : tokens.colors.textPrimary,
            }}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-current" : ""}`} />
            {isBookmarked ? strings.actions.removeFromFavorites : strings.actions.addToFavorites}
          </button>
        </div>
      </div>
    </div>
  );
}
