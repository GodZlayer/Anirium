import React, { useState } from "react";
import {
  Music,
  User,
  Film,
  Tv,
  X,
  Radio,
  Sparkles,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { EntityClubActions } from "./EntityClubActions";
import { EpisodeDiscussionFeed } from "./EpisodeDiscussionFeed";

export interface TrackWorkItem {
  id: string;
  title: string;
  format?: string;
  media?: string;
}

export interface TrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackId: string;
  title: string;
  trackType?: string;
  composerId?: string;
  composerName?: string;
  works?: TrackWorkItem[];
  onSelectWork?: (workId: string) => void;
  onSelectComposer?: (composerId: string) => void;
}

/**
 * TrackDetailModal (Micro-Módulo Canônico TGCode ~95 linhas)
 * Página / Tela da Entidade Faixa Musical / BGM na malha relacional pura:
 * - Exibe a faixa sonora
 * - Conecta ao Compositor da música
 * - Lista todas as obras onde a música tocou
 * - Ações do Clube (Avaliação e debate coletivo da trilha)
 */
export function TrackDetailModal({
  isOpen,
  onClose,
  trackId,
  title = "Trilha Sonora",
  trackType = "BGM",
  composerId,
  composerName = "Compositor",
  works = [],
  onSelectWork,
  onSelectComposer,
}: TrackModalProps) {
  const { tokens } = useDesignTheme();
  const [showForum, setShowForum] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[color:var(--wc-bgBase)]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: tokens.colors.bgSurface,
          borderColor: tokens.colors.borderHighlight || tokens.colors.borderDefault,
        }}
      >
        {/* Header da Trilha Sonora */}
        <div className="px-6 py-5 border-b border-[color:var(--wc-borderDefault)]/10 flex items-center justify-between bg-[color:var(--wc-bgBase)]/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {trackType.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">{trackId}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-1">{title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-800/60 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Ações Sociais da Trilha Sonora (Avaliação e Discussão) */}
          <EntityClubActions
            entityType="track"
            entityId={trackId}
            entityTitle={title}
            onOpenDiscussion={() => setShowForum(!showForum)}
          />

          {/* Compositor Conectado por ID */}
          {composerName && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-neutral-400 block">Compositor / Arranjador</span>
                  <span className="text-sm font-bold text-neutral-100">{composerName}</span>
                </div>
              </div>
              {composerId && onSelectComposer && (
                <button
                  onClick={() => onSelectComposer(composerId)}
                  className="px-3 py-1.5 rounded-xl border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-xs font-mono transition-colors"
                >
                  Ver Perfil do Criador ➔
                </button>
              )}
            </div>
          )}

          {/* Obras Onde Esta Trilha Tocou */}
          <div>
            <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              Obras que Utilizam Esta Trilha ({works.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {works.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onSelectWork?.(w.id)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 hover:border-amber-500/40 hover:bg-neutral-800/40 transition-all text-left"
                >
                  <div className="p-2 rounded-xl bg-neutral-800 text-neutral-400 shrink-0">
                    {w.format === "MOVIE" ? <Film className="w-4 h-4 text-amber-400" /> : <Tv className="w-4 h-4 text-purple-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-mono uppercase text-neutral-400 block">{w.format || w.media}</span>
                    <span className="text-sm font-semibold text-neutral-200 line-clamp-1 block">{w.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Debate Coletivo da Trilha Sonora */}
          {showForum && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-amber-500/20 animate-in fade-in">
              <EpisodeDiscussionFeed
                contextKey={`track:${trackId}`}
                contextType="track"
                contextTitle={`Discussão da Trilha: ${title}`}
                targetId={trackId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
