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
  const { tokens, strings } = useDesignTheme();
  const [visibleCount, setVisibleCount] = React.useState(36);

  // Quando a lista muda (busca ou novo filtro), reseta a janela visível inicial
  React.useEffect(() => {
    setVisibleCount(36);
  }, [animes.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Se o usuário rolou até próximo do final (200px da borda), carrega mais 36 cards
    if (target.scrollLeft + target.clientWidth >= target.scrollWidth - 300) {
      if (visibleCount < animes.length) {
        setVisibleCount((prev) => Math.min(prev + 36, animes.length));
      }
    }
  };

  const visibleAnimes = animes.slice(0, visibleCount);

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
          {animes.length} {strings.labels.worksCount}
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>

      {/* Trilho Horizontal com Scroll Fluido e Carga Contínua */}
      <div
        onScroll={handleScroll}
        className="flex items-center gap-4 overflow-x-auto pb-4 pt-1 px-1 no-scrollbar scroll-smooth"
      >
        {visibleAnimes.map((anime) => (
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
