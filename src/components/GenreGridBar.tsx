"use client";

import React, { useRef } from "react";
import { ChevronRight, ChevronLeft, Compass } from "lucide-react";

interface GenreItem {
  name: string;
  count: string;
  accent: string;
  image: string;
}

const GENRES: GenreItem[] = [
  { name: "Ação", count: "1.2k obras", accent: "from-red-500/20", image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80" },
  { name: "Aventura", count: "980 obras", accent: "from-amber-500/20", image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80" },
  { name: "Comédia", count: "840 obras", accent: "from-yellow-500/20", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80" },
  { name: "Drama", count: "720 obras", accent: "from-indigo-500/20", image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80" },
  { name: "Fantasia", count: "1.4k obras", accent: "from-purple-500/20", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80" },
  { name: "Slice of Life", count: "510 obras", accent: "from-emerald-500/20", image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80" },
  { name: "Sci-Fi", count: "630 obras", accent: "from-cyan-500/20", image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80" },
  { name: "Terror", count: "310 obras", accent: "from-rose-500/20", image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80" },
];

export default function GenreGridBar({ onSelectGenre }: { onSelectGenre?: (genre: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -300 : 300,
        behavior: "smooth",
      });
    }
  };

  return (
    <section id="generos" className="max-w-7xl mx-auto px-4 md:px-10 mb-14">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <Compass className="w-5 h-5 text-[#FFC766]" />
          <div>
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#FFF9F0]">
              Explore por Gênero
            </h2>
            <p className="text-xs text-[#EADCC8]/60 mt-0.5">
              Navegue pelas principais categorias e universos temáticos.
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

      <div
        ref={scrollRef}
        className="flex items-center gap-3 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth py-1"
      >
        {GENRES.map((genre) => (
          <button
            key={genre.name}
            onClick={() => onSelectGenre?.(genre.name)}
            className="group relative flex-none w-32 sm:w-36 h-28 sm:h-32 rounded-2xl overflow-hidden bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766]/60 transition-all duration-300 text-left p-3 flex flex-col justify-end shadow-md hover:scale-102"
          >
            <img
              src={genre.image}
              alt={genre.name}
              className="absolute inset-0 w-full h-full object-cover filter brightness-[0.4] group-hover:brightness-[0.6] group-hover:scale-110 transition-all duration-500"
            />
            <div className={`absolute inset-0 bg-gradient-to-t ${genre.accent} via-[#0B0B0D]/50 to-transparent`} />

            <div className="relative z-10">
              <span className="text-xs sm:text-sm font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition-colors block">
                {genre.name}
              </span>
              <span className="text-[10px] text-[#EADCC8]/60 font-mono">
                {genre.count}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
