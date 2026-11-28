import type { CatalogPlaybackIdentity, CatalogPlaybackEpisode } from "./playbackIdentity";

export interface AniriumPlaybackPreferences {
  preferredAudio?: string;
  preferredSubtitles?: string;
  autoNextEpisode?: boolean;
  autoSkipIntro?: boolean;
  autoSkipEnding?: boolean;
}

export interface AniriumPlayerProps {
  catalogIdentity?: CatalogPlaybackIdentity;
  catalogEpisodes?: CatalogPlaybackEpisode[];
  catalogSeasonNumber?: number;
  anime: any;
  resolvedPayload?: any;
  preferences?: AniriumPlaybackPreferences;
  initialEpisode: number;
  initialSeasonIdx: number;
  initialPosition?: number;
  autoResume?: boolean;
  onBack: () => void;
  onOpenOverview?: () => void;
  onOpenFranchise?: (franchiseRoot: string) => void;
  onChangeEpisode?: (episode: number, seasonIdx: number) => void;
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
}
