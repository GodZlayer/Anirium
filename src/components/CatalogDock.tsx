"use client";

import React from "react";
import { Filter, Layers, Film } from "lucide-react";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";

interface CatalogDockProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedFormat: string;
  onSelectFormat: (format: string) => void;
  selectedGenre: string;
  onSelectGenre: (genre: string) => void;
  totalCount?: number;
}

/**
 * Micro-componente puro (Casca Branca ~60 linhas)
 * Dock central de filtragem e alternância de fatias Parquet com latência zero.
 */
export default function CatalogDock({
  activeTab,
  onTabChange,
  selectedFormat,
  onSelectFormat,
  selectedGenre,
  onSelectGenre,
  totalCount = 36552,
}: CatalogDockProps) {
  const { tokens, strings } = useDesignTheme();

  return (
    <div 
      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border backdrop-blur-md"
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      {/* 1. Categorias do Catálogo */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {["popular", "seasonal", "upcoming", "franchises"].map((tab) => {
          const isActive = activeTab === tab;
          const labelMap: Record<string, string> = {
            popular: strings.sections.popularReleases,
            seasonal: strings.sections.seasonalReleases,
            upcoming: strings.sections.upcomingReleases,
            franchises: strings.sections.canonicalFranchises,
          };

          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
              style={{
                backgroundColor: isActive ? tokens.colors.accentGold : "transparent",
                color: isActive ? tokens.colors.bgBase : tokens.colors.textSecondary,
              }}
            >
              {labelMap[tab] || tab}
            </button>
          );
        })}
      </div>

      {/* 2. Micro-filtros de Formato e Gênero */}
      <div className="flex items-center gap-2">
        <select
          value={selectedFormat}
          onChange={(e) => onSelectFormat(e.target.value)}
          aria-label="Filtrar por Formato"
          className="bg-black/30 border text-[11px] rounded-lg px-2.5 py-1 text-zinc-300 focus:outline-none"
          style={{ borderColor: tokens.colors.borderDefault }}
        >
          <option value="ALL">Todos os Formatos</option>
          {strings.formats.map((fmt) => (
            <option key={fmt.id} value={fmt.id}>{fmt.name}</option>
          ))}
        </select>

        <select
          value={selectedGenre}
          onChange={(e) => onSelectGenre(e.target.value)}
          aria-label="Filtrar por Gênero"
          className="bg-black/30 border text-[11px] rounded-lg px-2.5 py-1 text-zinc-300 focus:outline-none"
          style={{ borderColor: tokens.colors.borderDefault }}
        >
          <option value="ALL">Todos os Gêneros</option>
          {strings.genres.map((g) => (
            <option key={g.key} value={g.key}>{g.name}</option>
          ))}
        </select>

        <Tooltip text={strings.tooltips.parquetCache} position="left">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-700/50 bg-black/40 text-zinc-400">
            {totalCount.toLocaleString()} obras
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
