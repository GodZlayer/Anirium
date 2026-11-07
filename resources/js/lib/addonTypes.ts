import React from "react";
import { AnimeRecord } from "../Components/AnimeCard";
import type { CatalogPlaybackIdentity, CatalogPlaybackEpisode } from "../addons/player-pro/playbackIdentity";

/**
 * 1. Categorias de Addon no Ecossistema Anirium
 * - "engine.renderer": Tocador de Mídia / Leitor (Player Pro, Player Comunitário, Leitor de Mangá, Tocador de Áudio)
 * - "provider.stream": Agregador de Fontes (Resolve links de vídeo, torrents, streams HLS)
 * - "provider.manga": Agregador de Scans de Mangá (Resolve páginas de capítulos)
 * - "provider.audio": Agregador de Áudio (Resolve trilhas sonoras e BGM)
 * - "tool.utility": Ferramentas e utilitários (Sincronização MAL, Watch Party, etc.)
 */
export type AniriumAddonCategory =
  | "engine.renderer"
  | "provider.stream"
  | "provider.manga"
  | "provider.audio"
  | "tool.utility";

/**
 * 2. Formato de Mídia Suportado pelo Renderizador
 */
export type RenderMediaType = "video" | "manga" | "audio";

/**
 * 3. Dados brutos entregues por um Agregador ao Renderizador
 */
export interface ResolvedMediaPayload {
  mediaType: RenderMediaType;
  title: string;
  episodeNumber?: number;
  chapterNumber?: number;
  streamUrl?: string; // URL do stream HLS/MP4 ou magnet
  pages?: string[];   // Lista de URLs de imagens para mangás
  audioUrl?: string;  // URL do áudio para BGM/OST
  subtitles?: Array<{
    label: string;
    language: string;
    url: string;
    format: "vtt" | "ass" | "srt";
  }>;
  audioTracks?: Array<{
    label: string;
    language: string;
    url?: string;
  }>;
  headers?: Record<string, string>;
}

export interface AniriumAddonManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  category: AniriumAddonCategory;
  mediaType?: RenderMediaType; // Se for engine.renderer, qual mídia ele renderiza
  type: "official-plus" | "community" | "private-addon";
  origin?: "official" | "community" | "external-url";
  capabilities: Array<
    | "playback.source.provide"
    | "playback.client"
    | "provider.server"
    | "network.external.fetch"
    | "ui.theme.apply"
    | "ui.panel.render"
    | "ui.player.render"
    | "ui.reader.render"
    | "ui.audio.render"
    | "ui.player.overlay"
    | "subtitles.manage"
    | "audio.manage"
    | "tracking.sync"
    | "data.library"
    | "data.stats"
  >;
  permissions: Array<
    | "playback.client"
    | "ui.player.overlay"
    | "playback.source.provide"
    | "network.external.fetch"
    | "ui.theme.apply"
    | "ui.player.render"
    | "ui.reader.render"
    | "ui.audio.render"
  >;
  entryScriptUrl?: string; // Para injeção remota (bundle JS externo)
  entrypoint?: string;
  enabled: boolean;
  serviceUrl?: string;     // Ex: http://127.0.0.1:4004 para o daemon local
  manifestUrl?: string;    // Manifesto remoto (padrão Stremio ou Anirium)
}

export interface AniriumPlaybackPreferences {
  preferredAudio?: string;
  preferredSubtitles?: string;
  autoNextEpisode?: boolean;
  autoSkipIntro?: boolean;
}

export interface AniriumPlayerProps {
  catalogIdentity?: CatalogPlaybackIdentity;
  catalogEpisodes?: CatalogPlaybackEpisode[];
  catalogSeasonNumber?: number;
  anime: AnimeRecord | any;
  resolvedPayload?: ResolvedMediaPayload; // Payload vindo de agregadores
  preferences?: AniriumPlaybackPreferences;
  initialEpisode: number;
  initialSeasonIdx: number;
  onBack: () => void;
  onOpenOverview?: () => void;
  onOpenFranchise?: (franchiseRoot: string) => void;
  onProgress?: (data: {
    workId?: string;
    episodeId?: string;
    animeId: number;
    seasonIdx: number;
    seasonEntityId: string;
    episode: number;
    currentTime: number;
    duration: number;
    completed: boolean;
  }) => void;
  onChangeEpisode?: (episode: number, seasonIdx: number) => void;
}

export interface AniriumPlayerPlugin {
  manifest: AniriumAddonManifest;
  component: React.ComponentType<AniriumPlayerProps>;
}
