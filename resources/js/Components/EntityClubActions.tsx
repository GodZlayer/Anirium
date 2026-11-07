import React, { useState } from "react";
import {
  Star,
  Bookmark,
  MessageSquare,
  CheckCircle2,
  Clock,
  Sparkles,
  Share2,
  ThumbsUp,
  Award,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";

export interface EntityClubActionsProps {
  entityType: "universe" | "work" | "arc" | "season" | "episode" | "chapter" | "track" | "creator";
  entityId: string | number;
  entityTitle: string;
  userScore?: number | null;
  isBookmarked?: boolean;
  userStatus?: "reading" | "watching" | "completed" | "plan_to" | "dropped" | null;
  commentsCount?: number;
  onRate?: (score: number) => void;
  onToggleBookmark?: () => void;
  onUpdateStatus?: (status: "reading" | "watching" | "completed" | "plan_to" | "dropped") => void;
  onOpenDiscussion?: () => void;
}

/**
 * EntityClubActions (Micro-Módulo Canônico TGCode)
 * Barra de interação universal do Clube Secreto para qualquer entidade do grafo:
 * - Nota pessoal (1 a 10)
 * - Favoritar / Lista de Leitura / Coleção
 * - Estado (Lendo/Assistindo, Concluído, Na Fila)
 * - Atalho para o Fórum / Discussão com contagem de comentários
 */
export function EntityClubActions({
  entityType,
  entityId,
  entityTitle,
  userScore = null,
  isBookmarked = false,
  userStatus = null,
  commentsCount = 0,
  onRate,
  onToggleBookmark,
  onUpdateStatus,
  onOpenDiscussion,
}: EntityClubActionsProps) {
  const { tokens } = useDesignTheme();
  const [hoverScore, setHoverScore] = useState<number | null>(null);

  const statusOptions = [
    { key: "watching", label: "Consumindo" },
    { key: "completed", label: "Concluído" },
    { key: "plan_to", label: "Na Fila" },
    { key: "dropped", label: "Pausado" },
  ] as const;

  return (
    <div
      className="w-full flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border"
      style={{
        backgroundColor: "rgba(20, 20, 24, 0.6)",
        borderColor: tokens.colors.borderDefault || "rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* 1. Avaliação do Clube (Estrelas / Nota 1 a 10) */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
            const isFilled = (hoverScore ?? userScore ?? 0) >= star;
            return (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverScore(star)}
                onMouseLeave={() => setHoverScore(null)}
                onClick={() => onRate?.(star)}
                className="p-0.5 hover:scale-125 transition-transform"
                title={`Nota ${star}/10`}
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    isFilled ? "fill-amber-400 text-amber-400" : "text-neutral-600"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <span className="text-[11px] font-mono font-bold text-amber-400 min-w-[28px]">
          {userScore ? `${userScore}/10` : "Nota"}
        </span>
      </div>

      {/* 2. Seleção de Status do Clube */}
      <div className="flex items-center gap-1.5">
        {statusOptions.map((opt) => {
          const isActive = userStatus === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onUpdateStatus?.(opt.key)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-mono transition-all ${
                isActive
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                  : "bg-neutral-900/60 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* 3. Favoritar & Fórum da Entidade */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={onToggleBookmark}
          className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-mono ${
            isBookmarked
              ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
              : "bg-neutral-900/60 text-neutral-400 hover:text-white border border-neutral-800"
          }`}
          title={isBookmarked ? "Favoritado no Clube" : "Adicionar aos Favoritos"}
        >
          <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-amber-400" : ""}`} />
        </button>

        <button
          type="button"
          onClick={onOpenDiscussion}
          className="px-3 py-1.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
          title="Fórum e Teorias da Entidade"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#FFC766]" />
          <span>Discussão</span>
          {commentsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400">
              {commentsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
