import React, { useState } from "react";
import {
  UserCheck,
  Building2,
  Film,
  Compass,
  Award,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  X,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { EntityClubActions } from "./EntityClubActions";
import { EpisodeDiscussionFeed } from "./EpisodeDiscussionFeed";

export interface CreatorDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  creatorId: string;
  name: string;
  nativeName?: string;
  role?: string; // "Mangaká / Autor" | "Estúdio de Animação" | "Diretor"
  bio?: string;
  avatarUrl?: string;
  userDirectScore?: number | null; // Nota subjetiva atribuída diretamente ao criador
  universes?: Array<{ id: string; title: string }>;
  works?: Array<{
    id: string;
    title: string;
    media: string;
    roleInWork?: string;
    year?: number;
    score?: number;
    popularity?: number;
    image?: string;
  }>;
  onSelectUniverse?: (universeId: string) => void;
  onSelectWork?: (workId: string) => void;
}

export function CreatorDetailModal({
  isOpen,
  onClose,
  creatorId,
  name,
  nativeName,
  role = "Diretor Geral",
  bio,
  avatarUrl,
  userDirectScore = null,
  universes = [],
  works = [],
  onSelectUniverse,
  onSelectWork,
}: CreatorDetailModalProps) {
  const { tokens } = useDesignTheme();
  const [showForum, setShowForum] = useState(false);

  if (!isOpen) return null;

  const isStudio = role.toLowerCase().includes("estúdio") || role.toLowerCase().includes("studio");

  // CÁLCULO DETERMINÍSTICO DA CAPACITAÇÃO REAL (Formulação Anti-Hate Laya)
  // Média ponderada pelo peso logarítmico de popularidade de cada obra dirigida/produzida
  let totalWeightedScore = 0;
  let totalWeight = 0;
  works.forEach((w) => {
    if (w.score && w.score > 0) {
      const weight = Math.log(1 + (w.popularity || 100));
      totalWeightedScore += w.score * weight;
      totalWeight += weight;
    }
  });

  const objectiveRealCapacity = totalWeight > 0 ? (totalWeightedScore / totalWeight).toFixed(2) : null;
  const isPolarized = objectiveRealCapacity && userDirectScore && Math.abs(parseFloat(objectiveRealCapacity) - userDirectScore) > 1.5;

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
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {isStudio ? <Building2 className="w-6 h-6" /> : <UserCheck className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {role}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">{creatorId}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-1">
                {name} {nativeName && <span className="text-neutral-400 text-sm font-normal">({nativeName})</span>}
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
          {/* BARRA DE INTERAÇÃO DO CLUBE SECRETO (Nota, Favoritos, Fórum por Criador) */}
          <EntityClubActions
            entityType="creator"
            entityId={creatorId}
            entityTitle={name}
            onOpenDiscussion={() => setShowForum(!showForum)}
          />

          {/* FÓRUM / DISCUSSÃO INTEGRADA DO CRIADOR */}
          {showForum && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-indigo-500/20 animate-in fade-in">
              <EpisodeDiscussionFeed
                contextKey={`creator:${creatorId}`}
                contextType="creator"
                contextTitle={`Fórum & Avaliações de Carreira: ${name}`}
                targetId={creatorId}
              />
            </div>
          )}

          {/* PAINEL DE INTELIGÊNCIA: CAPACITAÇÃO REAL (OBJETIVA) VS. REPUTAÇÃO (SUBJETIVA) */}
          <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/80">
            <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              MÉTRICA DE CAPACITAÇÃO REAL & HISTÓRICO PROFISSIONAL
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Capacitação Real Objetiva */}
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-indigo-500/20">
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">
                  Capacitação Real (Objetiva)
                </span>
                <span className="text-lg font-bold text-indigo-400 font-mono mt-0.5 block">
                  {objectiveRealCapacity ? `★ ${objectiveRealCapacity}` : "Em cálculo"}
                </span>
                <span className="text-[9px] text-neutral-500">Média ponderada do portfólio</span>
              </div>

              {/* Total de Trabalhos Dirigidos */}
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">
                  Trabalhos no Catálogo
                </span>
                <span className="text-lg font-bold text-neutral-200 font-mono mt-0.5 block">
                  {works.length} obras
                </span>
                <span className="text-[9px] text-neutral-500">Direção / Autoria documentada</span>
              </div>

              {/* Status de Polarização / Escudo Anti-Hate */}
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">
                  Índice de Consenso
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  {isPolarized ? (
                    <>
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-amber-400 font-mono">
                        Alerta de Polarização
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-semibold text-emerald-400 font-mono">
                        Consenso Consistente
                      </span>
                    </>
                  )}
                </div>
                <span className="text-[9px] text-neutral-500">Mede distorção de review-bombing</span>
              </div>
            </div>
          </div>

          {bio && (
            <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/80">
              <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-wider block mb-2">
                BIOGRAFIA & PERFIL
              </span>
              <p className="text-sm text-neutral-300 leading-relaxed">{bio}</p>
            </div>
          )}

          {/* Universos Criados / Associados */}
          {universes.length > 0 && (
            <div>
              <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-400" />
                Universos Canônicos ({universes.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {universes.map((univ) => (
                  <button
                    key={univ.id}
                    onClick={() => onSelectUniverse?.(univ.id)}
                    className="flex flex-col text-left p-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 hover:border-amber-500/40 transition-all hover:scale-[1.02]"
                  >
                    <span className="text-[10px] font-mono uppercase text-amber-400/80 mb-1">UNIVERSO</span>
                    <span className="text-sm font-semibold text-neutral-200 line-clamp-1">{univ.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Obras do Criador / Estúdio */}
          <div>
            <h3 className="text-xs font-bold font-mono uppercase text-neutral-400 mb-3 flex items-center gap-2">
              <Film className="w-4 h-4 text-indigo-400" />
              Filmografia & Portfólio de Obras ({works.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {works.map((work) => (
                <button
                  key={work.id}
                  onClick={() => onSelectWork?.(work.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 hover:border-indigo-500/40 transition-all hover:scale-[1.02] text-left"
                >
                  <div className="w-10 h-14 rounded-lg bg-neutral-800 shrink-0 overflow-hidden">
                    {work.image && <img src={work.image} alt={work.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-mono uppercase text-indigo-400 block">
                      {work.roleInWork || work.media}
                    </span>
                    <span className="text-sm font-semibold text-neutral-200 line-clamp-1 block">{work.title}</span>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400">
                      {work.year && <span>{work.year}</span>}
                      {work.score && <span className="text-amber-400 font-mono">★ {work.score}</span>}
                    </div>
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
