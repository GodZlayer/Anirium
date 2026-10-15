"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Navbar from "@/components/Navbar";
import HeroBanner from "@/components/HeroBanner";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import GamificationHUD from "@/components/GamificationHUD";
import CatalogDock from "@/components/CatalogDock";
import ModularVitrine from "@/components/ModularVitrine";
import AnimeModal from "@/components/AnimeModal";
import FranchiseModal from "@/components/FranchiseModal";
import PluginPlayerHost from "@/components/PluginPlayerHost";
import UserProfileModal from "@/components/UserProfileModal";
import { Anime, AiringSchedule } from "@/types/anime";
import { useUser } from "@/context/UserContext";
import { getModularCatalogFromParquet } from "@/lib/parquetCatalog";
import { aniriumFetch } from "@/lib/apiConfig";

/**
 * Lobby Master Dashboard (TGCode Standard)
 * Arquitetura Ultra-Leve e Anti-Monólito:
 * Orquestrador limpo de ~120 linhas que apenas coordena os micro-módulos puros.
 */
export default function LobbyDashboard() {
  const { user, level } = useUser();

  // Estados dos Modais
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [selectedFranchiseRoot, setSelectedFranchiseRoot] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [playerTarget, setPlayerTarget] = useState<{ anime: Anime; episodeNum: number; seasonIdx: number } | null>(null);

  // Estados do Catálogo
  const [popular, setPopular] = useState<Anime[]>([]);
  const [seasonal, setSeasonal] = useState<Anime[]>([]);
  const [upcoming, setUpcoming] = useState<Anime[]>([]);
  const [latestEpisodes, setLatestEpisodes] = useState<AiringSchedule[]>([]);

  // Estados de Filtro do Dock
  const [activeTab, setActiveTab] = useState<string>("popular");
  const [selectedFormat, setSelectedFormat] = useState<string>("ALL");
  const [selectedGenre, setSelectedGenre] = useState<string>("ALL");
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Carregar catálogo particionado Parquet em memória client-side
  useEffect(() => {
    async function loadCatalog() {
      try {
        const data = await getModularCatalogFromParquet();
        if (data.popular?.length) setPopular(data.popular);
        if (data.seasonal?.length) setSeasonal(data.seasonal);
        if (data.upcoming?.length) setUpcoming(data.upcoming);
      } catch (err) {
        console.warn("[Lobby] Carregando catálogo via API fallback:", err);
        const res = await aniriumFetch("/api/catalog");
        const json = await res.json();
        if (json.popular) setPopular(json.popular);
        if (json.seasonal) setSeasonal(json.seasonal);
        if (json.upcoming) setUpcoming(json.upcoming);
      }
    }
    loadCatalog();

    // Lançamentos recentes para o Hero
    aniriumFetch("/api/schedule?type=latest")
      .then((res) => res.json())
      .then((d) => d.schedule && setLatestEpisodes(d.schedule))
      .catch(() => {});
  }, []);

  // Busca instantânea
  const handleSearch = async (query: string) => {
    if (!query || query.trim().length === 0) {
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

  // Filtragem rápida em memória sem recarregar a tela
  const currentCollection = useMemo(() => {
    if (isSearching) return searchResults;
    let list = activeTab === "seasonal" ? seasonal : activeTab === "upcoming" ? upcoming : popular;
    if (selectedFormat !== "ALL") list = list.filter((i) => i.format === selectedFormat);
    if (selectedGenre !== "ALL") list = list.filter((i) => i.genres?.some((g: any) => (g.name || g) === selectedGenre));
    return list;
  }, [activeTab, selectedFormat, selectedGenre, isSearching, searchResults, popular, seasonal, upcoming]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-base,#0B0B0D)] text-[var(--color-text-primary,#FFF9F0)] pb-16">
      <Navbar
        onSearch={handleSearch}
        isSearching={isSearching}
        onClearSearch={() => { setIsSearching(false); setSearchResults([]); }}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 space-y-6">
        {/* 1. Hero Showcase */}
        {!isSearching && popular.length > 0 && (
          <HeroBanner
            anime={popular[0]}
            onPlay={(anime) => setPlayerTarget({ anime, episodeNum: 1, seasonIdx: 0 })}
            onMoreInfo={setSelectedAnime}
            userLevel={level}
          />
        )}

        {/* 2. HUD de Gamificação & Nível da Conta */}
        <div className="flex items-center justify-between">
          <GamificationHUD level={level} userCompletedQuests={["quest_canon_scout"]} />
        </div>

        {/* 3. Retomada Rápida de Histórico */}
        <ContinueWatchingRow
          onPlayResume={(animeId, seasonIdx, epNum) => {
            const anime = popular.find((a) => a.mal_id === animeId);
            if (anime) setPlayerTarget({ anime, episodeNum: epNum, seasonIdx });
          }}
          onOpenAnime={(animeId) => {
            const anime = popular.find((a) => a.mal_id === animeId);
            if (anime) setSelectedAnime(anime);
          }}
        />

        {/* 4. Dock de Filtros & Seleção de Fatias */}
        <CatalogDock
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === "franchises") setSelectedFranchiseRoot("One Piece");
            else setActiveTab(tab);
          }}
          selectedFormat={selectedFormat}
          onSelectFormat={setSelectedFormat}
          selectedGenre={selectedGenre}
          onSelectGenre={setSelectedGenre}
          totalCount={currentCollection.length}
        />

        {/* 5. Vitrine Modular Universal */}
        <ModularVitrine
          items={currentCollection}
          onSelect={setSelectedAnime}
          onPlay={(anime) => setPlayerTarget({ anime, episodeNum: 1, seasonIdx: 0 })}
        />
      </main>

      {/* Modais de Contexto On-Demand */}
      {selectedAnime && (
        <AnimeModal
          anime={selectedAnime}
          onClose={() => setSelectedAnime(null)}
          onPlayEpisode={(anime, episodeNum, seasonIdx) => setPlayerTarget({ anime, episodeNum, seasonIdx })}
          onResumeEpisode={() => true}
          onOpenFranchise={(root) => { setSelectedAnime(null); setSelectedFranchiseRoot(root); }}
        />
      )}

      {selectedFranchiseRoot && popular.length > 0 && (
        <FranchiseModal
          franchise={{
            id: selectedFranchiseRoot.toLowerCase().replace(/\s+/g, "-"),
            rootTitle: selectedFranchiseRoot,
            representativeAnime: popular[0],
            worksCount: 15,
            seasonsCount: 5,
            averageScore: 8.7,
            maxScore: 9.1,
            scoreCount: 12,
            genres: [{ mal_id: 1, name: "Ação" }, { mal_id: 2, name: "Aventura" }],
            tags: [],
            formats: ["TV", "MOVIE"],
            yearsRange: "1999+",
            memberAnimes: popular.filter((a) => a.title.toLowerCase().includes(selectedFranchiseRoot.toLowerCase())),
          }}
          onClose={() => setSelectedFranchiseRoot(null)}
          onSelectAnime={(anime) => setSelectedAnime(anime)}
          onPlayEpisode={(anime, episodeNum, seasonIdx) => setPlayerTarget({ anime, episodeNum, seasonIdx })}
        />
      )}

      {showProfileModal && (
        <UserProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          onSelectAnime={(id) => {
            const a = popular.find((x) => x.mal_id === id);
            if (a) setSelectedAnime(a);
          }}
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
    </div>
  );
}
