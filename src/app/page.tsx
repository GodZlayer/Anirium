"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Navbar from "@/components/Navbar";
import HeroBanner from "@/components/HeroBanner";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import GamificationHUD from "@/components/GamificationHUD";
import CatalogDock from "@/components/CatalogDock";
import ModularVitrine from "@/components/ModularVitrine";
import AnimeSchedule from "@/components/AnimeSchedule";
import ScheduleFranchisePanel from "@/components/ScheduleFranchisePanel";
import AnimeModal from "@/components/AnimeModal";
import FranchiseModal from "@/components/FranchiseModal";
import PluginPlayerHost from "@/components/PluginPlayerHost";
import UserProfileModal from "@/components/UserProfileModal";
import { Anime, AiringSchedule } from "@/types/anime";
import { useUser } from "@/context/UserContext";
import { getModularCatalogFromParquet } from "@/lib/parquetCatalog";
import { aniriumFetch } from "@/lib/apiConfig";
import { buildFranchisesFromCatalog, FranchiseGroup } from "@/lib/franchiseUtils";
import { Sparkles, Compass, Calendar as CalendarIcon, Network, Flame, Layers, ChevronRight, Star } from "lucide-react";

/**
 * Lobby Master Dashboard (TGCode Standard)
 * Arquitetura Ultra-Leve e Anti-Monólito:
 * - O scroll e os cliques chaveiam estados determinísticos do Mundo.
 * - Suporta as 4 abas mestres: "inicio", "explorar", "calendario", "franquias".
 * - Integração completa com o Core, Login Google / Níveis, Player e Modais.
 */
export default function LobbyDashboard() {
  const { user, level } = useUser();

  // Navegação Global de Mundos
  const [navTab, setNavTab] = useState<string>("inicio");

  // Estados dos Modais
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [selectedFranchiseGroup, setSelectedFranchiseGroup] = useState<FranchiseGroup | null>(null);
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
        const text = await res.text();
        const json = JSON.parse(text.replace(/^\uFEFF/, ""));
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

  // Universo de Franquias Agregadas a partir do catálogo carregado
  const allFranchises = useMemo(() => {
    const combined = [...popular, ...seasonal];
    return buildFranchisesFromCatalog(combined);
  }, [popular, seasonal]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-base,#0B0B0D)] text-[var(--color-text-primary,#FFF9F0)] pb-16">
      <Navbar
        activeTab={navTab}
        onTabChange={(tab) => {
          setNavTab(tab);
          if (isSearching) {
            setIsSearching(false);
            setSearchResults([]);
          }
        }}
        onSearch={handleSearch}
        isSearching={isSearching}
        onClearSearch={() => { setIsSearching(false); setSearchResults([]); }}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 space-y-6">
        {/* ==================== MUNDO 1: BUSCA ATIVA ==================== */}
        {isSearching && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-[#3A3A43]/60 pb-3">
              <h2 className="text-sm font-mono uppercase tracking-wider text-[#FFC766] flex items-center gap-2">
                <span>Resultados da Busca</span>
                <span className="text-xs text-[#EADCC8]/60 font-sans">({searchResults.length} obras encontradas)</span>
              </h2>
            </div>
            <ModularVitrine
              items={searchResults}
              onSelect={setSelectedAnime}
              onPlay={(anime) => setPlayerTarget({ anime, episodeNum: 1, seasonIdx: 0 })}
            />
          </div>
        )}

        {/* ==================== MUNDO 2: INÍCIO (DASHBOARD LOBBY) ==================== */}
        {!isSearching && navTab === "inicio" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 1. Hero Showcase */}
            {popular.length > 0 && (
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
                if (tab === "franchises") setNavTab("franquias");
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
          </div>
        )}

        {/* ==================== MUNDO 3: EXPLORAR CATÁLOGO ==================== */}
        {!isSearching && navTab === "explorar" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-[#3A3A43]/60 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-[#FFC766]" />
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#FFF9F0]">
                  Explorar Catálogo Canônico
                </h1>
              </div>
              <span className="text-xs font-mono text-[#EADCC8]/60">
                Fatias locais Parquet • Latência zero
              </span>
            </div>

            <CatalogDock
              activeTab={activeTab}
              onTabChange={(tab) => {
                if (tab === "franchises") setNavTab("franquias");
                else setActiveTab(tab);
              }}
              selectedFormat={selectedFormat}
              onSelectFormat={setSelectedFormat}
              selectedGenre={selectedGenre}
              onSelectGenre={setSelectedGenre}
              totalCount={currentCollection.length}
            />

            <ModularVitrine
              items={currentCollection}
              onSelect={setSelectedAnime}
              onPlay={(anime) => setPlayerTarget({ anime, episodeNum: 1, seasonIdx: 0 })}
            />
          </div>
        )}

        {/* ==================== MUNDO 4: CALENDÁRIO ==================== */}
        {!isSearching && navTab === "calendario" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <ScheduleFranchisePanel
              onSelectAnime={setSelectedAnime}
              onPlayAnime={(anime) => setPlayerTarget({ anime, episodeNum: 1, seasonIdx: 0 })}
            />
            <AnimeSchedule
              onSelectAnime={setSelectedAnime}
              onPlayAnime={(anime) => setPlayerTarget({ anime, episodeNum: 1, seasonIdx: 0 })}
            />
          </div>
        )}

        {/* ==================== MUNDO 5: GENEALOGIA DE FRANQUIAS ==================== */}
        {!isSearching && navTab === "franquias" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#3A3A43]/60 pb-3">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-[#FFC766]" />
                <div>
                  <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#FFF9F0]">
                    Genealogia de Franquias Canônicas
                  </h1>
                  <p className="text-xs text-[#EADCC8]/60 mt-0.5">
                    Universos consolidados em ordem cronológica de lançamento.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-[#1A1A1F] border border-[#3A3A43] text-[#FFC766]">
                {allFranchises.length} universos estruturados
              </span>
            </div>

            {/* Grid de Franquias */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allFranchises.map((franchise) => {
                const rep = franchise.representativeAnime;
                const cover = rep.images?.webp?.large_image_url || rep.images?.jpg?.large_image_url || "/assets/logos/Anirium-favicon.png";
                return (
                  <div
                    key={franchise.id}
                    onClick={() => setSelectedFranchiseGroup(franchise)}
                    className="p-4 rounded-2xl bg-[#141418] border border-[#3A3A43] hover:border-[#FFC766] transition-all cursor-pointer group flex items-center gap-4 shadow-md hover:shadow-xl hover:shadow-[#FFC766]/5"
                  >
                    <div className="w-16 h-20 rounded-xl overflow-hidden bg-[#0B0B0D] flex-none border border-[#3A3A43]/60">
                      <img
                        src={cover}
                        alt={franchise.rootTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-[#FFC766]/15 text-[#FFC766] border border-[#FFC766]/30">
                          {franchise.yearsRange}
                        </span>
                        {franchise.averageScore > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#FFC766] font-mono">
                            <Star className="w-3 h-3 fill-[#FFC766]" />
                            <span>{franchise.averageScore}</span>
                          </span>
                        )}
                      </div>
                      <h3 className="font-serif text-sm font-bold text-[#FFF9F0] truncate group-hover:text-[#FFC766] transition-colors">
                        {franchise.rootTitle}
                      </h3>
                      <p className="text-[11px] text-[#EADCC8]/60 font-mono">
                        {franchise.worksCount} {franchise.worksCount === 1 ? "produção conectada" : "produções conectadas"}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#3A3A43] group-hover:text-[#FFC766] group-hover:translate-x-0.5 transition-all flex-none" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modais de Contexto On-Demand */}
      {selectedAnime && (
        <AnimeModal
          anime={selectedAnime}
          onClose={() => setSelectedAnime(null)}
          onPlayEpisode={(anime, episodeNum, seasonIdx) => setPlayerTarget({ anime, episodeNum, seasonIdx })}
          onResumeEpisode={() => true}
          onOpenFranchise={(root) => {
            setSelectedAnime(null);
            const found = allFranchises.find((f) => f.rootTitle.toLowerCase() === root.toLowerCase() || f.id.toLowerCase() === root.toLowerCase());
            if (found) {
              setSelectedFranchiseGroup(found);
            } else if (popular.length > 0) {
              setNavTab("franquias");
            }
          }}
        />
      )}

      {selectedFranchiseGroup && (
        <FranchiseModal
          franchise={selectedFranchiseGroup}
          onClose={() => setSelectedFranchiseGroup(null)}
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
