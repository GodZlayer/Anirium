import React from "react";
import { Play, Bookmark, Star, Clock } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";

export interface AnimeRecord {
  id: number;
  mal_id?: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_portuguese?: string;
  synopsis?: string;
  score?: number;
  episodes_count?: number;
  status?: string;
  banner_image?: string;
  cover_image?: string;
}

interface AnimeCardProps {
  anime: AnimeRecord;
  isActive?: boolean;
  onSelect?: () => void;
  onPlay?: () => void;
  onToggleBookmark?: () => void;
  isBookmarked?: boolean;
}

export function AnimeCard({
  anime,
  isActive = false,
  onSelect,
  onPlay,
  onToggleBookmark,
  isBookmarked = false,
}: AnimeCardProps) {
  const { tokens, strings, getLocalizedTitle } = useDesignTheme();
  const localizedTitle = getLocalizedTitle(anime);

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col flex-shrink-0 w-44 rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer ${
        isActive ? "scale-105 shadow-xl ring-2" : "hover:-translate-y-1.5 hover:shadow-lg"
      }`}
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: isActive ? tokens.colors.borderHighlight : tokens.colors.borderDefault,
      }}
    >
      {/* Imagem do Poster */}
      <div className="relative w-full h-60 overflow-hidden bg-black/40">
        <img
          src={anime.cover_image || anime.banner_image || "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80"}
          alt={localizedTitle}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-108"
        />

        {/* Gradiente de Fusão */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {/* Badge de Nota Canônica */}
        {anime.score && (
          <div
            className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black backdrop-blur-md"
            style={{
              backgroundColor: tokens.colors.bgOverlay,
              color: tokens.colors.accentGold,
              border: `1px solid ${tokens.colors.borderDefault}`,
            }}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>{anime.score.toFixed(1)}</span>
          </div>
        )}

        {/* Ação Rápida de Favoritar */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark?.();
          }}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-full backdrop-blur-md border transition-all duration-200 cursor-pointer"
          style={{
            backgroundColor: tokens.colors.bgOverlay,
            borderColor: isBookmarked ? tokens.colors.accentGold : tokens.colors.borderDefault,
            color: isBookmarked ? tokens.colors.accentGold : tokens.colors.textMuted,
          }}
          title={isBookmarked ? strings.actions.removeFromFavorites : strings.actions.addToFavorites}
        >
          <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-current" : ""}`} />
        </button>

        {/* Botão Flutuante de Play Rápido */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
            className="p-3 rounded-full shadow-2xl transition-transform duration-300 hover:scale-110 cursor-pointer"
            style={{
              backgroundColor: tokens.colors.accentGold,
              color: tokens.colors.bgBase,
            }}
            title={strings.actions.play}
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
        </div>
      </div>

      {/* Metadados do Card */}
      <div className="p-3 flex flex-col justify-between flex-1">
        <h4
          className="text-xs font-bold line-clamp-1 group-hover:underline"
          style={{ color: tokens.colors.textPrimary }}
          title={localizedTitle}
        >
          {localizedTitle}
        </h4>

        <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: tokens.colors.borderDefault }}>
          <span className="text-[10px] flex items-center gap-1 font-medium" style={{ color: tokens.colors.textMuted }}>
            <Clock className="w-2.5 h-2.5" />
            {anime.episodes_count ? `${anime.episodes_count} ${strings.labels.episode}` : strings.labels.format}
          </span>
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `${tokens.colors.accentGold}15`,
              color: tokens.colors.accentGold,
            }}
          >
            {anime.status === "RELEASING" ? strings.labels.releasing : strings.labels.completed}
          </span>
        </div>
      </div>
    </div>
  );
}
