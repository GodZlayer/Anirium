import { usePresentation as __usePresentation } from "../lib/usePresentation";
import React from "react";
import { Trophy, Flame, Clock, Award, Shield, CheckCircle2 } from "lucide-react";
import { TelemetryState } from "../lib/telemetryXpLoop";
import { useDesignTheme } from "../context/ThemeContext";
import { achievementLabel } from "../lib/achievementCatalog.mjs";

interface ProfileGamificationHubProps {
  telemetry: TelemetryState;
  onSelectTitle: (title: string) => void;
  activeTitleId: string;
}

export function ProfileGamificationHub({
  telemetry,
  onSelectTitle,
  activeTitleId,
}: ProfileGamificationHubProps) {
  const __presentation = __usePresentation();
  const { tokens, language } = useDesignTheme();
  const clampedXp = Math.min(100, Math.max(0, telemetry.xp));

  const stats = [
    { label: "Episódios", value: telemetry.episodesCompleted, bonus: "+10 XP", color: "#38BDF8" },
    { label: "Arcos", value: telemetry.arcsCompleted, bonus: "+50 XP", color: "#818CF8" },
    { label: "Temporadas", value: telemetry.seasonsCompleted, bonus: "+100 XP", color: "#A78BFA" },
    { label: "Obras 100%", value: telemetry.worksCompleted, bonus: "+100 XP", color: "#F472B6" },
    { label: "Universos 100%", value: telemetry.universesCompleted, bonus: "+1.000 XP", color: "#FFC766" },
    { label: "Minutos Ativos", value: `${telemetry.activeMinutes}m`, bonus: "+1 XP/min", color: "#34D399" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Bloco de Progressão Central (Curva RPG Exata) */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#FFC766]" />
            <span className="text-sm font-black text-[color:var(--wc-textPrimary)]">{__presentation.text("I18N_DICTIONARY:labels.levelLabel")}{telemetry.levelNumber}
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-[#FFC766]">
            {telemetry.currentLevelXp} / {telemetry.nextLevelRequiredXp} XP ({clampedXp}%)
          </span>
        </div>

        {/* Barra de XP */}
        <div className="w-full h-2.5 rounded-full bg-[color:var(--wc-bgSurface)]/10 overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-500 shadow-sm"
            style={{
              width: `${clampedXp}%`,
              backgroundColor: tokens.colors.accentGold,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-[color:var(--wc-textMuted)]">
          <span>XP Total Acumulado: <strong className="text-[color:var(--wc-textPrimary)]">{telemetry.totalXp} XP</strong></span>
          <span>Faltam: <strong className="text-[#FFC766]">{Math.max(0, telemetry.nextLevelRequiredXp - telemetry.currentLevelXp)} XP</strong></span>
        </div>
      </div>

      {/* Grid de Presença e Streaks */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/30 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1 text-[color:var(--wc-stateWarning)] mb-1">
            <Flame className="w-4 h-4 fill-[color:var(--wc-stateWarning)]" />
            <span className="text-xs font-bold font-mono">Streak Atual</span>
          </div>
          <span className="text-lg font-black text-[color:var(--wc-textPrimary)] font-mono">{telemetry.currentStreak}d</span>
          <span className="text-[10px] text-[color:var(--wc-textMuted)] mt-0.5">Dias Consecutivos</span>
        </div>

        <div className="p-3 rounded-xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/30 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1 text-orange-400 mb-1">
            <Shield className="w-4 h-4" />
            <span className="text-xs font-bold font-mono">Recorde</span>
          </div>
          <span className="text-lg font-black text-[color:var(--wc-textPrimary)] font-mono">{telemetry.longestStreak}d</span>
          <span className="text-[10px] text-[color:var(--wc-textMuted)] mt-0.5">Maior Sequência</span>
        </div>

        <div className="p-3 rounded-xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/30 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1 text-[color:var(--wc-stateSuccess)] mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-bold font-mono">Bônus Streak</span>
          </div>
          <span className="text-lg font-black text-[color:var(--wc-stateSuccess)] font-mono">+{telemetry.streakXp}</span>
          <span className="text-[10px] text-[color:var(--wc-textMuted)] mt-0.5">XP de Presença</span>
        </div>
      </div>

      {/* Métricas de Conclusão do Catálogo */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex flex-col gap-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--wc-textMuted)]">
          Conquistas do Catálogo Reversível
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {stats.map((item) => (
            <div
              key={item.label}
              className="p-2.5 rounded-xl border border-[color:var(--wc-borderDefault)]/5 bg-white/[0.03] flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] text-[color:var(--wc-textMuted)]">
                <span>{item.label}</span>
                <span className="font-mono text-[10px] font-bold" style={{ color: item.color }}>
                  {item.bonus}
                </span>
              </div>
              <strong className="text-base font-black text-[color:var(--wc-textPrimary)] font-mono mt-1">
                {item.value}
              </strong>
            </div>
          ))}
        </div>
      </div>

      {/* Títulos Desbloqueados */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--wc-textMuted)] flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[#FFC766]" />
            Títulos Desbloqueados ({telemetry.unlockedTitles.length})
          </span>
          <span className="text-[10px] text-[color:var(--wc-textMuted)] font-mono">Clique para equipar</span>
        </div>

        <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
          {telemetry.unlockedTitles.length === 0 ? (
            <span className="text-xs text-[color:var(--wc-textMuted)] italic">Complete episódios e universos para desbloquear títulos exclusivos!</span>
          ) : (
            telemetry.unlockedTitleIds.map((t) => {
              const isSelected = activeTitleId === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onSelectTitle(t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer hover:scale-105"
                  style={{
                    backgroundColor: isSelected ? "rgba(255, 199, 102, 0.16)" : "rgba(255,255,255,0.04)",
                    borderColor: isSelected ? tokens.colors.accentGold : "rgba(255,255,255,0.1)",
                    color: isSelected ? tokens.colors.accentGold : "#D4D4D8",
                  }}
                >
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#FFC766]" />}
                  {achievementLabel(t, language)}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
