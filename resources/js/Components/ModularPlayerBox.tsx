import React, { useState, useEffect } from "react";
import { PlayerLaunchState } from "./PlayerLaunchState";
import { AnimeRecord } from "./AnimeCard";
import { addonRegistry } from "../lib/addonRegistry";
import { initializeOfficialPlusPlayerAddon } from "../lib/playerProAddonBootstrapper";
import { ACCOUNT_ADDONS_CHANGED, requestAccountAddons } from "../lib/accountAddonClient";
import type { CatalogPlaybackIdentity, CatalogPlaybackEpisode } from "../addons/player-pro/playbackIdentity";

interface ModularPlayerBoxProps {
  catalogIdentity?: CatalogPlaybackIdentity;
  catalogEpisodes?: CatalogPlaybackEpisode[];
  catalogSeasonNumber?: number;
  anime: AnimeRecord;
  episodeNum?: number;
  seasonIdx?: number;
  isAuthenticated?: boolean;
  tier?: number;
  onBack?: () => void;
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

export function ModularPlayerBox({
  catalogIdentity, catalogEpisodes, catalogSeasonNumber,
  anime,
  episodeNum = 1,
  seasonIdx = 0,
  isAuthenticated = false,
  tier = 0,
  onBack,
  onOpenOverview,
  onOpenFranchise,
  onChangeEpisode,
  onProgress,
}: ModularPlayerBoxProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePlugin, setActivePlugin] = useState(() => addonRegistry.getActivePlayerPlugin(tier));

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    initializeOfficialPlusPlayerAddon(tier, false);
    const refreshAddons = async () => {
      if (!isAuthenticated) return;
      const current = ++revision;
      try {
        const data = await requestAccountAddons();
        if (mounted && current === revision) {
          initializeOfficialPlusPlayerAddon(tier, data.addons.some((addon: { id: string; enabled: boolean }) => addon.id === "player-pro" && addon.enabled));
        }
      } catch {
        if (mounted && current === revision) initializeOfficialPlusPlayerAddon(tier, false);
      }
    };
    if (isAuthenticated) void refreshAddons();
    window.addEventListener(ACCOUNT_ADDONS_CHANGED, refreshAddons);
    setActivePlugin(addonRegistry.getActivePlayerPlugin(tier));

    const unsubscribe = addonRegistry.subscribe(() => {
      setActivePlugin(addonRegistry.getActivePlayerPlugin(tier));
    });

    return () => {
      mounted = false;
      window.removeEventListener(ACCOUNT_ADDONS_CHANGED, refreshAddons);
      unsubscribe();
    };
  }, [tier, isAuthenticated]);

  const poster = anime.banner_image || anime.cover_image;

  // Se o usuário clicou para reproduzir e há um plugin de player ativo (Player Pro ou comunitário)
  if (isAuthenticated && isPlaying && activePlugin && activePlugin.component) {
    const PlayerComponent = activePlugin.component;
    return (
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)] shadow-2xl">
        <PlayerComponent
          catalogIdentity={catalogIdentity} catalogEpisodes={catalogEpisodes} catalogSeasonNumber={catalogSeasonNumber}
          anime={anime}
          initialEpisode={episodeNum}
          initialSeasonIdx={seasonIdx}
          onBack={() => {
            setIsPlaying(false);
            if (onBack) onBack();
          }}
          onOpenOverview={onOpenOverview}
          onOpenFranchise={onOpenFranchise}
          onChangeEpisode={onChangeEpisode}
          onProgress={onProgress}
        />
      </div>
    );
  }

  return <PlayerLaunchState title={anime.title} poster={poster} episode={episodeNum} authenticated={isAuthenticated}
    player={isAuthenticated ? activePlugin?.manifest.name : undefined} officialPlus={activePlugin?.manifest.id === "player-pro"}
    onPlay={() => setIsPlaying(true)} />;
}
