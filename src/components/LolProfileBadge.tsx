"use client";

import React, { useState } from "react";
import { ShieldCheck, Award, Zap } from "lucide-react";
import { useUser } from "@/context/UserContext";
import Tooltip from "./Tooltip";

interface LolProfileBadgeProps {
  onOpenProfile?: () => void;
  onOpenLevelSwitcher?: () => void;
}

/**
 * Micro-componente puro (Casca Branca ~50 linhas)
 * Sistema de Identidade Estilo LoL:
 * - Moldura de Nível (0 a infinito) evolutiva
 * - Anel de XP circular pulsante alimentado por telemetria
 * - Título conquistado ativo (ex.: 'Fã Master Bleach')
 * - Badge discreto de Tier (0: Visitante, 1: Membro, 2: Anirium+, 3: Admin)
 */
export default function LolProfileBadge({ onOpenProfile, onOpenLevelSwitcher }: LolProfileBadgeProps) {
  const { user, level: tier } = useUser();
  const xp = user?.settings?.telemetryHud ? 78 : 42; // Exemplo de telemetria/XP ativo (0 a 100)
  const userLevelNumber = user?.created_at ? Math.max(1, Math.floor((Date.now() - user.created_at) / (1000 * 60 * 60 * 24 * 7))) : 1;
  const userTitle = tier === 3 ? "Admin Geral" : tier === 2 ? "Fã Master Bleach" : tier === 1 ? "Explorador Canônico" : "Visitante";

  const tierLabels = ["Visitante", "Membro", "Anirium+", "Admin"];
  const tierColors = ["#8E8E93", "#38BDF8", "#FFC766", "#E5484D"];

  return (
    <div className="flex items-center gap-2 select-none">
      {/* Moldura de Avatar estilo LoL com anel de XP circular */}
      <Tooltip text={`Nível ${userLevelNumber} • ${xp}% para o próximo nível • Título: ${userTitle}`} position="bottom">
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
