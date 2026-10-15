"use client";

import React from "react";
import AnimeCard from "./AnimeCard";
import { Anime } from "@/types/anime";

interface ModularVitrineProps {
  title?: string;
  items: Anime[];
  onSelect: (anime: Anime) => void;
  onPlay?: (anime: Anime) => void;
  userProgressMap?: Record<number, { completed?: boolean; progressPercent?: number }>;
  viewMode?: "grid" | "carousel";
}

/**
 * Micro-componente puro (Casca Branca ~50 linhas)
 * Renderiza qualquer coleção do catálogo (popular, seasonal, busca, franquia)
 * usando a mesma assinatura geométrica e aceleração por hardware.
 */
export default function ModularVitrine({
  title,
  items,
  onSelect,
  onPlay,
  userProgressMap = {},
  viewMode = "grid",
}: ModularVitrineProps) {
  if (!items || items.length === 0) {
    return (
      <div className="my-8 flex flex-col items-center justify-center py-12 text-zinc-500 border border-zinc-800/40 rounded-2xl bg-black/20">
        <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-mono tracking-wider">CARREGANDO CATÁLOGO CANÔNICO...</p>
      </div>
    );
  }

  return (
    <div className="my-4">
      {title && (
        <h3 className="text-base sm:text-lg font-bold text-zinc-100 mb-3 px-1 flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs text-zinc-400 font-mono font-normal">
            {items.length} obras
          </span>
        </h3>
      )}

      {viewMode === "carousel" ? (
        <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
          {items.map((anime) => (
            <AnimeCard
              key={anime.mal_id}
              anime={anime}
              onSelect={onSelect}
              onPlay={onPlay}
              userProgress={userProgressMap[anime.mal_id]}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 py-2">
          {items.map((anime) => (
            <AnimeCard
              key={anime.mal_id}
              anime={anime}
              onSelect={onSelect}
              onPlay={onPlay}
              userProgress={userProgressMap[anime.mal_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
