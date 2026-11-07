import React, { useState } from "react";
import {
  Film,
  Tv,
  Compass,
  Layers,
  Play,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Music,
  Users,
  Building2,
  X,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { EntityClubActions } from "./EntityClubActions";
import { EpisodeDiscussionFeed } from "./EpisodeDiscussionFeed";

export interface WorkDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  workId: string;
  title?: string;
  format?: string;
  status?: string;
  score?: number | string;
  episodesCount?: number;
  synopsis?: string;
  imageUrl?: string;
  universeId?: string;
  universeTitle?: string;
  sourceWork?: {
    id: string;
    title: string;
    media: string;
  };
  studios?: Array<{ id?: string | number; name: string }>;
  producers?: Array<{ id?: string | number; name: string }>;
  directors?: Array<{ id?: string | number; name: string }>;
  musicTracks?: Array<{
    type: "op" | "ed" | "bgm" | "ost";
    title: string;
    artist?: string;
    spotifyUrl?: string;
    youtubeUrl?: string;
  }>;
  arcs?: Array<{ id: string; title: string; classification?: string }>;
  episodes?: Array<{ id: string; number: number; title?: string }>;
  streamingLinks?: Array<{ name: string; url: string }>;
  onSelectUniverse?: (universeId: string) => void;
  onSelectArc?: (arcId: string) => void;
  onSelectSource?: (sourceId: string) => void;
  onPlayEpisode?: (episodeId: string, episodeNum: number) => void;
  onSelectCreator?: (creatorId: string, role: string) => void;
}

export function WorkDetailModal({
  isOpen,
  onClose,
  workId,
  title = "Work Details",
  format = "TV",
  status = "FINISHED",
  score = "8.5",
  episodesCount,
  synopsis,
  imageUrl,
  universeId,
  universeTitle = "Universe",
  sourceWork,
  studios = [],
  producers = [],
  directors = [],
  musicTracks = [],
  arcs = [],
  episodes = [],
  streamingLinks = [],
  onSelectUniverse,
  onSelectArc,
  onSelectSource,
  onPlayEpisode,
  onSelectCreator,
}: WorkDetailModalProps) {
  const { tokens } = useDesignTheme();
  const [showForum, setShowForum] = useState(false);

  if (!isOpen) return null;

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
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {format} • {status}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">{workId}</span>
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
          {/* BARRA DE INTERAÇÃO DO CLUBE SECRETO (Nota, Favoritos, Fórum por Obra) */}
          <EntityClubActions
            entityType="work"
            entityId={workId}
            entityTitle={title}
            onOpenDiscussion={() => setShowForum(!showForum)}
          />

          {/* FÓRUM / DISCUSSÃO INTEGRADA DA OBRA */}
          {showForum && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-purple-500/20 animate-in fade-in">
              <EpisodeDiscussionFeed
                contextKey={`work:${workId}`}
                contextType="work"
                contextTitle={`Fórum & Avaliações da Obra: ${title}`}
                targetId={workId}
              />
            </div>
          )}

          {/* Top Banner / Meta Info */}
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-32 h-44 sm:w-36 sm:h-52 rounded-2xl bg-neutral-900 border border-neutral-800 shrink-0 overflow-hidden shadow-lg">
              {imageUrl ? (
                <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600">
                  <Tv className="w-10 h-10" />
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {universeId && (
                    <button
                      onClick={() => onSelectUniverse?.(universeId)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-mono transition-all"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>{universeTitle || "Universo"}</span>
                    </button>
                  )}
                  {sourceWork && (
                    <button
                      onClick={() => onSelectSource?.(sourceWork.id)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs font-mono transition-all"
                    >
                      <span>Obra Fonte: {sourceWork.title}</span>
                    </button>
                  )}
                  {score && (
                    <span className="px-2.5 py-1 rounded-xl bg-neutral-900 border border-neutral-800 text-amber-400 font-bold text-xs">
                      ★ {score}
                    </span>
                  )}
                  {episodesCount && (
                    <span className="px-2.5 py-1 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono text-xs">
                      {episodesCount} episódios
                    </span>
                  )}
                </div>

                {/* DIRETORES, ESTÚDIOS & PRODUTORAS */}
                <div className="space-y-1 mb-3 text-xs text-neutral-400">
                  {directors.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="font-mono text-neutral-500 uppercase">Direção:</span>
                      <span className="text-neutral-300 font-medium">
                        {directors.map((d) => d.name).join(", ")}
                      </span>
                    </div>
                  )}
                  {studios.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="font-mono text-neutral-500 uppercase">Estúdio de Animação:</span>
                      <span className="text-neutral-300 font-medium">
                        {studios.map((s) => s.name).join(", ")}
                      </span>
                    </div>
                  )}
                  {producers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-neutral-500 uppercase pl-5">Produção:</span>
                      <span className="text-neutral-400">
                        {producers.map((p) => p.name).join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {synopsis && (
                  <p className="text-sm text-neutral-300 line-clamp-3 leading-relaxed font-normal">
                    {synopsis}
                  </p>
                )}
              </div>

              {streamingLinks.length > 0 && (
                <div className="mt-4 pt-3 border-t border-neutral-800/60 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-mono text-neutral-400 uppercase">Transmissão Oficial:</span>
                  <div className="flex flex-wrap gap-2">
                    {streamingLinks.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-mono text-neutral-300 hover:text-white underline flex items-center gap-1"
                      >
                        {link.name} <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TRILHA SONORA & BGM (OP, ED, OST) */}
          {musicTracks.length > 0 && (
            <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/80">
              <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
                <Music className="w-4 h-4 text-emerald-400" />
                Trilha Sonora & Músicas Oficiais ({musicTracks.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {musicTracks.map((track, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 mr-2">
                        {track.type.toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-neutral-200 truncate">{track.title}</span>
                      {track.artist && (
                        <span className="text-[10px] text-neutral-500 block truncate">{track.artist}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Arcos Narrativos */}
          {arcs.length > 0 && (
            <div>
              <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Arcos Narrativos Desta Obra ({arcs.length})
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

          {/* Lista de Episódios */}
          {episodes.length > 0 && (
            <div>
              <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                Episódios Disponíveis ({episodes.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {episodes.map((ep) => (
                  <button
                    key={ep.id}
                    onClick={() => onPlayEpisode?.(ep.id, ep.number)}
                    className="p-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-emerald-500/40 hover:bg-neutral-800/50 transition-all text-center flex flex-col items-center justify-center gap-1"
                  >
                    <span className="text-xs font-mono font-bold text-neutral-200">EP {ep.number}</span>
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
