"use client";

import React, { useState } from "react";
import { Orbit, Layers, Sparkles, ChevronRight, Play } from "lucide-react";
import { FranchiseGroup } from "@/lib/franchiseUtils";
import { Anime } from "@/types/anime";

import { useDesignTheme } from "@/context/ThemeContext";

interface OrbitalFranchiseMapProps {
  franchises: FranchiseGroup[];
  onSelectAnime: (anime: Anime) => void;
}

/**
 * Mapa Orbital de Genealogia (Visão de Satélite) (~75 linhas)
 * A arena recua em profundidade óptica revelando as constelações de obras conectadas.
 */
export default function OrbitalFranchiseMap({ franchises, onSelectAnime }: OrbitalFranchiseMapProps) {
  const { strings, getLocalizedTitle, tokens } = useDesignTheme();
  const [selectedFranchise, setSelectedFranchise] = useState<FranchiseGroup | null>(franchises[0] || null);

  if (!franchises || franchises.length === 0) {
    return (
      <div
        className="w-full h-full flex items-center justify-center font-mono text-xs select-none"
        style={{ color: "var(--color-text-muted)" }}
      >
        {strings.labels.franchiseMapTitle}...
      </div>
    );
  }

  const activeGroup = selectedFranchise || franchises[0];

  return (
    <div className="w-full h-full flex flex-col p-4 sm:p-6 overflow-hidden select-none">
      {/* Topo do Mapa: Seletor Orbital de Franquias */}
      <div
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 border-b flex-none"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <span
          className="text-xs font-mono font-bold flex items-center gap-1.5 flex-none mr-2"
          style={{ color: "var(--color-accent-gold)" }}
        >
          <Orbit className="w-4 h-4 animate-spin-slow" />
          <span>{strings.labels.franchiseMapTitle.toUpperCase()}:</span>
        </span>
        {franchises.map((f) => {
          const isSelected = activeGroup.rootTitle === f.rootTitle;
          return (
            <button
              key={f.rootTitle}
              onClick={() => setSelectedFranchise(f)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border"
              style={{
                backgroundColor: isSelected ? "var(--color-accent-gold)" : "var(--color-bg-surface)",
                color: isSelected ? "#000000" : "var(--color-text-secondary)",
                borderColor: isSelected ? "var(--color-accent-gold)" : "var(--color-border-default)",
                boxShadow: isSelected ? "0 4px 12px rgba(0,0,0,0.3)" : "none",
              }}
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
        <div
          className="absolute w-[500px] h-[500px] rounded-full border pointer-events-none animate-pulse opacity-40"
          style={{ borderColor: "var(--color-border-default)" }}
        />
        <div
          className="absolute w-[320px] h-[320px] rounded-full border pointer-events-none opacity-60"
          style={{ borderColor: "var(--color-accent-gold)" }}
        />

        {/* Constelação de Obras */}
        <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-full overflow-y-auto no-scrollbar p-2">
          {activeGroup.memberAnimes.map((anime: Anime) => {
            const cover = anime.images?.webp?.large_image_url || anime.images?.jpg?.image_url;
            const localizedTitle = getLocalizedTitle(anime);
            return (
              <div
                key={anime.mal_id}
                onClick={() => onSelectAnime(anime)}
                className="group relative p-3 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center gap-3 shadow-lg transform hover:scale-[1.03]"
                style={{
                  backgroundColor: "var(--color-bg-surface)",
                  borderColor: "var(--color-border-default)",
                }}
              >
                {/* Miniatura do Nó */}
                <div
                  className="relative w-12 h-16 rounded-xl overflow-hidden flex-none border"
                  style={{
                    backgroundColor: "var(--color-bg-base)",
                    borderColor: "var(--color-border-default)",
                  }}
                >
                  <img src={cover} alt={localizedTitle} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-4 h-4 fill-current" style={{ color: "var(--color-accent-gold)" }} />
                  </div>
                </div>

                {/* Dados do Nó Genealógico */}
                <div className="min-w-0 flex-1">
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.2 rounded border"
                    style={{
                      backgroundColor: "var(--color-bg-raised)",
                      borderColor: "var(--color-border-highlight)",
                      color: "var(--color-accent-gold)",
                    }}
                  >
                    {anime.format || strings.labels.format}
                  </span>
                  <h4
                    className="font-serif text-xs font-bold truncate mt-1 transition-colors"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {localizedTitle}
                  </h4>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {anime.year || strings.labels.year} • {anime.format || strings.labels.format}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
