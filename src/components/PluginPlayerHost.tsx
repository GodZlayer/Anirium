"use client";

import React, { useState, useEffect } from "react";
import { Anime } from "@/types/anime";
import { addonRegistry } from "@/lib/extensions/addonRegistry";
import { useUser } from "@/context/UserContext";

interface PluginPlayerHostProps {
  anime: Anime;
  episode: number;
  seasonIdx: number;
  onBack: () => void;
  onOpenOverview?: () => void;
  onOpenFranchise?: (franchiseRoot: string) => void;
  onChangeEpisode?: (episode: number, seasonIdx: number) => void;
}

/**
 * Host Neutro de Plugins de Player do Anirium Core
 * O Core não contém componentes de tela de reprodução.
 * Este Host apenas delega a renderização para o componente fornecido
 * dinamicamente pelo plugin ativo da conta do usuário.
 */
export default function PluginPlayerHost({
  anime,
  episode,
  seasonIdx,
  onBack,
  onOpenOverview,
  onOpenFranchise,
  onChangeEpisode,
}: PluginPlayerHostProps) {
  const { saveProgress, user } = useUser();
  const [playerPlugin, setPlayerPlugin] = useState(() => addonRegistry.getActivePlayerPlugin());

  useEffect(() => {
    // Sincroniza imediatamente o player ativo
    setPlayerPlugin(addonRegistry.getActivePlayerPlugin());

    // Inscreve para ouvir o registro dinâmico do plugin quando for baixado/importado
    const unsubscribe = addonRegistry.subscribe(() => {
      setPlayerPlugin(addonRegistry.getActivePlayerPlugin());
    });

    return unsubscribe;
  }, []);

  const handleProgress = (data: {
    animeId: number;
    seasonIdx: number;
    seasonEntityId: string;
    episode: number;
    currentTime: number;
    duration: number;
    completed: boolean;
  }) => {
    saveProgress(data.animeId, data.seasonIdx, data.episode, data.currentTime, data.duration, data.seasonEntityId);
  };

  // Se a conta tem um plugin de player ativo carregado dinamicamente:
  if (playerPlugin && playerPlugin.component) {
    const PlayerComponent = playerPlugin.component;
    return (
      <PlayerComponent
        anime={anime}
        preferences={{
          preferredAudio: user?.settings?.preferredAudio,
          preferredSubtitles: user?.settings?.preferredSubtitles,
          autoNextEpisode: user?.settings?.autoNextEpisode,
          autoSkipIntro: user?.settings?.autoSkipIntro,
        }}
        initialEpisode={episode}
        initialSeasonIdx={seasonIdx}
        onBack={onBack}
        onOpenOverview={onOpenOverview}
        onOpenFranchise={onOpenFranchise}
        onProgress={handleProgress}
        onChangeEpisode={onChangeEpisode}
      />
    );
  }

  // Se nenhum plugin de player foi carregado na conta, o host não renderiza nada
  return null;
}
