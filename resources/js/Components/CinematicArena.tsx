import React, { useState } from "react";
import { Play, ChevronRight, ChevronLeft, Bookmark, X, Clock, Layers, ExternalLink } from "lucide-react";
import { AnimeRecord } from "./AnimeCard";
import { useDesignTheme } from "../context/ThemeContext";

interface CinematicArenaProps {
  rollAnimes: AnimeRecord[]; // Os 3 animes do roll (último, penúltimo, antepenúltimo)
  activeIdx: number;
  onSelectIdx: (idx: number) => void;
  onPlay?: (anime: AnimeRecord) => void;
  onToggleBookmark?: (anime: AnimeRecord) => void;
  isBookmarked?: boolean;
  isAuthenticated?: boolean;
  hasPlayerAddon?: boolean;
}

export function CinematicArena({
  rollAnimes,
  activeIdx = 0,
  onSelectIdx,
  onPlay,
  onToggleBookmark,
  isBookmarked = false,
  isAuthenticated = false,
  hasPlayerAddon = false,
}: CinematicArenaProps) {
  const { tokens, strings, getLocalizedTitle, getLocalizedSynopsis } = useDesignTheme();
  const [isSplitMode, setIsSplitMode] = useState(false);

  const anime = rollAnimes[activeIdx] || rollAnimes[0] || null;

  if (!anime) {
    return (
      <div
        className="w-full h-full flex items-center justify-center font-mono text-xs select-none"
        style={{ color: tokens.colors.textMuted }}
      >
        {strings.labels.selectAnimeFromTrack}
      </div>
    );
  }

  const localizedTitle = getLocalizedTitle(anime);
  const localizedSynopsis = getLocalizedSynopsis(anime);
  const banner = anime.banner_image || anime.cover_image;
  const totalEps = anime.episodes_count || 12;

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
        {/* Lado Esquerdo: Tipografia Monumental, Badges e Controles */}
        <div
          className={`transition-all duration-500 ease-out flex flex-col justify-center gap-4 ${
            isSplitMode ? "w-full md:w-5/12" : "w-full max-w-2xl"
          }`}
        >
          {/* Título Monumental Serifado (Zero tags artificiais no cabeçalho) */}
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
            {localizedSynopsis}
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
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent((anime.title_english || anime.title) + " assistir oficial")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
                style={{
                  backgroundColor: tokens.colors.bgSurface,
                  borderColor: tokens.colors.accentGold,
                  borderWidth: 1,
                  color: tokens.colors.accentGold,
                }}
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ver no Canal Oficial</span>
              </a>
            )}

            <button
              onClick={() => setIsSplitMode(!isSplitMode)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border font-bold text-xs uppercase tracking-wider backdrop-blur-md transition-all duration-300 hover:bg-white/5 active:scale-95 cursor-pointer"
              style={{
                backgroundColor: tokens.colors.bgSurface,
                borderColor: tokens.colors.borderDefault,
                color: tokens.colors.textPrimary,
              }}
            >
              <Layers className="w-4 h-4" style={{ color: tokens.colors.accentGold }} />
              <span>{isSplitMode ? strings.actions.closeEpisodes : strings.actions.viewEpisodes}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-300 ${isSplitMode ? "rotate-90" : ""}`}
              />
            </button>

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
                {[0, 1, 2].map((idx) => {
                  const item = rollAnimes[idx];
                  if (!item) return null;
                  const isCur = activeIdx === idx;
                  return (
                    <button
                      key={idx}
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
              Lançamento {activeIdx + 1} de {rollAnimes.length}
            </span>
          </div>
        </div>

        {/* Lado Direito: Poster Showcase ou Split Drawer de Episódios */}
        <div className="hidden lg:flex flex-1 justify-end h-full items-center z-10">
          {!isSplitMode ? (
            /* Showcase Estático Fiel com Aura */
            <div
              onClick={() => setIsSplitMode(true)}
              className="relative w-72 lg:w-80 aspect-[2/3] rounded-3xl overflow-hidden border shadow-2xl transition-all duration-500 hover:scale-105 cursor-pointer group"
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
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white">
                <span className="text-xs font-bold font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  {totalEps} Episódios
                </span>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-amber-400 text-black">
                  Ver Lista
                </span>
              </div>
            </div>
          ) : (
            /* Drawer Lateral de Episódios Sem Sair da Viewport */
            <div
              className="w-full max-w-lg h-[460px] rounded-3xl border p-5 flex flex-col justify-between backdrop-blur-2xl shadow-2xl animate-in fade-in slide-in-from-right-4 duration-300"
              style={{
                backgroundColor: tokens.colors.bgOverlay,
                borderColor: tokens.colors.borderHighlight,
              }}
            >
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: tokens.colors.borderDefault }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tokens.colors.accentGold }} />
                  <h3 className="text-xs font-black uppercase tracking-wider" style={{ color: tokens.colors.textPrimary }}>
                    {strings.labels.chronology} ({totalEps} EPS)
                  </h3>
                </div>
                <button
                  onClick={() => setIsSplitMode(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer"
                  style={{ color: tokens.colors.textMuted }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Grid de Episódios Rolável em Scrollbar Oculta */}
              <div className="flex-1 overflow-y-auto py-3 grid grid-cols-4 gap-2.5 no-scrollbar">
                {Array.from({ length: totalEps }).map((_, idx) => {
                  const epNum = idx + 1;
                  if (isAuthenticated && hasPlayerAddon) {
                    return (
                      <button
                        key={epNum}
                        onClick={() => onPlay?.(anime)}
                        className="flex flex-col items-center justify-center py-3 rounded-xl border text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                        style={{
                          backgroundColor: tokens.colors.bgSurface,
                          borderColor: tokens.colors.borderDefault,
                          color: tokens.colors.textPrimary,
                        }}
                      >
                        <span className="text-[9px] font-mono opacity-50 uppercase">{strings.labels.episode}</span>
                        <span className="text-sm font-black" style={{ color: tokens.colors.accentGold }}>
                          {epNum}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <a
                      key={epNum}
                      href={`https://www.google.com/search?q=${encodeURIComponent((anime.title_english || anime.title) + " episodio " + epNum + " oficial")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center py-3 rounded-xl border text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                      style={{
                        backgroundColor: tokens.colors.bgSurface,
                        borderColor: tokens.colors.borderDefault,
                        color: tokens.colors.textPrimary,
                      }}
                    >
                      <span className="text-[9px] font-mono opacity-50 uppercase">{strings.labels.episode}</span>
                      <span className="text-sm font-black" style={{ color: tokens.colors.accentGold }}>
                        {epNum}
                      </span>
                    </a>
                  );
                })}
              </div>

              <div className="pt-3 border-t flex items-center justify-between text-[11px] font-mono" style={{ borderColor: tokens.colors.borderDefault, color: tokens.colors.textMuted }}>
                <span>Transmissão Oficial Canônica</span>
                <span className="font-bold" style={{ color: tokens.colors.accentGold }}>1080p Ultra HD</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
