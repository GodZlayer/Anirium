"use client";

import React, { useRef } from "react";
import { ChevronRight, ChevronLeft, Sparkles, Play } from "lucide-react";
import { Anime } from "@/types/anime";

interface WeeklySpotlightProps {
  animes: Anime[];
  onSelectAnime: (anime: Anime) => void;
  onPlayAnime: (anime: Anime) => void;
}

export default function WeeklySpotlight({ animes, onSelectAnime, onPlayAnime }: WeeklySpotlightProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const offset = scrollRef.current.clientWidth * 0.75;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -offset : offset,
        behavior: "smooth",
      });
    }
  };

  if (!animes || animes.length === 0) return null;

  return (
    <section id="destaques" className="max-w-7xl mx-auto px-4 md:px-10 mb-14">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-[#FFC766]" />
          <div>
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#FFF9F0]">
              Destaques da Semana
            </h2>
            <p className="text-xs text-[#EADCC8]/60 mt-0.5">
              Os lançamentos e episódios mais aguardados desta semana.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 rounded-full bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766] flex items-center justify-center text-[#EADCC8] hover:text-[#FFC766] transition"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 rounded-full bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766] flex items-center justify-center text-[#EADCC8] hover:text-[#FFC766] transition"
            aria-label="Próximo"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel with Panoramic Concept Style Cards */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-4 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth py-1"
      >
        {animes.slice(0, 10).map((anime, index) => {
          const bannerUrl =
            anime.banner_image ||
            anime.images.webp?.large_image_url ||
            anime.images.jpg?.large_image_url;

          const title = anime.title_portuguese || anime.title_english || anime.title;
          const epCount = anime.episodes ? `Episódio ${String(anime.episodes).padStart(2, "0")}` : "Episódio 01";

          return (
            <div
              key={anime.mal_id}
              onClick={() => onSelectAnime(anime)}
              className="group relative flex-none w-[240px] sm:w-[280px] rounded-2xl overflow-hidden bg-[#1A1A1F] border border-[#3A3A43]/80 hover:border-[#FFC766]/50 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-[#FFC766]/5 hover:-translate-y-1 flex flex-col"
            >
              {/* Media Preview Thumbnail */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0B0B0D]">
                <img
                  src={bannerUrl}
                  alt={title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 filter brightness-[0.85] group-hover:brightness-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1F] via-[#1A1A1F]/30 to-transparent" />

                {/* Floating Round Action Button */}
                <div className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-[#FFC766] text-[#0B0B0D] flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform">
                  <ChevronRight className="w-4 h-4 stroke-[3]" />
                </div>
              </div>

              {/* Information Footnote */}
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition-colors line-clamp-1">
                    {title}
                  </h3>
                  <p className="text-[11px] text-[#EADCC8]/60 mt-0.5 truncate">
                    {anime.format || "Série TV"} • {anime.year || "2026"}
                  </p>
                </div>

                {/* Badges and Airing Schedule */}
                <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-[#3A3A43]/50 text-[10px]">
                  <span className="flex items-center gap-1.5 text-[#EADCC8]/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#43A047]" />
                    <span>Hoje • 14:30</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#23232A] border border-[#3A3A43] text-[#FFC766] font-mono">
                    {epCount}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
