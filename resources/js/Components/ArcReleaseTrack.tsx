import React, { useState } from "react";
import { Play, Sparkles, Layers } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { AnimeRecord } from "./AnimeCard";

interface ArcReleaseTrackProps {
  anime: AnimeRecord;
  selectedEpisode: number;
  onSelectEpisode: (epNum: number) => void;
}

// Gera deterministamente cores vibrantes por arco baseando-se no ID ou índice
function getArcColor(arcIndex: number): { primary: string; secondary: string; name: string } {
  const ARC_PALETTES = [
    { primary: "#FF6B6B", secondary: "#FFA07A", name: "Arco 1: Introdução & Despertar" },
    { primary: "#4D96FF", secondary: "#6BCB77", name: "Arco 2: Batalha Territorial" },
    { primary: "#FFD93D", secondary: "#FF6B6B", name: "Arco 3: Invasão da Capital" },
    { primary: "#9B51E0", secondary: "#BB6BD9", name: "Arco 4: Guerra Ancestral" },
    { primary: "#00F2FE", secondary: "#4FACFE", name: "Arco 5: Clímax & Transcendência" },
  ];
  return ARC_PALETTES[arcIndex % ARC_PALETTES.length];
}

export function ArcReleaseTrack({
  anime,
  selectedEpisode,
  onSelectEpisode,
}: ArcReleaseTrackProps) {
  const { tokens } = useDesignTheme();
  const [viewMode, setViewMode] = useState<"arcs" | "releases">("arcs");

  const totalEpisodes = Math.max(1, anime.episodes_count || 24);
  const episodesArray = Array.from({ length: totalEpisodes }, (_, i) => i + 1);

  // Divide deterministamente em arcos de até 12 eps
  const episodesPerArc = 12;

  return (
    <div className="w-full flex flex-col gap-4 select-none">
      {/* Seletor Fluido entre Arcos e Lançamentos (comprime entre desenho e texto) */}
      <div className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: tokens.colors.borderDefault }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("arcs")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
            style={{
              backgroundColor: viewMode === "arcs" ? tokens.colors.accentGold : tokens.colors.bgSurface,
              color: viewMode === "arcs" ? tokens.colors.bgBase : tokens.colors.textMuted,
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Visão por Arcos</span>
          </button>

          <button
            onClick={() => setViewMode("releases")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
            style={{
              backgroundColor: viewMode === "releases" ? tokens.colors.accentGold : tokens.colors.bgSurface,
              color: viewMode === "releases" ? tokens.colors.bgBase : tokens.colors.textMuted,
            }}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Visão por Obras / Lançamentos</span>
          </button>
        </div>

        <span className="font-mono text-[11px]" style={{ color: tokens.colors.textMuted }}>
          {totalEpisodes} Episódios Catalogados
        </span>
      </div>

      {/* Grade de Episódios com Bolinhas Coloridas Multi-Tom */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
        {episodesArray.map((epNum) => {
          const arcIdx = Math.floor((epNum - 1) / episodesPerArc);
          const arcColors = getArcColor(arcIdx);
          const isSelected = epNum === selectedEpisode;

          return (
            <button
              key={epNum}
              onClick={() => onSelectEpisode(epNum)}
              className="flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-150 hover:scale-[1.02] active:scale-95 cursor-pointer"
              style={{
                backgroundColor: isSelected ? tokens.colors.bgSurface : tokens.colors.bgBase,
                borderColor: isSelected ? tokens.colors.accentGold : tokens.colors.borderDefault,
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Bolinha Colorida Indicadora do Arco (com 2 cores em degradê suave) */}
                <div
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                  style={{
                    background: `linear-gradient(135deg, ${arcColors.primary}, ${arcColors.secondary})`,
                  }}
                  title={arcColors.name}
                />
                <span className="font-mono text-xs font-bold truncate" style={{ color: isSelected ? tokens.colors.accentGold : tokens.colors.textMain }}>
                  Episódio {epNum}
                </span>
              </div>

              {isSelected && (
                <Play className="w-3 h-3 shrink-0 ml-1 fill-current" style={{ color: tokens.colors.accentGold }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
