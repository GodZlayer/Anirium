"use client";

import React from "react";
import { Play, Clock } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";
import { Anime } from "@/types/anime";
import { isReleaseUuid } from "../lib/profilePlaybackIdentity";

interface ContinueWatchingRowProps {
  onPlayResume: (animeId: number, seasonIdx: number, episodeNum: number, seasonEntityId: string, episodeEntityId: string) => void;
  onOpenAnime: (animeId: number) => void;
}

export default function ContinueWatchingRow({
  onPlayResume,
  onOpenAnime,
}: ContinueWatchingRowProps) {
  const { watchHistory, level } = useUser();
  const { tokens, strings } = useDesignTheme();

  // Nível 0 é canônico/anônimo; não renderiza histórico pessoal
  if (level === 0 || !watchHistory || watchHistory.length === 0) {
    return null;
  }

  return (
    <div className="px-4 md:px-12 my-6">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-5 h-5" style={{ color: tokens.colors.accentGold }} />
        <h2 
          className="text-lg md:text-xl font-bold tracking-wide"
          style={{ color: tokens.colors.textPrimary }}
        >
          {strings.sections.continueWatching}
        </h2>
        <Tooltip text="Sincronização contínua do progresso do usuário via API segura" position="top">
          <span 
            className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: tokens.colors.bgSurface,
              borderColor: tokens.colors.borderDefault,
              color: tokens.colors.textMuted,
            }}
          >
            Nível {level} • {strings.badges.resumed}
          </span>
        </Tooltip>
      </div>

      <div className="flex gap-4 overflow-x-auto no-scrollbar py-2">
        {watchHistory.map((item) => {
          const canResume = item.resumeAvailable === true && isReleaseUuid(item.seasonEntityId) && isReleaseUuid(item.canonicalEntityId) && item.animeId !== null && item.seasonIdx !== null && item.episodeNumber !== null;
          const resume = () => { if (canResume && item.animeId !== null && item.seasonIdx !== null && item.episodeNumber !== null) onPlayResume(item.animeId,item.seasonIdx,item.episodeNumber,item.seasonEntityId!,item.canonicalEntityId!); };
          const progressPercent = item.durationSeconds > 0 ? Math.min(100,Math.max(0,item.progressSeconds / item.durationSeconds * 100)) : null;

          return (
            <div
              key={item.canonicalEntityId}
              className="flex-none w-48 sm:w-60 group cursor-pointer relative"
              onClick={resume}
              aria-disabled={!canResume}
              role="button"
              tabIndex={0}
              title={!canResume ? "Retomada indisponível neste catálogo" : undefined}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); resume(); } }}
            >
              <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 group-hover:border-red-500/80 transition-all duration-300 shadow-md group-hover:shadow-red-500/20">
                {item.animeImage ? (
                  <img
                    src={item.animeImage}
                    alt={item.animeTitle || "Anime"}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">
                    Sem Imagem
                  </div>
                )}

                {/* Overlay Play Icon */}
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-all">
                  <div className="w-10 h-10 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>

                {/* Episode Badge */}
                <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/20">
                  {item.episodeNumber !== null ? `Ep ${item.episodeNumber}` : "Episódio indisponível"}
                </div>

                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-800">
                  <div
                    className="h-full bg-red-600 transition-all duration-300"
                    style={{ width: `${progressPercent ?? 0}%` }}
                    title={progressPercent === null ? "Duração indisponível" : undefined}
                  />
                </div>
              </div>

              {/* Title & Info */}
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200 group-hover:text-red-400 truncate max-w-[180px]">
                  {item.animeTitle}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {progressPercent !== null ? `${Math.round(progressPercent)}%` : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
