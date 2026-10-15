"use client";

import React from "react";
import Image from "next/image";
import { Play, Star, Plus } from "lucide-react";
import { Anime } from "@/types/anime";

interface AnimeCardProps {
  anime: Anime;
  onSelect: (anime: Anime) => void;
  onPlay: (anime: Anime) => void;
}

export default function AnimeCard({ anime, onSelect, onPlay }: AnimeCardProps) {
  const imageUrl =
    anime.images.webp?.large_image_url ||
    anime.images.jpg?.large_image_url ||
    anime.images.jpg?.image_url;

  return (
    <div
      onClick={() => onSelect(anime)}
      className="group relative flex-none w-[140px] sm:w-[170px] md:w-[190px] aspect-[2/3] rounded-2xl overflow-hidden bg-[#1A1A1F] border border-[#3A3A43]/70 hover:border-[#FFC766]/60 cursor-pointer transition-all duration-300 transform hover:scale-105 hover:z-30 hover:shadow-2xl hover:shadow-[#FFC766]/5"
    >
      {/* Poster Image */}
      <img
        src={imageUrl}
        alt={anime.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading="lazy"
      />

      {/* Gradient vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3" />

      {/* Score badge at top right */}
      {anime.score && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#0B0B0D]/80 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-bold text-[#FFC766] border border-[#FFC766]/30 z-10 shadow">
          <Star className="w-3 h-3 fill-[#FFC766] text-[#FFC766]" />
          <span>{anime.score}</span>
        </div>
      )}

      {/* Hover Info details overlay */}
      <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 translate-y-2 group-hover:translate-y-0">
        <div className="flex items-center gap-2 mb-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(anime);
            }}
            className="w-7 h-7 rounded-full bg-[#FFC766] text-[#0B0B0D] flex items-center justify-center hover:brightness-110 transition-transform active:scale-90 shadow"
            title="Explorar Obra & Franquia"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
          </button>
        </div>

        <h4 className="text-xs md:text-sm font-bold text-[#FFF9F0] line-clamp-1">
          {anime.title_portuguese || anime.title_english || anime.title}
        </h4>
        {anime.title_portuguese && anime.title_portuguese !== anime.title && (
          <p className="text-[10px] text-gray-400 truncate italic">
            {anime.title}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 font-medium">
          {anime.episodes && <span>{anime.episodes} eps</span>}
          {anime.status && <span className="text-emerald-400">{anime.status}</span>}
        </div>
      </div>
    </div>
  );
}
