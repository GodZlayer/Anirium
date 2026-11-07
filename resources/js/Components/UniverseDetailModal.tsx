import React, { useState } from "react";
import {
  Compass,
  Layers,
  BookOpen,
  Tv,
  X,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { EntityClubActions } from "./EntityClubActions";
import { EpisodeDiscussionFeed } from "./EpisodeDiscussionFeed";

export interface UniverseModalProps {
  isOpen: boolean;
  onClose: () => void;
  universeId: string;
  universeTitle?: string;
  works?: Array<{
    id: string;
    media: string;
    title: string;
    format?: string;
    status?: string;
    episode_count?: number;
    image?: string;
    year?: number;
  }>;
  arcs?: Array<{
    id: string;
    title: string;
    classification?: string;
  }>;
  onSelectWork?: (workId: string) => void;
  onSelectArc?: (arcId: string) => void;
}

export function UniverseDetailModal({
  isOpen,
  onClose,
  universeId,
  universeTitle = "Canonical Universe",
  works = [],
  arcs = [],
  onSelectWork,
  onSelectArc,
}: UniverseModalProps) {
  const { tokens, strings } = useDesignTheme();
  const [showForum, setShowForum] = useState(false);

  if (!isOpen) return null;

  const originalWorks = works.filter((w) => w.media === "manga" || w.media === "novel");
  const adaptationWorks = works.filter((w) => w.media === "anime" || (w.media !== "manga" && w.media !== "novel"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[color:var(--wc-bgBase)]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: tokens.colors.bgSurface,
          borderColor: tokens.colors.borderHighlight || tokens.colors.borderDefault,
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[color:var(--wc-borderDefault)]/10 flex items-center justify-between bg-[color:var(--wc-bgBase)]/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {strings.labels?.universe || "UNIVERSO CANÔNICO"}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">{universeId}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-1">{universeTitle}</h2>
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
          {/* BARRA DE INTERAÇÃO DO CLUBE SECRETO (Nota, Favoritos, Fórum por Universo) */}
          <EntityClubActions
            entityType="universe"
            entityId={universeId}
            entityTitle={universeTitle}
            onOpenDiscussion={() => setShowForum(!showForum)}
          />

          {/* FÓRUM / DISCUSSÃO INTEGRADA DO UNIVERSO */}
          {showForum && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-amber-500/20 animate-in fade-in">
              <EpisodeDiscussionFeed
                contextKey={`universe:${universeId}`}
                contextType="universe"
                contextTitle={`Teorias & Lore do Universo: ${universeTitle}`}
                targetId={universeId}
              />
            </div>
          )}

          {/* Arcos Narrativos */}
          {arcs.length > 0 && (
            <div>
              <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                {strings.labels?.arcs || "Arcos Narrativos do Universo"} ({arcs.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {arcs.map((arc) => (
                  <button
                    key={arc.id}
                    onClick={() => onSelectArc?.(arc.id)}
                    className="flex flex-col text-left p-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 hover:border-amber-500/40 transition-all hover:scale-[1.02]"
                  >
                    <span className="text-[10px] font-mono uppercase text-amber-400/80 mb-1">
                      {arc.classification || "CANON"}
                    </span>
                    <span className="text-sm font-semibold text-neutral-200 line-clamp-1">{arc.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Obras Originais */}
          <div>
            <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-400" />
              {strings.labels?.sourceWorks || "Obras Originais (Raízes da Narrativa)"} ({originalWorks.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {originalWorks.map((work) => (
                <button
                  key={work.id}
                  onClick={() => onSelectWork?.(work.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 hover:border-blue-500/40 transition-all hover:scale-[1.02] text-left"
                >
                  <div className="w-10 h-14 rounded-lg bg-neutral-800 shrink-0 overflow-hidden">
                    {work.image && <img src={work.image} alt={work.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-mono uppercase text-blue-400 block">{work.media}</span>
                    <span className="text-sm font-semibold text-neutral-200 line-clamp-1 block">{work.title}</span>
                    {work.format && <span className="text-[10px] text-neutral-400">{work.format}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Obras Adaptadas */}
          <div>
            <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
              <Tv className="w-4 h-4 text-purple-400" />
              {strings.labels?.adaptations || "Produções Audiovisuais & Derivados"} ({adaptationWorks.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {adaptationWorks.map((work) => (
                <button
                  key={work.id}
                  onClick={() => onSelectWork?.(work.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 hover:border-purple-500/40 transition-all hover:scale-[1.02] text-left"
                >
                  <div className="w-10 h-14 rounded-lg bg-neutral-800 shrink-0 overflow-hidden">
                    {work.image && <img src={work.image} alt={work.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-mono uppercase text-purple-400 block">{work.format || work.media}</span>
                    <span className="text-sm font-semibold text-neutral-200 line-clamp-1 block">{work.title}</span>
                    {work.episode_count && (
                      <span className="text-[10px] text-neutral-400">{work.episode_count} eps</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
