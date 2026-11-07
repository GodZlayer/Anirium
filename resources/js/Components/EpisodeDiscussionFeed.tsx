import React, { useState } from "react";
import { useDiscussion } from "../lib/useDiscussion";
import { DISCUSSION_UNAVAILABLE } from "../lib/discussionStrings";
import { Send, MessageCircle, AlertTriangle, User } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";

export interface CommentItem {
  id: string;
  author: string;
  avatar?: string;
  content: string;
  isSpoiler?: boolean;
  timestamp: string;
}

interface EpisodeDiscussionFeedProps {
  contextKey: string;       // Chave única exata: ex. "universe:269", "work:269", "arc:269:arc-1", "episode:269:ep-1"
  contextType: string;      // "universe" | "work" | "season" | "arc" | "episode"
  contextTitle: string;     // Nome contextual dinâmico (ex: "Universo Bleach", "Obra: Bleach", "Arco Soul Society", "Episódio 1")
  targetId: string | number;
  episodeNum?: number;
  isAuthenticated?: boolean;
  onPostComment?: (content: string, isSpoiler: boolean) => void;
}

export function EpisodeDiscussionFeed({
  contextKey,
  contextType,
  contextTitle,
  targetId,
  episodeNum = 1,
  isAuthenticated = false,
  onPostComment,
}: EpisodeDiscussionFeedProps) {
  const { tokens, language } = useDesignTheme();
  const { comments, newText, setNewText, isSpoiler, setIsSpoiler, busy, error, handleSubmit } = useDiscussion(contextKey, contextType, language, isAuthenticated, onPostComment);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});

  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const levelBadgeLabel =
    contextType === "universe"
      ? "UNIVERSO"
      : contextType === "work"
      ? "OBRA"
      : contextType === "season"
      ? "TEMPORADA"
      : contextType === "arc"
      ? "ARCO"
      : `EPISÓDIO ${episodeNum}`;

  return (
    <div className="w-full flex flex-col gap-4 select-none">
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: tokens.colors.borderDefault }}>
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 text-[#FFC766] shrink-0" />
          <span
            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0"
            style={{
              backgroundColor: "rgba(255, 199, 102, 0.12)",
              borderColor: tokens.colors.accentGold,
              color: tokens.colors.accentGold,
            }}
          >
            {levelBadgeLabel}
          </span>
          <h4 className="font-extrabold text-xs uppercase tracking-wider text-[color:var(--wc-textPrimary)] truncate">
            Conversas • {contextTitle}
          </h4>
        </div>
        <span className="font-mono text-[11px] shrink-0" style={{ color: tokens.colors.textMuted }}>
          {comments.length} Mensagens
        </span>
      </div>

      {error && <p role="alert" className="text-xs text-[color:var(--wc-stateWarning)]">{DISCUSSION_UNAVAILABLE[language] || DISCUSSION_UNAVAILABLE["en-US"]}</p>}

      {/* Input para Escrever Comentário */}
      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="relative">
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder={`Escreva seu comentário sobre ${contextTitle} (${levelBadgeLabel})...`}
              rows={2}
              className="w-full p-3 rounded-xl border text-xs font-mono resize-none focus:outline-none transition-all"
              style={{
                backgroundColor: tokens.colors.bgSurface,
                borderColor: tokens.colors.borderDefault,
                color: tokens.colors.textPrimary,
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[11px] font-mono cursor-pointer select-none" style={{ color: tokens.colors.textMuted }}>
              <input
                type="checkbox"
                checked={isSpoiler}
                onChange={(e) => setIsSpoiler(e.target.checked)}
                className="rounded accent-[#FFC766]"
              />
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-[color:var(--wc-stateWarning)]" />
                Marcar como Spoiler
              </span>
            </label>

            <button
              type="submit"
              disabled={busy || !newText.trim()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-40 cursor-pointer"
              style={{
                backgroundColor: tokens.colors.accentGold,
                color: tokens.colors.bgBase,
              }}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar</span>
            </button>
          </div>
        </form>
      ) : (
        <div
          className="p-3.5 rounded-xl border text-center font-mono text-xs"
          style={{
            backgroundColor: tokens.colors.bgSurface,
            borderColor: tokens.colors.borderDefault,
            color: tokens.colors.textMuted,
          }}
        >
          Faça login com sua conta Google para comentar em <strong>{contextTitle}</strong> ({levelBadgeLabel}).
        </div>
      )}

      {/* Lista de Comentários */}
      <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
        {comments.map((c) => {
          const isHidden = c.isSpoiler && !revealedSpoilers[c.id];

          return (
            <div
              key={c.id}
              className="p-3 rounded-xl border flex flex-col gap-1.5 transition-all"
              style={{
                backgroundColor: tokens.colors.bgBase,
                borderColor: tokens.colors.borderDefault,
              }}
            >
              <div className="flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-1.5 font-bold" style={{ color: tokens.colors.accentGold }}>
                  <User className="w-3 h-3" />
                  <span>{c.author}</span>
                </div>
                <span style={{ color: tokens.colors.textMuted }}>{c.timestamp}</span>
              </div>

              {isHidden ? (
                <button
                  onClick={() => toggleSpoiler(c.id)}
                  className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-[color:var(--wc-stateWarning)]/30 bg-[color:var(--wc-stateWarning)]/10 text-[color:var(--wc-stateWarning)] font-mono text-[11px] cursor-pointer hover:bg-[color:var(--wc-stateWarning)]/20 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Este comentário contém spoiler. Clique para revelar.</span>
                </button>
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: tokens.colors.textPrimary }}>
                  {c.content}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
