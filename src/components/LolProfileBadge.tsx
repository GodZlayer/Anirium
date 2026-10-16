"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useDesignTheme } from "@/context/ThemeContext";
import { loadTelemetryState, TelemetryState } from "@/lib/telemetryXpLoop";
import Tooltip from "./Tooltip";

interface LolProfileBadgeProps {
  onOpenProfile?: () => void;
  onOpenLevelSwitcher?: () => void;
}

/**
 * Micro-componente puro (Casca Branca ~50 linhas)
 * Sistema de Identidade Estilo LoL:
 * - Moldura de Nível (0 a infinito) evolutiva conectada à telemetria real
 * - Anel de XP circular pulsante reativo em tempo real
 * - Título conquistado dinâmico
 * - Badge de Tier (Visitante, Membro, Anirium+, Admin)
 */
export default function LolProfileBadge({ onOpenProfile, onOpenLevelSwitcher }: LolProfileBadgeProps) {
  const { user, level: tier } = useUser();
  const { strings, tokens } = useDesignTheme();
  const [telemetry, setTelemetry] = useState<TelemetryState>(() => loadTelemetryState());

  useEffect(() => {
    const handleUpdate = (e: CustomEvent<TelemetryState>) => {
      setTelemetry(e.detail);
    };
    window.addEventListener("anirium_xp_update", handleUpdate as EventListener);
    return () => window.removeEventListener("anirium_xp_update", handleUpdate as EventListener);
  }, []);

  const xp = telemetry.xp;
  const userLevelNumber = telemetry.levelNumber;
  const userTitle = telemetry.title || (tier === 3 ? strings.tiers.admin : tier === 2 ? strings.tiers.plus : tier === 1 ? strings.tiers.member : strings.tiers.guest);

  const tierLabels = [strings.tiers.guest, strings.tiers.member, strings.tiers.plus, strings.tiers.admin];
  const tierColors = ["#8E8E93", "#38BDF8", "var(--color-accent-gold)", "#E5484D"];

  return (
    <div className="flex items-center gap-2 select-none">
      {/* Moldura de Avatar estilo LoL com anel de XP circular */}
      <Tooltip text={`${strings.labels.levelLabel} ${userLevelNumber} • ${xp}% ${strings.labels.xpToNext} • ${userTitle}`} position="bottom">
        <div
          onClick={onOpenProfile}
          className="relative group cursor-pointer flex items-center justify-center p-0.5"
        >
          {/* Anel SVG de XP circular */}
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-zinc-800"
              strokeWidth="2.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="transition-all duration-700 ease-out"
              strokeDasharray={`${xp}, 100`}
              strokeWidth="2.5"
              stroke={tierColors[tier] || "#FFC766"}
              strokeLinecap="round"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>

          {/* Imagem do Avatar Central */}
          <div className="absolute inset-1 rounded-full overflow-hidden bg-black/60 border border-zinc-700/60 group-hover:border-amber-400 transition-colors">
            <img
              src={user?.avatar_url || "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80"}
              alt={user?.display_name || "Perfil"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </div>

          {/* Número do Nível na Base da Moldura */}
          <div className="absolute -bottom-1 px-1.5 py-0.2 rounded-full bg-[#141418] border border-zinc-700 text-[9px] font-mono font-bold text-amber-300 shadow-sm leading-none flex items-center justify-center">
            {userLevelNumber}
          </div>
        </div>
      </Tooltip>

      {/* Identificação de Título e Tier */}
      <div className="hidden sm:flex flex-col text-left">
        <button
          onClick={onOpenProfile}
          className="text-xs font-semibold text-zinc-100 hover:text-amber-300 transition-colors truncate max-w-[120px]"
        >
          {user?.display_name || "Visitante"}
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[95px]">{userTitle}</span>
          <Tooltip text={`Tier da conta: ${tierLabels[tier] || "Visitante"}`} position="bottom">
            <button
              onClick={onOpenLevelSwitcher}
              className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase transition-colors"
              style={{
                backgroundColor: `${tierColors[tier]}20`,
                color: tierColors[tier],
                border: `1px solid ${tierColors[tier]}40`,
              }}
            >
              {tierLabels[tier]}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
