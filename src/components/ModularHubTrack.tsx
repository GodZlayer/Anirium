"use client";

import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Anime } from "@/types/anime";
import AnimeCard from "./AnimeCard";

interface ModularHubTrackProps {
  title: string;
  items: Anime[];
  activeAnimeId?: number;
  onSelect: (anime: Anime) => void;
  onPlay?: (anime: Anime) => void;
}

/**
 * Esteira Horizontal do Hub com Inércia Tátil (~55 linhas)
 * Casca Branca pura que se aloja na base da viewport de 100vh.
 * Permite rolar suavemente as obras sem mover a tela verticalmente.
 */
export default function ModularHubTrack({
  title,
  items,
  activeAnimeId,
  onSelect,
  onPlay,
}: ModularHubTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (trackRef.current) {
      const amount = direction === "left" ? -400 : 400;
      trackRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="w-full flex-none px-4 sm:px-6 py-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent select-none">
      {/* Cabeçalho da Esteira com Controles Laterais */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-mono font-bold tracking-wider text-zinc-300 uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>{title}</span>
          <span className="text-[10px] text-zinc-500 font-normal">({items.length})</span>
        </h3>

        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            className="p-1 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition"
            aria-label="Rolar para esquerda"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="p-1 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition"
            aria-label="Rolar para direita"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Esteira com Inércia Suave */}
      <div
        ref={trackRef}
        className="flex gap-3 overflow-x-auto no-scrollbar py-1 scroll-smooth"
      >
        {items.map((anime) => (
          <div
            key={anime.mal_id}
            className={`transition-transform duration-200 ${activeAnimeId === anime.mal_id ? "scale-105 ring-2 ring-amber-400/80 rounded-2xl" : ""}`}
          >
            <AnimeCard
              anime={anime}
              onSelect={onSelect}
              onPlay={onPlay}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
