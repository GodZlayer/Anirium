import React from "react";
import { Sparkles, Layers, ShieldCheck, Filter } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { CATALOG_STRINGS } from "../lib/catalogStrings";

interface DribbbleContentSwitchersProps {
  viewMode: "arcs" | "releases";
  onChangeViewMode: (mode: "arcs" | "releases") => void;
  hideFillers: boolean;
  onToggleHideFillers: () => void;
  countLabel?: string;
  showModeToggle?: boolean;
  showClassification?: boolean;
}

/**
 * Switcher Fluido Superior (Inspirado no Dribbble Light/Dark Toggle Switcher)
 * Transição suave com pílula deslizante física, textura acrílica e toggle de canônico/sem fillers.
 */
export function DribbbleContentSwitchers({
  viewMode,
  onChangeViewMode,
  hideFillers,
  onToggleHideFillers,
  countLabel,
  showModeToggle = true,
  showClassification = false,
}: DribbbleContentSwitchersProps) {
  const { tokens, language } = useDesignTheme();
  const labels = CATALOG_STRINGS[language] || CATALOG_STRINGS["pt-BR"];

  return (
    <div className="w-full flex items-center justify-end gap-3 select-none flex-wrap">
      {/* Switcher Fluido estilo Dribbble: Arcos <-> Lançamentos (Exclusivo do Universo) */}
      {showModeToggle && (
        <div
          className="relative flex items-center p-1 rounded-full border shadow-inner backdrop-blur-md transition-all duration-300"
          style={{
            backgroundColor: tokens.colors.bgSurface,
            borderColor: tokens.colors.borderDefault,
          }}
        >
          {/* Pílula Deslizante de Destaque */}
          <div
            className="absolute top-1 bottom-1 rounded-full shadow-lg transition-all duration-300 ease-out"
            style={{
              backgroundColor: tokens.colors.accentGold,
              left: viewMode === "arcs" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
            }}
          />

          {/* Opção 1: Modo Arcos */}
          <button
            onClick={() => onChangeViewMode("arcs")}
            className="relative z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold transition-colors duration-200 cursor-pointer"
            style={{
              color: viewMode === "arcs" ? tokens.colors.bgBase : tokens.colors.textMuted,
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Arcos Narrativos</span>
          </button>

          {/* Opção 2: Modo Lançamentos */}
          <button
            onClick={() => onChangeViewMode("releases")}
            className="relative z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold transition-colors duration-200 cursor-pointer"
            style={{
              color: viewMode === "releases" ? tokens.colors.bgBase : tokens.colors.textMuted,
            }}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Obras (Lançamentos)</span>
          </button>
        </div>
      )}

      {/* Direita: Toggle de Filtro Canônico / Ocultar Fillers + Contador */}
      <div className="flex items-center gap-3">
        {showClassification && <button
          onClick={onToggleHideFillers}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-semibold transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
          style={{
            backgroundColor: hideFillers ? "rgba(77, 203, 119, 0.15)" : tokens.colors.bgSurface,
            borderColor: hideFillers ? "#6BCB77" : tokens.colors.borderDefault,
            color: hideFillers ? "#6BCB77" : tokens.colors.textMuted,
          }}
          title={hideFillers ? labels.withoutFillers : labels.withFillers}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{hideFillers ? labels.withoutFillers : labels.withFillers}</span>
        </button>}

        {countLabel && (
          <span className="font-mono text-[11px] hidden sm:inline" style={{ color: tokens.colors.textMuted }}>
            {countLabel}
          </span>
        )}
      </div>
    </div>
  );
}
