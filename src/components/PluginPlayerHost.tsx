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

  // Fallback visual neutro quando o plugin do player ainda não foi ativado ou carregado
  return (
    <div className="fixed inset-0 z-50 bg-[#0B0B0D]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-[#FFF9F0]">
      <div className="max-w-md w-full bg-[#141418] border border-[#3A3A43] rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#FFC766]/10 border border-[#FFC766]/30 flex items-center justify-center mb-4">
          <span className="font-serif text-2xl font-bold text-[#FFC766]">EP {episode}</span>
        </div>
        <h3 className="font-serif text-lg font-bold text-[#FFF9F0]">{anime.title}</h3>
        <p className="text-xs text-[#EADCC8]/60 mt-1">Temporada #{seasonIdx + 1} • Episódio {episode}</p>
        
        <p className="text-xs text-[#EADCC8]/80 mt-4 bg-black/40 p-3 rounded-xl border border-zinc-800">
          Você está no modo canônico neutro. Deseja registrar progresso deste episódio ou abrir em um canal oficial?
        </p>

        <div className="flex flex-col w-full gap-2.5 mt-5">
          <button
            onClick={() => {
              saveProgress(anime.mal_id, seasonIdx, episode, 1440, 1440, anime.seasonEntityId || `season-${anime.mal_id}`);
              onBack();
            }}
            className="w-full py-2.5 rounded-xl bg-[#FFC766] text-[#0B0B0D] font-bold text-xs hover:bg-[#FFD78F] transition shadow-md"
          >
            Marcar Episódio como Concluído
          </button>

          {anime.streaming_links && anime.streaming_links.length > 0 ? (
            <a
              href={anime.streaming_links[0].url}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 rounded-xl bg-[#1A1A1F] hover:bg-[#23232A] text-xs font-semibold text-[#FFF9F0] border border-[#3A3A43] transition flex items-center justify-center gap-1.5"
            >
              <span>Assistir no Canal Licenciado ({anime.streaming_links[0].site})</span>
            </a>
          ) : (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent((anime.title_english || anime.title) + " assistir online")}`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 rounded-xl bg-[#1A1A1F] hover:bg-[#23232A] text-xs font-semibold text-[#FFF9F0] border border-[#3A3A43] transition flex items-center justify-center gap-1.5"
            >
              <span>Buscar Fontes Oficiais</span>
            </a>
          )}

          <button
            onClick={onBack}
            className="w-full py-2 text-xs text-[#EADCC8]/60 hover:text-white transition mt-1"
          >
            Voltar para a Obra
          </button>
        </div>
      </div>
    </div>
  );
}

