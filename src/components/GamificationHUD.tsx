"use client";

import React from "react";
import { Award, Zap, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";

interface GamificationHUDProps {
  level: number;
  userCompletedQuests?: string[];
  activeScore?: number;
}

/**
 * Micro-componente puro (Casca Branca ~50 linhas)
 * Renderiza o progresso de quests e status de gamificação sem poluição visual.
 */
export default function GamificationHUD({
  level,
  userCompletedQuests = [],
  activeScore = 0,
}: GamificationHUDProps) {
  const { tokens, strings } = useDesignTheme();
  const currentLevelInfo = strings.gamification.levels[level as 0 | 1 | 2 | 3] || strings.gamification.levels[0];

  return (
    <div 
      className="flex items-center gap-2 sm:gap-4 p-2 sm:px-4 sm:py-2 rounded-2xl backdrop-blur-md border text-xs"
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      <Tooltip text={currentLevelInfo.tooltip} position="bottom">
        <div 
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[11px]"
          style={{
            backgroundColor: `${tokens.colors.accentGold}20`,
            color: tokens.colors.accentGold,
            border: `1px solid ${tokens.colors.accentGold}40`,
          }}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{currentLevelInfo.badge}</span>
        </div>
      </Tooltip>

      <div className="hidden md:flex items-center gap-3">
        {strings.quests.map((quest) => {
          const isDone = userCompletedQuests.includes(quest.id);
          return (
            <Tooltip key={quest.id} text={`${quest.title}: ${quest.desc}`} position="bottom">
              <div 
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition-all cursor-pointer"
                style={{
                  backgroundColor: isDone ? `${tokens.colors.stateSuccess}15` : "transparent",
                  borderColor: isDone ? tokens.colors.stateSuccess : tokens.colors.borderDefault,
                  color: isDone ? tokens.colors.stateSuccess : tokens.colors.textMuted,
                }}
              >
                {isDone ? <CheckCircle2 className="w-3 h-3" /> : <Award className="w-3 h-3" />}
                <span className="text-[10px] font-mono">{quest.rewardBadge}</span>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
