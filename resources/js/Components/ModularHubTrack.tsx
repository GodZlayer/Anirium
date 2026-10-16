import React from "react";
import { ChevronRight } from "lucide-react";
import { AnimeCard, AnimeRecord } from "./AnimeCard";
import { useDesignTheme } from "../context/ThemeContext";

interface ModularHubTrackProps {
  title: string;
  animes: AnimeRecord[];
  activeAnimeId?: number;
  onSelectAnime?: (anime: AnimeRecord) => void;
  onPlayAnime?: (anime: AnimeRecord) => void;
  onToggleBookmark?: (anime: AnimeRecord) => void;
  bookmarkedIds?: number[];
}

export function ModularHubTrack({
  title,
  animes,
  activeAnimeId,
  onSelectAnime,
  onPlayAnime,
  onToggleBookmark,
  bookmarkedIds = [],
}: ModularHubTrackProps) {
  const { tokens } = useDesignTheme();

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Cabeçalho da Esteira */}
      <div className="flex items-center justify-between px-1">
        <h3
          className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5"
          style={{ color: tokens.colors.accentGold }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tokens.colors.accentGold }} />
          {title}
        </h3>
        <span
          className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          style={{ color: tokens.colors.textMuted }}
        >
          {animes.length} Obras
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>

      {/* Trilho Horizontal com Scroll Invisível */}
      <div className="flex items-center gap-4 overflow-x-auto pb-4 pt-1 px-1 no-scrollbar scroll-smooth">
        {animes.map((anime) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            isActive={activeAnimeId === anime.id}
            onSelect={() => onSelectAnime?.(anime)}
            onPlay={() => onPlayAnime?.(anime)}
            onToggleBookmark={() => onToggleBookmark?.(anime)}
            isBookmarked={bookmarkedIds.includes(anime.id)}
          />
        ))}
      </div>
    </div>
  );
}
