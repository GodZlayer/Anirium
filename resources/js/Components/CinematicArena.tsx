import React from "react";
import { Play, ChevronRight, ChevronLeft, Bookmark } from "lucide-react";
import { AnimeRecord } from "./AnimeCard";
import { useDesignTheme } from "../context/ThemeContext";
import { statusLabelKey } from "../lib/catalogMetadata.mjs";
import { CATALOG_STRINGS } from "../lib/catalogStrings";
import { UNIFIED_CATALOG_STRINGS } from "../lib/unifiedCatalogStrings";

interface CinematicArenaProps {
  rollAnimes: AnimeRecord[]; // Os 3 animes do roll (último, penúltimo, antepenúltimo)
  activeIdx: number;
  feedPhase?: string;
  onSelectIdx: (idx: number) => void;
  onPlay?: (anime: AnimeRecord) => void;
  onExplore?: (anime: AnimeRecord) => void;
  onToggleBookmark?: (anime: AnimeRecord) => void;
  isBookmarked?: boolean;
  isAuthenticated?: boolean;
  hasPlayerAddon?: boolean;
}

export function CinematicArena({
  rollAnimes,
  activeIdx = 0,
  feedPhase = "ready",
  onSelectIdx,
  onPlay,
  onExplore,
  onToggleBookmark,
  isBookmarked = false,
  isAuthenticated = false,
  hasPlayerAddon = false,
}: CinematicArenaProps) {
  const { tokens, strings, language, getLocalizedTitle, getLocalizedSynopsis } = useDesignTheme();
  const labels = CATALOG_STRINGS[language] || CATALOG_STRINGS["pt-BR"];
  const navigation = UNIFIED_CATALOG_STRINGS[language] || UNIFIED_CATALOG_STRINGS["pt-BR"];

  const anime = rollAnimes[activeIdx] || rollAnimes[0] || null;

  if (!anime) {
    return (
      <div
        className="w-full h-full flex items-center justify-center font-mono text-xs select-none"
        style={{ color: tokens.colors.textMuted }}
      >
        {feedPhase === "loading" ? labels.loading : feedPhase === "error" ? labels.unavailable : strings.labels.noResults}
      </div>
    );
  }

  const localizedTitle = getLocalizedTitle(anime);
  const localizedSynopsis = getLocalizedSynopsis(anime);
  const banner = anime.banner_image || anime.cover_image;

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-8 md:p-12 overflow-hidden select-none">
      {/* 1. Aura Edge-Diffusion Bloom (Projeção volumétrica viva das bordas da imagem em toda a viewport) */}
      <div
        className="absolute inset-0 opacity-45 blur-3xl pointer-events-none transition-all duration-1000 scale-125 z-0"
        style={{
          backgroundImage: `url(${banner})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
          filter: "brightness(0.65) saturate(1.8)",
        }}
      />
      
      {/* Degradê Canônico Multi-Camadas conectado aos Tokens Ativos */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(circle at 75% 50%, transparent 20%, ${tokens.colors.bgBase}CC 80%, ${tokens.colors.bgBase} 100%)`,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: `linear-gradient(to top, ${tokens.colors.bgBase} 0%, transparent 60%, ${tokens.colors.bgBase}99 100%)`,
        }}
      />

      {/* 2. Palco do Cinema (Foco Monumental ou Modo Split Lateral de Episódios) */}
      <div className="relative z-10 w-full max-w-7xl h-full flex items-center justify-between gap-8">
        {/* Lado Esquerdo: Tipografia Monumental e Controles da Obra */}
        <div className="w-full max-w-2xl flex flex-col justify-center gap-4">
          {/* Metadados Canônicos da Obra */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tag explícita do Último Episódio Lançado */}
            {anime.release && anime.entity_type !== "MANGA" ? <span
              className="px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-md flex items-center gap-1.5 shadow-sm"
              style={{
                backgroundColor: tokens.colors.accentGold + "20",
                borderColor: tokens.colors.accentGold,
                color: tokens.colors.accentGold,
              }}
            >
              {strings.labels.episode} {anime.release.number}
            </span> : null}

            {anime.score && (
              <span
                className="px-2.5 py-0.5 rounded-full border text-xs font-mono font-bold backdrop-blur-md flex items-center gap-1 shadow-sm"
                style={{
                  backgroundColor: "rgba(10, 10, 15, 0.7)",
                  borderColor: tokens.colors.borderDefault,
                  color: tokens.colors.textPrimary,
                }}
              >
                ★ {Number(anime.score).toFixed(1)}
              </span>
            )}
            <span
              className="px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-md"
              style={{
                backgroundColor: "rgba(10, 10, 15, 0.6)",
                borderColor: tokens.colors.borderDefault,
                color: tokens.colors.textMuted,
              }}
            >
              {anime.format || labels.unknown} • {anime.year ?? "—"}
            </span>
            {anime.status && (
              <span
                className="px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold uppercase"
                style={{ color: anime.status === "RELEASING" ? tokens.colors.stateWarning : anime.status === "FINISHED" ? tokens.colors.stateSuccess : tokens.colors.statePrimary,
                  backgroundColor: tokens.colors.bgSurface, borderColor: tokens.colors.borderDefault }}
              >
                {statusLabelKey(anime.status) ? strings.labels[statusLabelKey(anime.status)] : labels.unknown}
              </span>
            )}
          </div>

          {/* Título Monumental Serifado */}
          <h1
            className="text-3xl sm:text-5xl lg:text-6xl font-black font-serif tracking-tight leading-[1.08] drop-shadow-xl"
            style={{ color: tokens.colors.textPrimary }}
          >
            {localizedTitle}
          </h1>

          {/* Sinopse Dinâmica Regionalizada */}
          <p
            className="text-xs sm:text-sm lg:text-base leading-relaxed drop-shadow line-clamp-3 max-w-xl font-normal opacity-90"
            style={{ color: tokens.colors.textSecondary }}
          >
            {anime.synopsis ? localizedSynopsis : ""}
          </p>

          {/* Ações Cinemáticas do Cinema */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            {isAuthenticated && hasPlayerAddon ? (
              <button
                onClick={() => onPlay?.(anime)}
                className="flex items-center gap-2.5 px-7 py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
                style={{
                  backgroundColor: tokens.colors.accentGold,
                  color: tokens.colors.bgBase,
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{strings.actions.play}</span>
              </button>
            ) : (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => onExplore?.(anime)}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-xl"
                      style={{
                        backgroundColor: tokens.colors.accentGold,
                        color: tokens.colors.bgBase,
                      }}
                      title={anime.release ? `${strings.labels.episode} ${anime.release.number}` : strings.actions.details}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{strings.actions.details}</span>
                    </button>
                  </div>
            )}

            {isAuthenticated && (
              <button
                onClick={() => onToggleBookmark?.(anime)}
                className="p-3 rounded-xl border backdrop-blur-md transition-all duration-200 hover:scale-105 cursor-pointer"
                style={{
                  backgroundColor: tokens.colors.bgSurface,
                  borderColor: isBookmarked ? tokens.colors.accentGold : tokens.colors.borderDefault,
                  color: isBookmarked ? tokens.colors.accentGold : tokens.colors.textMuted,
                }}
                title={isBookmarked ? strings.actions.removeFromFavorites : strings.actions.addToFavorites}
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} />
              </button>
            )}
          </div>

          {/* Indicadores do Roll de 3 Lançamentos (Último, Penúltimo, Antepenúltimo) */}
          <div className="flex items-center gap-3 pt-4">
            <div className="flex items-center gap-2">
              <button
                aria-label={navigation.previous}
                onClick={() => onSelectIdx(Math.max(0, activeIdx - 1))}
                disabled={activeIdx === 0}
                className={`p-1.5 rounded-full border backdrop-blur-md transition-all cursor-pointer ${
                  activeIdx === 0 ? "opacity-30 cursor-not-allowed" : "hover:scale-110"
                }`}
                style={{
                  backgroundColor: tokens.colors.bgSurface,
                  borderColor: tokens.colors.borderDefault,
                  color: tokens.colors.textPrimary,
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-3 py-1 rounded-full border backdrop-blur-md"
                style={{
                  backgroundColor: tokens.colors.bgSurface,
                  borderColor: tokens.colors.borderDefault,
                }}
              >
                {rollAnimes.map((item, idx) => {
                  if (!item) return null;
                  const isCur = activeIdx === idx;
                  return (
                    <button
                      key={item.release?.id || item.work_id}
                      onClick={() => onSelectIdx(idx)}
                      className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                        isCur ? "w-8" : "w-2.5 opacity-40 hover:opacity-100"
                      }`}
                      style={{
                        backgroundColor: isCur ? tokens.colors.accentGold : tokens.colors.textMuted,
                      }}
                      title={getLocalizedTitle(item)}
                    />
                  );
                })}
              </div>

              <button
                aria-label={navigation.next}
                onClick={() => onSelectIdx(Math.min(rollAnimes.length - 1, activeIdx + 1))}
                disabled={activeIdx >= rollAnimes.length - 1}
                className={`p-1.5 rounded-full border backdrop-blur-md transition-all cursor-pointer ${
                  activeIdx >= rollAnimes.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:scale-110"
                }`}
                style={{
                  backgroundColor: tokens.colors.bgSurface,
                  borderColor: tokens.colors.borderDefault,
                  color: tokens.colors.textPrimary,
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-[11px] font-mono tracking-wider opacity-60" style={{ color: tokens.colors.textMuted }}>
              {activeIdx + 1} / {rollAnimes.length}
            </span>
          </div>
        </div>

        {/* Lado Direito: Poster Showcase ou Split Drawer de Episódios */}
        {/* Lado Direito: Poster Monumental com Aura */}
        <div className="hidden lg:flex flex-1 justify-end h-full items-center z-10">
          <div
            className="relative w-72 lg:w-80 aspect-[2/3] rounded-3xl overflow-hidden border shadow-2xl transition-all duration-500 hover:scale-[1.02] group"
            style={{
              backgroundColor: tokens.colors.bgSurface,
              borderColor: tokens.colors.borderHighlight,
            }}
          >
            <img
              src={anime.cover_image || banner}
              alt={localizedTitle}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${tokens.colors.bgOverlay}, transparent)` }} />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between" style={{ color: tokens.colors.textPrimary }}>
              <span className="text-xs font-bold font-mono" style={{ color: tokens.colors.accentGold }}>
                {anime.title_japanese || anime.title_english || localizedTitle}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
