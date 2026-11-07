import React from "react";
import {
  TrendingUp,
  BrainCircuit,
  Award,
  Sparkles,
  Users,
  Compass,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";

export interface EntityReputationMetrics {
  priorExternalScore?: number | null; // Nota externa consolidada (MAL/AniList)
  liveAniriumScore?: number | null;    // Nota viva calculada no Anirium
  confidenceLevel?: number;            // Índice de confiança de 0 a 100%
  totalEvidencesCount?: number;        // Quantidade de interações/votos do clube
  retentionImpactPercentage?: number;  // Impacto da taxa de conclusão real (+12%, etc.)
  derivedDirectionCapacity?: number;   // Índice propagado para o diretor
}

interface EntityGraphInsightWidgetProps {
  metrics: EntityReputationMetrics;
  entityKind: "universe" | "work" | "arc" | "episode" | "creator";
}

/**
 * Micro-Módulo Puro (~60 linhas): EntityGraphInsightWidget (TGCode Standard)
 * Renderiza em tempo real os nós de retroalimentação bayesiana da entidade:
 * - Mostra o contraste entre o Prior Externo e a Nota Viva do Clube
 * - Exibe o grau de confiança da métrica sem computação pesada em runtime
 */
export function EntityGraphInsightWidget({
  metrics,
  entityKind,
}: EntityGraphInsightWidgetProps) {
  const { tokens } = useDesignTheme();

  const {
    priorExternalScore = 7.5,
    liveAniriumScore = 8.1,
    confidenceLevel = 88,
    totalEvidencesCount = 142,
    retentionImpactPercentage = 8,
  } = metrics;

  return (
    <div
      className="w-full p-4 rounded-2xl border"
      style={{
        backgroundColor: "rgba(18, 18, 22, 0.7)",
        borderColor: tokens.colors.borderHighlight || "rgba(255, 199, 102, 0.2)",
      }}
    >
      <div className="flex items-center justify-between mb-3 border-b border-neutral-800/80 pb-2">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-[#FFC766]" />
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-300">
            Grafo Vivo de Retroalimentação (Motor Bayesiano)
          </span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          Confiança: {confidenceLevel}%
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Prior Externo */}
        <div className="p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
          <span className="text-[9px] font-mono text-neutral-500 uppercase block">Prior Externo</span>
          <span className="text-sm font-mono font-bold text-neutral-300 block mt-0.5">
            ★ {priorExternalScore ? priorExternalScore.toFixed(2) : "N/A"}
          </span>
          <span className="text-[8px] text-neutral-500">Média histórica global</span>
        </div>

        {/* Nota Viva do Clube */}
        <div className="p-2.5 rounded-xl bg-neutral-950/60 border border-amber-500/20">
          <span className="text-[9px] font-mono text-amber-400/80 uppercase block">Score Vivo Anirium</span>
          <span className="text-sm font-mono font-bold text-amber-400 block mt-0.5">
            ★ {liveAniriumScore ? liveAniriumScore.toFixed(2) : "Calculando"}
          </span>
          <span className="text-[8px] text-neutral-500">Ponderado pelo clube</span>
        </div>

        {/* Evidências Observadas */}
        <div className="p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
          <span className="text-[9px] font-mono text-neutral-500 uppercase block">Evidências / Votos</span>
          <span className="text-sm font-mono font-bold text-neutral-200 block mt-0.5">
            {totalEvidencesCount} ações
          </span>
          <span className="text-[8px] text-neutral-500">Tempo, notas e retenção</span>
        </div>

        {/* Propagação no Grafo */}
        <div className="p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
          <span className="text-[9px] font-mono text-neutral-500 uppercase block">Propagação</span>
          <div className="flex items-center gap-1 mt-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-mono font-bold text-emerald-400">
              +{retentionImpactPercentage}%
            </span>
          </div>
          <span className="text-[8px] text-neutral-500">Alimenta nós conectados</span>
        </div>
      </div>
    </div>
  );
}
