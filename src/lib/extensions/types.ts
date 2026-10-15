import React from 'react';
import { Anime } from '@/types/anime';

export interface AniriumAddonManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  type: 'official-plus' | 'community';
  origin?: 'official' | 'community';
  capabilities: Array<
    | 'playback.source.provide'
    | 'playback.client'
    | 'provider.server'
    | 'network.external.fetch'
    | 'ui.theme.apply'
    | 'ui.panel.render'
    | 'ui.player.render'
    | 'ui.player.overlay'
    | 'subtitles.manage'
    | 'audio.manage'
    | 'tracking.sync'
    | 'data.library'
    | 'data.stats'
    | 'data.debug'
  >;
  permissions: Array<
    | 'playback.client'
    | 'ui.player.overlay'
    | 'playback.source.provide'
    | 'network.external.fetch'
    | 'ui.theme.apply'
    | 'ui.player.render'
  >;
  entrypoint?: string;
  enabled: boolean;
  uiEdits?: string[];
  display?: string[];
  hooks?: Record<string, string>;
  themeConfig?: {
    accentColor?: string;
    badgeStyle?: string;
    cardBorder?: string;
    bannerGradients?: string;
  };
  serviceUrl?: string; // optional micro-service endpoint for the addon
  manifestUrl?: string; // account-owned remote manifest; interpreted by the local Service
  // 'remote-manifest' rows store only the typed URL registration below.
  kind?: 'remote-manifest';
}

export const REMOTE_MANIFEST_KIND = 'remote-manifest' as const;

// Account-owned remote manifest registration. Core persists this intent only:
// no fetched manifest, capabilities or UI grants are implied.
export interface RemoteManifestConfig {
  id: string;
  kind: typeof REMOTE_MANIFEST_KIND;
  manifestUrl: string;
}

export interface AnimeSearchContext {
  malId?: number;
  anilistId?: number;
  titleEnglish?: string;
  titleRomaji?: string;
  titleJapanese?: string;
  titlePortuguese?: string;
  episodeNumber: number;
  seasonNumber?: number;
  format?: string; // 'TV', 'MOVIE', 'OVA', etc.
}

export interface AniriumUIExtension {
  manifest: AniriumAddonManifest;
  applyTheme?(): void;
}

/**
 * Contrato Oficial do Plugin de Player:
 * O Anirium Core é neutro e não implementa motores de mídia externos.
 * Ao clicar para reproduzir, o Core verifica se há um player plugin registrado e delega a renderização.
 */
export interface AniriumPlaybackPreferences {
  preferredAudio?: string;
  preferredSubtitles?: string;
  autoNextEpisode?: boolean;
  autoSkipIntro?: boolean;
}

export interface AniriumPlayerProps {
  preferences?: AniriumPlaybackPreferences;
  anime: Anime;
  initialEpisode: number;
  initialSeasonIdx: number;
  onBack: () => void;
  onOpenOverview?: () => void;
  onOpenFranchise?: (franchiseRoot: string) => void;
  onProgress?: (data: {
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
