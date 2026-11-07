import React, { useState } from "react";
import {
  Play,
  BookOpen,
  Layers,
  MessageSquare,
  Compass,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Lock,
  Puzzle,
  Users,
  Film,
  X,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { EntityClubActions } from "./EntityClubActions";
import { EpisodeDiscussionFeed } from "./EpisodeDiscussionFeed";

export interface EpisodeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  episodeId: string;
  episodeNumber: number;
  episodeTitle?: string;
  durationMinutes?: number;
  airDateUtc?: string;
  classification?: "canon" | "filler" | "semi_filler" | "anime_original" | string;
  synopsis?: string;
  thumbnailUrl?: string;
  director?: string;
  animationDirector?: string;
  workId?: string;
  workTitle?: string;
  workCoverUrl?: string;
  universeId?: string;
  universeTitle?: string;
  arcId?: string;
  arcTitle?: string;
  arcClassification?: string;
  sourceRef?: {
    sourceWorkId?: string;
    sourceTitle?: string;
    media?: "manga" | "novel" | string;
    basis?: "adapted" | "anime_original" | "filler" | string;
    chapters?: string;
    volumes?: string;
  };
  userTier?: number;
  hasCommunityPlayerAddon?: boolean;
  onSelectWork?: (workId: string) => void;
  onSelectUniverse?: (universeId: string) => void;
  onSelectArc?: (arcId: string) => void;
  onOpenPlayer?: (episodeId: string, episodeNumber: number) => void;
  onUpgradeToPlus?: () => void;
  onOpenAddons?: () => void;
}

export function EpisodeDetailModal({
  isOpen,
  onClose,
  episodeId,
  episodeNumber,
  episodeTitle = "Episódio",
  durationMinutes = 24,
  airDateUtc,
  classification = "canon",
  synopsis,
  thumbnailUrl,
  director,
  animationDirector,
  workId,
  workTitle = "Anime Work",
  workCoverUrl,
  universeId,
  universeTitle = "Universo Canônico",
  arcId,
  arcTitle = "Arco Narrativo",
  arcClassification = "CANON",
  sourceRef = {
    sourceTitle: "Mangá Original",
    media: "manga",
    basis: "adapted",
    chapters: "Cap. 1 ao 3",
  },
  userTier = 1,
  hasCommunityPlayerAddon = false,
  onSelectWork,
  onSelectUniverse,
  onSelectArc,
  onOpenPlayer,
  onUpgradeToPlus,
  onOpenAddons,
}: EpisodeDetailModalProps) {
  const { tokens } = useDesignTheme();
  const [showForum, setShowForum] = useState(false);

  if (!isOpen) return null;

  const canPlay = userTier >= 2 || hasCommunityPlayerAddon;

  const isCanon = classification.toLowerCase().includes("canon");
  const isFiller = classification.toLowerCase().includes("filler");
  const isOriginal = classification.toLowerCase().includes("original");

  const badgeColorClass = isCanon
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : isFiller
    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
    : "bg-purple-500/10 text-purple-400 border-purple-500/20";

  const badgeLabel = isCanon
    ? "CANÔNICO"
    : isFiller
    ? "FILLER"
    : isOriginal
    ? "ANIME ORIGINAL"
    : classification.toUpperCase();

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
            <div className={`p-2.5 rounded-2xl border ${badgeColorClass}`}>
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border ${badgeColorClass}`}>
                  {badgeLabel} • EPISÓDIO {episodeNumber}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">{episodeId}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-1">
                {episodeTitle || `Episódio ${episodeNumber}`}
              </h2>
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
          {/* BARRA DE INTERAÇÃO DO CLUBE SECRETO (Nota, Favoritos, Fórum por Episódio) */}
          <EntityClubActions
            entityType="episode"
            entityId={episodeId}
            entityTitle={episodeTitle || `Episódio ${episodeNumber}`}
            onOpenDiscussion={() => setShowForum(!showForum)}
          />

          {/* FÓRUM / DISCUSSÃO INTEGRADA DO EPISÓDIO */}
          {showForum && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-emerald-500/20 animate-in fade-in">
              <EpisodeDiscussionFeed
                contextKey={`episode:${episodeId}`}
                contextType="episode"
                contextTitle={`Discussão com Trava de Spoiler: ${episodeTitle || `Episódio ${episodeNumber}`}`}
                targetId={episodeId}
                episodeNum={episodeNumber}
              />
            </div>
          )}

          {/* Hero Card do Episódio: Thumbnail, Info & Ação Condicional de Reprodução */}
          <div className="flex flex-col md:flex-row gap-6 p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/80">
            <div className="w-full md:w-72 aspect-video rounded-xl bg-neutral-950 border border-neutral-800 shrink-0 overflow-hidden relative group">
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt={episodeTitle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600">
                  <Play className="w-10 h-10 mb-1 opacity-50" />
                  <span className="text-[10px] font-mono">Sem Preview</span>
                </div>
              )}

              {canPlay ? (
                <button
                  onClick={() => onOpenPlayer?.(episodeId, episodeNumber)}
                  className="absolute inset-0 bg-black/40 hover:bg-black/20 flex items-center justify-center transition-colors group-hover:scale-105"
                  title="Reproduzir no Player Pro"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <Play className="w-6 h-6 fill-white translate-x-0.5" />
                  </div>
                </button>
              ) : (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center">
                  <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mb-1.5">
                    <Lock className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-neutral-200">Player Pro Restrito</span>
                  <span className="text-[9px] text-neutral-400 mt-0.5">Requer Anirium+ ou Addon</span>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 mb-2">
                  <div className="flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    <span>{durationMinutes} min</span>
                  </div>
                  {airDateUtc && (
                    <div className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{new Date(airDateUtc).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 font-mono">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Metadados Canônicos</span>
                  </div>
                </div>

                {/* DIREÇÃO TÉCNICA DO EPISÓDIO */}
                {(director || animationDirector) && (
                  <div className="space-y-0.5 mb-2 text-xs text-neutral-400">
                    {director && (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="font-mono text-neutral-500 uppercase">Diretor do Episódio:</span>
                        <span className="text-neutral-300 font-medium">{director}</span>
                      </div>
                    )}
                    {animationDirector && (
                      <div className="flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="font-mono text-neutral-500 uppercase">Diretor de Animação:</span>
                        <span className="text-neutral-300 font-medium">{animationDirector}</span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-sm text-neutral-300 leading-relaxed line-clamp-3">
                  {synopsis || "Sinopse deste episódio catalogada na ontologia narrativa do Anirium. Todos os dados canônicos e vínculos com a obra original preservados."}
                </p>
              </div>

              {/* Botões de Ação Condicionais */}
              <div className="mt-4 pt-3 border-t border-neutral-800/60 flex flex-wrap items-center gap-3">
                {canPlay ? (
                  <button
                    onClick={() => onOpenPlayer?.(episodeId, episodeNumber)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
                  >
                    <Play className="w-4 h-4 fill-black" />
                    Assistir no Player Pro
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={onUpgradeToPlus}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5 fill-black" />
                      Ativar Anirium+
                    </button>
                    <button
                      onClick={onOpenAddons}
                      className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-mono text-neutral-300 flex items-center gap-1.5 transition-colors"
                      title="Gerenciar Addons da Comunidade"
                    >
                      <Puzzle className="w-3.5 h-3.5 text-blue-400" />
                      Instalar Addon de Player
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Âncora de Correspondência na Obra Original (Manga/Novel) */}
          <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/80">
            <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-blue-400" />
              ORIGEM NARRATIVA (FONTE CANÔNICA)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                <span className="text-[10px] font-mono text-neutral-500 uppercase block">Obra Original</span>
                <span className="text-xs font-semibold text-neutral-200 mt-0.5 block">
                  {sourceRef.sourceTitle || "Mangá Original"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                <span className="text-[10px] font-mono text-neutral-500 uppercase block">Fidelidade</span>
                <span className="text-xs font-semibold text-blue-400 font-mono mt-0.5 block">
                  {sourceRef.basis === "adapted"
                    ? "Adaptado Fielmente"
                    : sourceRef.basis === "anime_original"
                    ? "Original de Animação"
                    : "Filler / Expansão"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                <span className="text-[10px] font-mono text-neutral-500 uppercase block">Capítulos / Volumes</span>
                <span className="text-xs font-semibold text-neutral-200 font-mono mt-0.5 block">
                  {sourceRef.chapters || sourceRef.volumes || "Cobre material original"}
                </span>
              </div>
            </div>
          </div>

          {/* Nós Conectados: Arco, Obra e Universo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => arcId && onSelectArc?.(arcId)}
              className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/80 hover:border-amber-500/40 transition-all text-left flex items-center justify-between group"
            >
              <div>
                <span className="text-[10px] font-mono text-amber-400/80 uppercase block flex items-center gap-1.5 mb-1">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  ARCO PERTENCENTE ({arcClassification})
                </span>
                <span className="text-sm font-semibold text-neutral-200 line-clamp-1">{arcTitle}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => workId && onSelectWork?.(workId)}
              className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/80 hover:border-purple-500/40 transition-all text-left flex items-center justify-between group"
            >
              <div>
                <span className="text-[10px] font-mono text-purple-400/80 uppercase block flex items-center gap-1.5 mb-1">
                  <Compass className="w-3.5 h-3.5 text-purple-400" />
                  OBRA & UNIVERSO
                </span>
                <span className="text-sm font-semibold text-neutral-200 line-clamp-1">{workTitle}</span>
                {universeTitle && (
                  <span className="text-[10px] font-mono text-neutral-400 block mt-0.5">
                    Universo: {universeTitle}
                  </span>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
