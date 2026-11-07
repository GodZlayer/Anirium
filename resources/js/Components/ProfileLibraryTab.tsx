import React from "react";
import { Bookmark, History, Star, Play, CheckCircle } from "lucide-react";
import { AnimeRecord } from "./AnimeCard";
import { useDesignTheme } from "../context/ThemeContext";
import { libraryMatches, libraryRating } from "../lib/libraryReferences.mjs";

interface ProfileLibraryTabProps {
  type: "bookmarks" | "history" | "ratings";
  universalCatalog: AnimeRecord[];
  bookmarkedIds: Array<number | string>;
  completedWorkIds: Array<number | string>;
  ratingsMap: Record<string, number>;
  onSelectAnime: (anime: AnimeRecord) => void;
  onPlayAnime: (anime: AnimeRecord) => void;
}

export function ProfileLibraryTab({
  type,
  universalCatalog,
  bookmarkedIds,
  completedWorkIds,
  ratingsMap,
  onSelectAnime,
  onPlayAnime,
}: ProfileLibraryTabProps) {
  const { tokens, getLocalizedTitle } = useDesignTheme();

  let displayedAnimes: AnimeRecord[] = [];
  let emptyMessage = "";

  if (type === "bookmarks") {
    displayedAnimes = universalCatalog.filter((a) => {
      return libraryMatches(a, bookmarkedIds);
    });
    emptyMessage = "Você ainda não favoritou nenhuma obra.";
  } else if (type === "history") {
    displayedAnimes = universalCatalog.filter((a) => {
      return libraryMatches(a, completedWorkIds);
    });
    emptyMessage = "Nenhuma obra concluída ainda. Assista a episódios para registrar progresso!";
  } else if (type === "ratings") {
    displayedAnimes = universalCatalog.filter((a) => {
      return libraryRating(a, ratingsMap) !== undefined;
    });
    emptyMessage = "Você ainda não avaliou nenhuma obra com estrelas.";
  }

  if (displayedAnimes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-[color:var(--wc-borderDefault)]/5 rounded-2xl bg-[color:var(--wc-bgBase)]/20">
        <span className="text-sm text-[color:var(--wc-textMuted)]">{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto pr-1 no-scrollbar">
      {displayedAnimes.map((anime) => {
        const title = getLocalizedTitle(anime);
        const rating = libraryRating(anime, ratingsMap);
        const isCompleted = libraryMatches(anime, completedWorkIds);

        return (
          <div
            key={anime.id}
            onClick={() => onSelectAnime(anime)}
            className="group relative rounded-xl overflow-hidden border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 hover:border-[color:var(--wc-stateWarning)]/50 transition-all cursor-pointer flex flex-col"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-[color:var(--wc-bgRaised)]">
              <img
                src={anime.cover_image || anime.banner_image}
                alt={title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--wc-bgBase)]/90 via-[color:var(--wc-bgBase)]/20 to-transparent" />

              {/* Badges Flutuantes */}
              <div className="absolute top-2 left-2 flex flex-col gap-1">
                {isCompleted && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[color:var(--wc-stateSuccess)]/80 text-[color:var(--wc-textPrimary)] backdrop-blur-md">
                    <CheckCircle className="w-2.5 h-2.5" /> 100%
                  </span>
                )}
                {rating && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[color:var(--wc-stateWarning)]/80 text-[color:var(--wc-bgBase)] backdrop-blur-md">
                    <Star className="w-2.5 h-2.5 fill-[color:var(--wc-bgBase)]" /> {rating}★
                  </span>
                )}
              </div>

              {/* Botão Play Hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayAnime(anime);
                }}
                className="absolute bottom-2 right-2 p-2 rounded-full bg-[color:var(--wc-stateWarning)] text-[color:var(--wc-bgBase)] shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-[color:var(--wc-bgBase)]" />
              </button>
            </div>

            <div className="p-2 flex flex-col">
              <span className="text-xs font-bold text-[color:var(--wc-textPrimary)] truncate">{title}</span>
              <span className="text-[10px] text-[color:var(--wc-textMuted)] font-mono mt-0.5">
                {anime.episodes_count ? `${anime.episodes_count} eps` : "Lançamento"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
