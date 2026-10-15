"use client";

import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AnimeCard from "./AnimeCard";
import { Anime } from "@/types/anime";

interface AnimeRowProps {
  id?: string;
  title: string;
  animes: Anime[];
  onSelectAnime: (anime: Anime) => void;
  onPlayAnime: (anime: Anime) => void;
}

export default function AnimeRow({
  id,
  title,
  animes,
  onSelectAnime,
  onPlayAnime,
}: AnimeRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollAmount = clientWidth * 0.75;
      rowRef.current.scrollTo({
        left: direction === "left" ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (!animes || animes.length === 0) return null;

  return (
    <div id={id} className="mb-8 md:mb-12 relative group/row">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg md:text-2xl font-bold text-[#FFF9F0] hover:text-[#FFC766] transition-colors cursor-pointer inline-flex items-center gap-2">
          {title}
        </h2>
        <span className="text-xs font-mono text-[#FFC766] hover:underline cursor-pointer">
          Ver todos &rarr;
        </span>
      </div>

      {/* Row Wrapper */}
      <div className="relative">
        {/* Left Arrow Button */}
        <button
          onClick={() => handleScroll("left")}
          className="absolute left-0 top-0 bottom-0 z-40 bg-[#0B0B0D]/80 hover:bg-[#1A1A1F] text-[#FFF9F0] hover:text-[#FFC766] border-r border-[#3A3A43]/50 w-10 md:w-12 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all rounded-l-2xl backdrop-blur-sm"
          aria-label="Rolar para esquerda"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Scrollable Container */}
        <div
          ref={rowRef}
          className="flex items-center gap-2.5 md:gap-4 overflow-x-auto no-scrollbar scroll-smooth py-2"
        >
          {animes.map((anime) => (
            <AnimeCard
              key={anime.mal_id}
              anime={anime}
              onSelect={onSelectAnime}
              onPlay={onPlayAnime}
            />
          ))}
        </div>

        {/* Right Arrow Button */}
        <button
          onClick={() => handleScroll("right")}
          className="absolute right-0 top-0 bottom-0 z-40 bg-[#0B0B0D]/80 hover:bg-[#1A1A1F] text-[#FFF9F0] hover:text-[#FFC766] border-l border-[#3A3A43]/50 w-10 md:w-12 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all rounded-r-2xl backdrop-blur-sm"
          aria-label="Rolar para direita"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
