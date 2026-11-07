import React, { Suspense } from "react";
import { useEntityNavigator } from "../lib/useEntityNavigator";
import { UniverseDetailModal } from "./UniverseDetailModal";
import { ArcDetailModal } from "./ArcDetailModal";
import { WorkDetailModal } from "./WorkDetailModal";
import { EpisodeDetailModal } from "./EpisodeDetailModal";
import { CreatorDetailModal } from "./CreatorDetailModal";
import { TrackDetailModal } from "./TrackDetailModal";

export interface EntityGraphModalHostProps {
  navigator: ReturnType<typeof useEntityNavigator>;
  userTier?: number;
  hasCommunityPlayerAddon?: boolean;
  onOpenPlayer?: (episodeId: string, episodeNumber: number) => void;
  onOpenDiscussion?: (entityType: string, entityId: string | number) => void;
  onUpgradeToPlus?: () => void;
  onOpenAddons?: () => void;
}

/**
 * Micro-Módulo Puro (~120 linhas): Orquestrador Central das Telas de Entidade (TGCode Standard)
 * Renderiza dinamicamente a tela correta com base no nó ativo do grafo relacional puro,
 * garantindo a navegação bidirecional instantânea entre:
 * Universo <-> Obra <-> Arco <-> Episódio <-> Criador <-> Trilha Sonora.
 */
export function EntityGraphModalHost({
  navigator,
  userTier = 1,
  hasCommunityPlayerAddon = false,
  onOpenPlayer,
  onOpenDiscussion,
  onUpgradeToPlus,
  onOpenAddons,
}: EntityGraphModalHostProps) {
  const { current, closeAll, openEntity } = navigator;

  if (!current) return null;

  const { kind, id, payload } = current;

  return (
    <Suspense fallback={null}>
      {/* 1. Modal de Universo */}
      {kind === "universe" && (
        <UniverseDetailModal
          isOpen={true}
          onClose={closeAll}
          universeId={id}
          universeTitle={payload?.title || "Universo Canônico"}
          works={payload?.works || []}
          arcs={payload?.arcs || []}
          onSelectWork={(workId) => openEntity("work", workId)}
          onSelectArc={(arcId) => openEntity("arc", arcId)}
        />
      )}

      {/* 2. Modal de Obra */}
      {kind === "work" && (
        <WorkDetailModal
          isOpen={true}
          onClose={closeAll}
          workId={id}
          title={payload?.entity?.title || payload?.title || "Obra"}
          format={payload?.entity?.format || payload?.format || "TV"}
          status={payload?.entity?.status || payload?.status || "COMPLETED"}
          score={payload?.score}
          episodesCount={payload?.entity?.episode_count || payload?.episodes?.length}
          synopsis={payload?.synopsis}
          imageUrl={payload?.image || payload?.images_json?.jpg?.image_url}
          universeId={payload?.universe_ids?.[0]}
          universeTitle={payload?.universe_title}
          sourceWork={payload?.relations?.find((r: any) => r.relation_type === "adaptation")}
          studios={payload?.studios || []}
          arcs={payload?.arcs || []}
          episodes={payload?.episodes || []}
          streamingLinks={payload?.streaming_links || []}
          onSelectUniverse={(univId) => openEntity("universe", univId)}
          onSelectArc={(arcId) => openEntity("arc", arcId)}
          onSelectSource={(sourceId) => openEntity("work", sourceId)}
          onPlayEpisode={(epId, epNum) => openEntity("episode", epId, { episodeNumber: epNum, workId: id })}
        />
      )}

      {/* 3. Modal de Arco Narrativo (Ponto de Convergência da História) */}
      {kind === "arc" && (
        <ArcDetailModal
          isOpen={true}
          onClose={closeAll}
          arcId={id}
          arcTitle={payload?.title || "Arco Narrativo"}
          classification={payload?.classification || "CANON"}
          sourceStart={payload?.source_start || "Vol 1, Cap 1"}
          sourceEnd={payload?.source_end || "Vol 3, Cap 25"}
          episodeStart={payload?.start_number || 1}
          episodeEnd={payload?.end_number || 12}
          episodes={payload?.episodes || []}
          onSelectManifestation={(workId) => openEntity("work", workId)}
          onSelectEpisode={(epId) => openEntity("episode", epId)}
        />
      )}

      {/* 4. Modal de Episódio */}
      {kind === "episode" && (
        <EpisodeDetailModal
          isOpen={true}
          onClose={closeAll}
          episodeId={id}
          episodeNumber={payload?.episodeNumber || payload?.number || 1}
          episodeTitle={payload?.title || `Episódio ${payload?.episodeNumber || payload?.number || 1}`}
          durationMinutes={payload?.runtime_minutes || 24}
          airDateUtc={payload?.air_date_utc}
          classification={payload?.classification || "canon"}
          synopsis={payload?.synopsis}
          thumbnailUrl={payload?.thumbnailUrl}
          workId={payload?.workId || payload?.work_id}
          workTitle={payload?.workTitle}
          universeId={payload?.universeId}
          arcId={payload?.arcId}
          arcTitle={payload?.arcTitle}
          sourceRef={payload?.sourceRef}
          userTier={userTier}
          hasCommunityPlayerAddon={hasCommunityPlayerAddon}
          onSelectWork={(workId) => openEntity("work", workId)}
          onSelectUniverse={(univId) => openEntity("universe", univId)}
          onSelectArc={(arcId) => openEntity("arc", arcId)}
          onOpenPlayer={onOpenPlayer}
          onOpenDiscussion={(epId) => onOpenDiscussion?.("episode", epId)}
          onUpgradeToPlus={onUpgradeToPlus}
          onOpenAddons={onOpenAddons}
        />
      )}

      {/* 5. Modal de Criador (Pessoa Física: Diretor, Autor, Músico, Seiyuu) */}
      {kind === "creator" && (
        <CreatorDetailModal
          isOpen={true}
          onClose={closeAll}
          creatorId={id}
          name={payload?.name || "Criador"}
          nativeName={payload?.native_name || payload?.nativeName}
          role={payload?.works?.[0]?.role || "Autor / Diretor"}
          bio={payload?.bio}
          universes={payload?.universes || []}
          works={payload?.works || []}
          onSelectUniverse={(univId) => openEntity("universe", univId)}
          onSelectWork={(workId) => openEntity("work", workId)}
        />
      )}

      {/* 6. Modal de Trilha Sonora / BGM */}
      {kind === "track" && (
        <TrackDetailModal
          isOpen={true}
          onClose={closeAll}
          trackId={id}
          title={payload?.title || "Trilha Sonora"}
          trackType={payload?.track_type || "BGM"}
          composerId={payload?.composer_id}
          composerName={payload?.composer_name}
          works={payload?.works || []}
          onSelectWork={(workId) => openEntity("work", workId)}
          onSelectComposer={(compI) => openEntity("creator", compI)}
        />
      )}
    </Suspense>
  );
}
