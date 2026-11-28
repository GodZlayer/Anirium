import React, { useState, useEffect } from "react";
import { PlayerLaunchState } from "./PlayerLaunchState";
import { AnimeRecord } from "./AnimeCard";
import { addonRegistry } from "../lib/addonRegistry";
import { injectExternalRenderer } from "../lib/addonPlayerLoader";
import { ACCOUNT_ADDONS_CHANGED, requestAccountAddons } from "../lib/accountAddonClient";
import type { AniriumAddonManifest, CatalogPlaybackIdentity, CatalogPlaybackEpisode } from "../lib/addonTypes";

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

function isVideoRendererAddon(addon: any): boolean {
  if (!addon?.enabled) return false;
  if (addon.category === "engine.renderer" && (addon.mediaType === "video" || !addon.mediaType)) return true;
  const caps: string[] = Array.isArray(addon.capabilities) ? addon.capabilities : [];
  return caps.includes("ui.player.render") || addon.id === "player-pro";
}

function readRetainedEpisodePosition(
  catalogIdentity: CatalogPlaybackIdentity | undefined,
  anime: AnimeRecord,
  episodeNum: number,
): number {
  try {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem("anirium_episode_resume_v1");
    if (!raw) return 0;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return 0;
    const key = catalogIdentity?.episodeId
      ? `ep:${catalogIdentity.episodeId.toLowerCase()}`
      : `work:${catalogIdentity?.workId ? catalogIdentity.workId.toLowerCase() : String(anime?.id ?? "unknown")}:ep:${episodeNum}`;
    const entry = list.find((item: any) => item?.episodeKey === key);
    if (!entry || entry.completed || !Number.isFinite(entry.position) || entry.position < 5) return 0;
    if (entry.duration > 0 && entry.duration - entry.position <= 15) return 0;
    return entry.position;
  } catch {
    return 0;
  }
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
  const initialResumePosition = readRetainedEpisodePosition(catalogIdentity, anime, episodeNum);
  const [isPlaying, setIsPlaying] = useState(initialResumePosition > 0);
  const [activePlugin, setActivePlugin] = useState(() => addonRegistry.getActiveRendererPlugin("video", tier));

  useEffect(() => {
    const saved = readRetainedEpisodePosition(catalogIdentity, anime, episodeNum);
    if (saved > 0) setIsPlaying(true);
  }, [catalogIdentity?.episodeId, catalogIdentity?.workId, anime?.id, episodeNum]);

  useEffect(() => {
    let mounted = true;
    let revision = 0;

    const syncVideoRendererAddons = async () => {
      if (!isAuthenticated) return;
      const current = ++revision;
      try {
        const data = await requestAccountAddons();
        if (!mounted || current !== revision) return;
        const addons: any[] = Array.isArray(data?.addons) ? data.addons : [];

        for (const addon of addons) {
          if (!isVideoRendererAddon(addon)) {
            if (addon?.id && addonRegistry.isAddonEnabled(addon.id) && (addon.mediaType === "video" || addon.id === "player-pro")) {
              addonRegistry.disableAddon(addon.id);
            }
            continue;
          }

          const entryScriptUrl = addon.entryScriptUrl || addon.entry_script_url;
          const manifest: AniriumAddonManifest = {
            id: addon.id,
            name: addon.name || addon.id,
            version: addon.version || "1.0.0",
            description: addon.description || "",
            author: addon.author || "Comunidade",
            category: "engine.renderer",
            mediaType: "video",
            type: addon.is_official ? "official-plus" : "community",
            origin: addon.is_official ? "official" : "community",
            capabilities: Array.isArray(addon.capabilities) ? addon.capabilities : ["ui.player.render"],
            permissions: ["ui.player.render", "playback.client"],
            entryScriptUrl,
            manifestUrl: addon.manifest_url,
            enabled: true,
          };

          addonRegistry.registerManifest(manifest);
          addonRegistry.enableAddon(manifest.id);

          if (entryScriptUrl && !addonRegistry.isPlayerPluginRegistered(manifest.id)) {
            void injectExternalRenderer(manifest);
          }
        }

        setActivePlugin(addonRegistry.getActiveRendererPlugin("video", tier));
      } catch {
        if (mounted && current === revision) {
          setActivePlugin(addonRegistry.getActiveRendererPlugin("video", tier));
        }
      }
    };

    if (isAuthenticated) void syncVideoRendererAddons();
    window.addEventListener(ACCOUNT_ADDONS_CHANGED, syncVideoRendererAddons);
    setActivePlugin(addonRegistry.getActiveRendererPlugin("video", tier));

    const unsubscribe = addonRegistry.subscribe(() => {
      setActivePlugin(addonRegistry.getActiveRendererPlugin("video", tier));
    });

    return () => {
      mounted = false;
      window.removeEventListener(ACCOUNT_ADDONS_CHANGED, syncVideoRendererAddons);
      unsubscribe();
    };
  }, [tier, isAuthenticated]);

  const poster = anime.banner_image || anime.cover_image;

  // Se o usuário clicou para reproduzir e há um plugin de player externo ativo
  if (isAuthenticated && isPlaying && activePlugin && activePlugin.component) {
    const PlayerComponent = activePlugin.component;
    return (
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)] shadow-2xl">
        <PlayerComponent
          catalogIdentity={catalogIdentity} catalogEpisodes={catalogEpisodes} catalogSeasonNumber={catalogSeasonNumber}
          anime={anime}
          initialEpisode={episodeNum}
          initialSeasonIdx={seasonIdx}
          initialPosition={initialResumePosition > 0 ? initialResumePosition : undefined}
          autoResume={initialResumePosition > 0}
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
