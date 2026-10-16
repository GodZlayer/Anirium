import React from "react";
import { GitBranch, Orbit, Sparkles } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";

interface FranchiseNode {
  id: string;
  name: string;
  universe: string;
  seasonCount: number;
  episodesCount: number;
  status: string;
  coords: { x: number; y: number };
}

const FRANCHISE_DEMO: FranchiseNode[] = [
  { id: "bleach-og", name: "Bleach", universe: "Soul Society Saga", seasonCount: 16, episodesCount: 366, status: "Canon", coords: { x: 20, y: 50 } },
  { id: "bleach-tybw", name: "Bleach: TYBW", universe: "Thousand-Year Blood War", seasonCount: 3, episodesCount: 39, status: "Canon Sequel", coords: { x: 50, y: 30 } },
  { id: "bleach-btw", name: "Burn the Witch", universe: "Reverse London (Spinoff)", seasonCount: 1, episodesCount: 3, status: "Spinoff", coords: { x: 80, y: 65 } },
];

export function OrbitalFranchiseMap() {
  const { tokens, strings } = useDesignTheme();

  return (
    <div
      className="relative w-full h-[320px] rounded-3xl border overflow-hidden p-6 flex flex-col justify-between"
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      {/* Título e Badges do Mapa */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Orbit className="w-4 h-4" style={{ color: tokens.colors.accentGold }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: tokens.colors.textPrimary }}>
            {strings.labels.franchiseMapTitle}
          </h3>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border backdrop-blur-md"
          style={{
            backgroundColor: tokens.colors.bgOverlay,
            borderColor: tokens.colors.borderDefault,
            color: tokens.colors.accentGold,
          }}
        >
          {strings.labels.franchiseSubheader}
        </span>
      </div>

      {/* Arena Orbital com Conexões SVG */}
      <div className="relative w-full h-full my-2">
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <line
            x1="20%"
            y1="50%"
            x2="50%"
            y2="30%"
            stroke={tokens.colors.borderHighlight}
            strokeWidth="2"
            strokeDasharray="4 4"
            className="opacity-40"
          />
          <line
            x1="50%"
            y1="30%"
            x2="80%"
            y2="65%"
            stroke={tokens.colors.accentAmber}
            strokeWidth="1.5"
            strokeDasharray="2 2"
            className="opacity-40"
          />
        </svg>

        {FRANCHISE_DEMO.map((node) => (
          <div
            key={node.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer transition-transform hover:scale-110"
            style={{ left: `${node.coords.x}%`, top: `${node.coords.y}%` }}
          >
            <div
              className="px-3.5 py-2 rounded-2xl border backdrop-blur-md shadow-lg flex flex-col gap-0.5"
              style={{
                backgroundColor: tokens.colors.bgOverlay,
                borderColor: tokens.colors.borderHighlight,
              }}
            >
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" style={{ color: tokens.colors.accentGold }} />
                <span className="text-[11px] font-black" style={{ color: tokens.colors.textPrimary }}>
                  {node.name}
                </span>
              </div>
              <span className="text-[9px] font-medium" style={{ color: tokens.colors.textMuted }}>
                {node.universe} • {node.episodesCount} eps
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] z-10" style={{ color: tokens.colors.textMuted }}>
        <span>{strings.labels.franchiseFooterNote}</span>
        <span className="font-mono">Genealogia Shonen V2</span>
      </div>
    </div>
  );
}
