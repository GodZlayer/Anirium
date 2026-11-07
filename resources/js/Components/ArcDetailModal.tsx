import React, { useState } from "react";
import {
  GitCommit,
  BookOpen,
  Tv,
  Film,
  FileText,
  X,
  CheckCircle2,
  Users,
  Compass,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { EntityClubActions } from "./EntityClubActions";
import { EpisodeDiscussionFeed } from "./EpisodeDiscussionFeed";

export interface ArcManifestation {
  workId: string;
  title: string;
  media: string;
  format?: string;
  rangeLabel?: string;
}

export interface ArcModalProps {
  isOpen: boolean;
  onClose: () => void;
  arcId: string;
  arcTitle?: string;
  classification?: string;
  manifestations?: ArcManifestation[];
  sourceStart?: string;
  sourceEnd?: string;
  episodeStart?: number;
  episodeEnd?: number;
  episodes?: Array<{ id: string; number: number; title?: string }>;
  onSelectManifestation?: (workId: string) => void;
  onSelectEpisode?: (episodeId: string) => void;
}

export function ArcDetailModal({
  isOpen,
  onClose,
  arcId,
  arcTitle = "Narrative Arc",
  classification = "CANON",
  manifestations = [],
  sourceStart = "Vol 7, Cap 54",
  sourceEnd = "Vol 8, Cap 69",
  episodeStart = 1,
  episodeEnd = 7,
  episodes = [],
  onSelectManifestation,
  onSelectEpisode,
}: ArcModalProps) {
  const { tokens } = useDesignTheme();
  const [showForum, setShowForum] = useState(true);

  if (!isOpen) return null;

  const isCanon = classification.toUpperCase().includes("CANON");

  // Se nenhuma manifestação for injetada via props, usamos a decomposição canônica da narrativa
  const activeManifestations: ArcManifestation[] = manifestations.length > 0
    ? manifestations
    : [
        {
          workId: "manga-root",
          title: "Mangá Original",
          media: "manga",
          format: "MANGA",
          rangeLabel: `${sourceStart} ➔ ${sourceEnd}`,
        },
        {
          workId: "tv-adaptation",
          title: "Série TV (Arco)",
          media: "anime",
          format: "TV",
          rangeLabel: `${episodeEnd - episodeStart + 1} Episódios`,
        },
        {
          workId: "movie-adaptation",
          title: "Filme Cinematográfico",
          media: "anime",
          format: "MOVIE",
          rangeLabel: "Longa-metragem (117 min)",
        },
      ];

  const getMediaIcon = (format?: string, media?: string) => {
    if (format === "MOVIE") return <Film className="w-5 h-5 text-amber-400 shrink-0" />;
    if (media === "manga") return <BookOpen className="w-5 h-5 text-blue-400 shrink-0" />;
    if (media === "novel") return <FileText className="w-5 h-5 text-emerald-400 shrink-0" />;
    return <Tv className="w-5 h-5 text-purple-400 shrink-0" />;
  };

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
            <div className={`p-2.5 rounded-2xl border ${isCanon ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"}`}>
              <GitCommit className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border ${isCanon ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"}`}>
                  {classification}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">{arcId}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-1">{arcTitle}</h2>
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
          {/* BARRA DE AÇÕES SOCIAIS DO CLUBE (Debate, Nota de Apreciação, Salvar) */}
          <EntityClubActions
            entityType="arc"
            entityId={arcId}
            entityTitle={arcTitle}
            onOpenDiscussion={() => setShowForum(!showForum)}
          />

          {/* AS FORMAS ONTOLÓGICAS DE VIVENCIAR ESTA HISTÓRIA */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                Manifestações desta História no Universo ({activeManifestations.length} Formas de Experimentar)
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                Ponto de Convergência da Narrativa
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeManifestations.map((m, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectManifestation?.(m.workId)}
                  className="p-4 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 hover:border-emerald-500/40 hover:bg-neutral-800/40 transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    {getMediaIcon(m.format, m.media)}
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                      {m.format || m.media}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-200 group-hover:text-white line-clamp-1">
                      {m.title}
                    </h4>
                    {m.rangeLabel && (
                      <span className="text-xs font-mono text-neutral-400 mt-1 block">
                        {m.rangeLabel}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DISCUSSÃO SOCIAL & DEBATE COLETIVO DO ARCO */}
          {showForum && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-emerald-500/20 animate-in fade-in">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider">
                  Debate Coletivo sobre este Arco Narrativo
                </h3>
              </div>
              <EpisodeDiscussionFeed
                contextKey={`arc:${arcId}`}
                contextType="arc"
                contextTitle={`Discussão da Narrativa: ${arcTitle}`}
                targetId={arcId}
              />
            </div>
          )}

          {/* Episódios / Capítulos Associados para Discussão Específica */}
          {episodes.length > 0 && (
            <div>
              <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Pontos de Debate por Episódio ({episodes.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {episodes.map((ep) => (
                  <button
                    key={ep.id}
                    onClick={() => onSelectEpisode?.(ep.id)}
                    className="p-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-emerald-500/40 hover:bg-neutral-800/50 transition-all text-center"
                  >
                    <span className="text-xs font-mono font-bold text-neutral-300 block">EP {ep.number}</span>
                    {ep.title && <span className="text-[10px] text-neutral-500 line-clamp-1">{ep.title}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
