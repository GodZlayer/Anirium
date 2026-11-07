import React from "react";
import { ChevronRight } from "lucide-react";
import { AnimeCard, AnimeRecord } from "./AnimeCard";
import { useDesignTheme } from "../context/ThemeContext";

interface ModularHubTrackProps {
  title: string;
  animes: AnimeRecord[];
  activeAnimeId?: number | string;
  onSelectAnime?: (anime: AnimeRecord) => void;
  onPlayAnime?: (anime: AnimeRecord) => void;
  onToggleBookmark?: (anime: AnimeRecord) => void;
  bookmarkedIds?: Array<number | string>;
  /** Rótulo por obra (ex.: horário real); undefined mantém o rótulo padrão do card */
  getAiringLabel?: (anime: AnimeRecord) => string | undefined;
  /** "row" = esteira horizontal (padrão); "grid" = grade que quebra linha e rola na vertical */
  layout?: "row" | "grid";
}

export function ModularHubTrack({
  title,
  animes,
  activeAnimeId,
  onSelectAnime,
  onPlayAnime,
  onToggleBookmark,
  bookmarkedIds = [],
  getAiringLabel,
  layout = "row",
}: ModularHubTrackProps) {
  const { tokens, strings } = useDesignTheme();
  const [visibleCount, setVisibleCount] = React.useState(36);

  // Quando a lista muda (busca ou novo filtro), reseta a janela visível inicial
  React.useEffect(() => {
    setVisibleCount(36);
  }, [animes.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Carrega mais 36 cards ao chegar perto do fim (horizontal na esteira, vertical na grade)
    const nearEnd =
      layout === "grid"
        ? target.scrollTop + target.clientHeight >= target.scrollHeight - 300
        : target.scrollLeft + target.clientWidth >= target.scrollWidth - 300;
    if (nearEnd && visibleCount < animes.length) {
      setVisibleCount((prev) => Math.min(prev + 36, animes.length));
    }
  };

  const visibleAnimes = animes.slice(0, visibleCount);
  const isGrid = layout === "grid";

  return (
    <div className={`flex flex-col gap-3 w-full ${isGrid ? "h-full min-h-0" : ""}`}>
      {/* Cabeçalho da Esteira */}
      <div className="flex items-center justify-between px-1 flex-none">
        <h3
          className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5"
          style={{ color: tokens.colors.accentGold }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tokens.colors.accentGold }} />
          {title}
        </h3>
        <span
          className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5 opacity-60"
          style={{ color: tokens.colors.textMuted }}
        >
          {animes.length} {strings.labels.worksCount}
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>

      {/* Esteira horizontal ou grade vertical, sempre com scrollbar invisível e carga contínua */}
      <div
        onScroll={handleScroll}
        className={
          isGrid
            ? "flex-1 min-h-0 flex flex-wrap content-start justify-center gap-4 overflow-y-auto pb-4 pt-1 px-1 no-scrollbar scroll-smooth"
            : "flex items-center gap-4 overflow-x-auto pb-4 pt-1 px-1 no-scrollbar scroll-smooth"
        }
      >
        {visibleAnimes.map((anime) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            isActive={activeAnimeId === anime.id}
            onSelect={() => onSelectAnime?.(anime)}
            onPlay={() => onPlayAnime?.(anime)}
            onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(anime) : undefined}
            isBookmarked={bookmarkedIds.includes(anime.id)}
            airingLabel={getAiringLabel?.(anime)}
          />
        ))}
      </div>
    </div>
  );
}
