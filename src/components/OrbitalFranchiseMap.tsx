"use client";

import React, { useState } from "react";
import { Orbit, Layers, Sparkles, ChevronRight, Play } from "lucide-react";
import { FranchiseGroup } from "@/lib/franchiseUtils";
import { Anime } from "@/types/anime";

interface OrbitalFranchiseMapProps {
  franchises: FranchiseGroup[];
  onSelectAnime: (anime: Anime) => void;
}

/**
 * Mapa Orbital de Genealogia (Visão de Satélite) (~75 linhas)
 * A arena recua em profundidade óptica revelando as constelações de obras conectadas.
 */
export default function OrbitalFranchiseMap({ franchises, onSelectAnime }: OrbitalFranchiseMapProps) {
  const [selectedFranchise, setSelectedFranchise] = useState<FranchiseGroup | null>(franchises[0] || null);

  if (!franchises || franchises.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-xs">
        CARREGANDO MAPA ORBITAL DE GENEALOGIA...
      </div>
    );
  }

  const activeGroup = selectedFranchise || franchises[0];

  return (
    <div className="w-full h-full flex flex-col p-4 sm:p-6 overflow-hidden select-none">
      {/* Topo do Mapa: Seletor Orbital de Franquias */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 border-b border-zinc-800/80 flex-none">
        <span className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1.5 flex-none mr-2">
          <Orbit className="w-4 h-4 animate-spin-slow" />
          <span>CONSTELAÇÕES:</span>
        </span>
        {franchises.map((f) => {
          const isSelected = activeGroup.rootTitle === f.rootTitle;
          return (
            <button
              key={f.rootTitle}
              onClick={() => setSelectedFranchise(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isSelected
                  ? "bg-amber-400 text-black font-bold shadow-md shadow-amber-400/20 scale-100"
                  : "bg-zinc-900/80 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              <span>{f.rootTitle}</span>
              <span className="text-[10px] opacity-70 font-mono">({f.worksCount})</span>
            </button>
          );
        })}
      </div>

      {/* Visão de Satélite: Nós Orbitais Conectados por Feixes de Luz */}
      <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
        {/* Halo Orbital de Fundo */}
        <div className="absolute w-[500px] h-[500px] rounded-full border border-zinc-800/60 pointer-events-none animate-pulse" />
        <div className="absolute w-[320px] h-[320px] rounded-full border border-amber-400/20 pointer-events-none" />

        {/* Constelação de Obras */}
        <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-full overflow-y-auto no-scrollbar p-2">
          {activeGroup.memberAnimes.map((anime: Anime) => {
            const cover = anime.images?.webp?.large_image_url || anime.images?.jpg?.image_url;
            return (
              <div
                key={anime.mal_id}
                onClick={() => onSelectAnime(anime)}
                className="group relative p-3 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800 hover:border-amber-400 transition-all duration-300 cursor-pointer flex items-center gap-3 shadow-lg transform hover:scale-[1.03]"
              >
                {/* Miniatura do Nó */}
                <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-black flex-none border border-zinc-700/60">
                  <img src={cover} alt={anime.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </div>
                </div>

                {/* Dados do Nó Genealógico */}
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {anime.format || "OBRA"}
                  </span>
                  <h4 className="font-serif text-xs font-bold text-white truncate mt-1 group-hover:text-amber-300 transition-colors">
                    {anime.title_portuguese || anime.title}
                  </h4>
                  <p className="text-[10px] font-mono text-zinc-400 mt-0.5">{anime.year || "Canônico"} • {anime.format}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
