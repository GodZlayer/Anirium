"use client";

import React, { useState, useEffect, useMemo } from "react";
import TopCapsuleNav from "@/components/TopCapsuleNav";
import CinematicArena from "@/components/CinematicArena";
import ModularHubTrack from "@/components/ModularHubTrack";
import OrbitalFranchiseMap from "@/components/OrbitalFranchiseMap";
import AnimeSchedule from "@/components/AnimeSchedule";
import AnimeModal from "@/components/AnimeModal";
import PluginPlayerHost from "@/components/PluginPlayerHost";
import UserProfileModal from "@/components/UserProfileModal";
import LevelSwitcher from "@/components/LevelSwitcher";
import { Anime, AiringSchedule } from "@/types/anime";
import { useUser } from "@/context/UserContext";
import { getModularCatalogFromParquet } from "@/lib/parquetCatalog";
import { aniriumFetch } from "@/lib/apiConfig";
import { buildFranchisesFromCatalog, FranchiseGroup } from "@/lib/franchiseUtils";
import { Compass, Calendar as CalendarIcon, Sparkles } from "lucide-react";

/**
 * Lobby Master Viewport (TGCode Standard)
 * - 100vh Fixo (Zero Scroll Cego Vertical)
 * - Arena Cinematográfica com Aura de Edge-Diffusion
 * - Deslizamento Cinético Horizontal de Palcos
 * - Cápsula Superior com Perfil LoL e Seletor de Tema/i18n
 * - Esteira Horizontal com Inércia Tátil
 */
export default function LobbyDashboard() {
  const { user, level: tier } = useUser();

  // Chaveamento de Mundos
  const [navTab, setNavTab] = useState<string>("inicio");

  // Estado da Obra Ativa na Arena
  const [activeAnime, setActiveAnime] = useState<Anime | null>(null);
  const [modalAnime, setModalAnime] = useState<Anime | null>(null);
  const [playerTarget, setPlayerTarget] = useState<{ anime: Anime; episodeNum: number; seasonIdx: number } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLevelSwitcher, setShowLevelSwitcher] = useState(false);

  // Dados do Catálogo Parquet
  const [popular, setPopular] = useState<Anime[]>([]);
  const [seasonal, setSeasonal] = useState<Anime[]>([]);
  const [upcoming, setUpcoming] = useState<Anime[]>([]);
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const data = await getModularCatalogFromParquet();
        if (data.popular?.length) {
          setPopular(data.popular);
          setActiveAnime(data.popular[0]);
        }
        if (data.seasonal?.length) setSeasonal(data.seasonal);
        if (data.upcoming?.length) setUpcoming(data.upcoming);
      } catch (err) {
        console.warn("[Lobby] Falha Parquet, tentando API:", err);
      }
    }
    loadCatalog();
  }, []);

  const franchises = useMemo(() => {
    return buildFranchisesFromCatalog([...popular, ...seasonal]);
  }, [popular, seasonal]);

  // Busca instantânea
  const handleSearch = async (query: string) => {
    if (!query) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await aniriumFetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {}
  };

  const handlePlayEpisode = (anime: Anime, episodeNum: number, seasonIdx: number) => {
    setPlayerTarget({ anime, episodeNum, seasonIdx });
  };

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col bg-[#0B0B0D] text-[#FFF9F0] select-none">
      {/* 1. Cápsula Flutuante de Comando do Topo (h-14) */}
      <TopCapsuleNav
        activeTab={navTab}
        onTabChange={(tab) => {
          setNavTab(tab);
          if (isSearching) {
            setIsSearching(false);
            setSearchResults([]);
          }
        }}
        onSearch={handleSearch}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenLevelSwitcher={() => setShowLevelSwitcher(true)}
        isSearching={isSearching}
        onClearSearch={() => {
          setIsSearching(false);
          setSearchResults([]);
        }}
      />

      {/* 2. Palco Central Cinético (flex-1) */}
      <main className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
        {/* Caso haja busca ativa */}
        {isSearching ? (
          <div className="flex-1 p-6 overflow-hidden flex flex-col">
            <h2 className="text-xs font-mono font-bold text-amber-400 mb-3 flex-none">
              RESULTADOS DA BUSCA ({searchResults.length})
            </h2>
            <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 pr-1">
              {searchResults.map((anime) => (
                <div
                  key={anime.mal_id}
                  onClick={() => {
                    setActiveAnime(anime);
                    setIsSearching(false);
                  }}
                  className="p-2 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-amber-400 transition cursor-pointer"
                >
                  <img
                    src={anime.images?.webp?.large_image_url || anime.images?.jpg?.image_url}
                    alt={anime.title}
                    className="w-full aspect-[2/3] object-cover rounded-xl mb-1.5"
                  />
                  <h4 className="text-xs font-bold truncate text-white">{anime.title}</h4>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Trilha Contínua de Mundos (Deslizamento Cinético Horizontal) */
          <div
            className="flex-1 flex w-[400%] h-full transition-transform duration-500 ease-out"
            style={{
              transform:
                navTab === "explorar"
                  ? "translateX(-25%)"
                  : navTab === "calendario"
                  ? "translateX(-50%)"
                  : navTab === "franquias"
                  ? "translateX(-75%)"
                  : "translateX(0%)",
            }}
          >
            {/* PALCO 1: INÍCIO (Arena Cinematográfica Viva) */}
            <div className="w-1/4 h-full flex-none overflow-hidden">
              <CinematicArena
                anime={activeAnime}
                onPlayEpisode={handlePlayEpisode}
                onOpenDetails={setModalAnime}
              />
            </div>

            {/* PALCO 2: EXPLORAR (Foco na Coleção Seasonal e Popular) */}
            <div className="w-1/4 h-full flex-none p-6 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 mb-3 border-b border-zinc-800/80 pb-2">
                <Compass className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-mono font-bold text-white tracking-wider">EXPLORAÇÃO DE CATÁLOGO PARQUET</h2>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 pr-1">
                {popular.map((anime) => (
                  <div
                    key={anime.mal_id}
                    onClick={() => {
                      setActiveAnime(anime);
                      setNavTab("inicio");
                    }}
                    className="p-2 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-400 transition cursor-pointer transform hover:scale-[1.03]"
                  >
                    <img
                      src={anime.images?.webp?.large_image_url || anime.images?.jpg?.image_url}
                      alt={anime.title}
                      className="w-full aspect-[2/3] object-cover rounded-xl mb-1.5"
                    />
                    <h4 className="text-[11px] font-bold truncate text-white">{anime.title}</h4>
                  </div>
                ))}
              </div>
            </div>

            {/* PALCO 3: CALENDÁRIO DE SIMULCASTS */}
            <div className="w-1/4 h-full flex-none p-6 overflow-y-auto no-scrollbar">
              <div className="flex items-center gap-2 mb-3 border-b border-zinc-800/80 pb-2">
                <CalendarIcon className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-mono font-bold text-white tracking-wider">AGENDA CANÔNICA DE TRANSMISSÃO</h2>
              </div>
              <AnimeSchedule
                onSelectAnime={(a) => {
                  setActiveAnime(a);
                  setNavTab("inicio");
                }}
                onPlayAnime={(a) => handlePlayEpisode(a, 1, 0)}
              />
            </div>

            {/* PALCO 4: MAPA ORBITAL DE FRANQUIAS */}
            <div className="w-1/4 h-full flex-none overflow-hidden">
              <OrbitalFranchiseMap
                franchises={franchises}
                onSelectAnime={(a) => {
                  setActiveAnime(a);
                  setNavTab("inicio");
                }}
              />
            </div>
          </div>
        )}
      </main>

      {/* 3. Esteira Horizontal do Hub na Base da Viewport (Apenas na aba Início) */}
      {!isSearching && navTab === "inicio" && (
        <ModularHubTrack
          title="Destaques Canônicos"
          items={popular}
          activeAnimeId={activeAnime?.mal_id}
          onSelect={setActiveAnime}
          onPlay={(a) => handlePlayEpisode(a, 1, 0)}
        />
      )}

      {/* Modais Globais de Sistema */}
      {modalAnime && (
        <AnimeModal
          anime={modalAnime}
          onClose={() => setModalAnime(null)}
          onPlayEpisode={handlePlayEpisode}
          onResumeEpisode={() => true}
        />
      )}

      {playerTarget && (
        <PluginPlayerHost
          anime={playerTarget.anime}
          episode={playerTarget.episodeNum}
          seasonIdx={playerTarget.seasonIdx}
          onBack={() => setPlayerTarget(null)}
        />
      )}

      {showProfileModal && (
        <UserProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
      )}

      {showLevelSwitcher && (
        <LevelSwitcher isOpen={showLevelSwitcher} onClose={() => setShowLevelSwitcher(false)} />
      )}

    </div>
  );
}
