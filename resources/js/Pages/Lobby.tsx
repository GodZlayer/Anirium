import React, { useState, useEffect } from "react";
import { Head, router } from "@inertiajs/react";
import {
  Compass,
  Calendar,
  Sparkles,
  Volume2,
  Tv,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { LolProfileBadge } from "../Components/LolProfileBadge";
import { UserProfileModal } from "../Components/UserProfileModal";
import { ThemeLanguageSelector } from "../Components/ThemeLanguageSelector";
import { CinematicArena } from "../Components/CinematicArena";
import { CalendarHeader } from "../Components/CalendarHeader";
import { CalendarWorkCard } from "../Components/CalendarWorkCard";
import { calendarText, calendarWeekDays } from "../lib/calendarPresentation.mjs";
import { ModularHubTrack } from "../Components/ModularHubTrack";
import { AnimeRecord } from "../Components/AnimeCard";
import ContextView from "./ContextView";
import {
  loadTelemetryState,
  initTelemetryLoop,
  hydrateUserGamificationFromServer,
  recordBookmarkAction,
  TelemetryState,
} from "../lib/telemetryXpLoop";
import { getOrCreateMachineFingerprint } from "../lib/deviceFingerprint";
import { workReference } from "../lib/catalogIdentity.mjs";
import { libraryPreferences, libraryMatches } from "../lib/libraryReferences.mjs";
import { useCatalogFeed } from "../lib/useCatalogFeed";
import { useCatalogUpdates } from "../lib/useCatalogUpdates";
import { catalogLandingUrl } from "../lib/catalogLocation.mjs";
import { initialLobbyNavigation, type ContextParameters } from "../lib/contextNavigation";
import { loadNavigationStack, clearNavigationStack } from "../lib/universalNavigationStack";

import { getUniversalCatalog, refreshUnifiedCatalog, filterCatalog, ParquetAnime, isHentaiOrAdultAnime } from "../lib/parquetCatalog";
import {
  CatalogFilters,
  DEFAULT_CATALOG_FILTERS,
  applyCatalogFilters,
  collectGenres,
  collectFormats,
} from "../lib/catalogFilters";
import { CatalogFilterBar } from "../Components/CatalogFilterBar";
import { UnifiedCatalogExplorer } from "../Components/UnifiedCatalogExplorer";
import { getLocalAiring, getAiringStatusLabel } from "../lib/airingSchedule";

interface LobbyProps {
  auth?: {
    user?: {
      id: number;
      name: string;
      email: string;
      avatar?: string;
      tier: number;
      level?: number;
      xp?: number;
      active_minutes?: number;
      current_streak?: number;
      longest_streak?: number;
      streak_xp?: number;
      adult_content_enabled?: boolean;
      custom_title?: string | null;
      preferences?: any[];
      commented_targets?: string[];
    } | null;
  };
  initialContext?: {
    type: string;
    id: string | number;
  } | null;
}

export default function LobbyPage({ auth, initialContext }: LobbyProps) {
  useCatalogUpdates();
  const { tokens, strings, language, adultContentEnabled, setAdultContentEnabled } = useDesignTheme();

  // Estados Reativos Globais (Sistema Único com Barra de Endereço Oculta/Fixa em "/")
  const [startingNavigation] = useState(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const selected = initialLobbyNavigation(initialContext, search, loadNavigationStack());
    if (typeof window !== "undefined" && (window.location.pathname !== "/" || search)) {
      window.history.replaceState(null, "", catalogLandingUrl(search));
    }
    return selected;
  });
  const [activeTab, setActiveTab] = useState(startingNavigation.tab);
  const [contextTarget, setContextTarget] = useState<{ type: string; id: string | number; params?: Partial<ContextParameters> } | null>(startingNavigation.context);
  useEffect(() => { if (activeTab !== "context") clearNavigationStack(); }, [activeTab]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [machineFingerprint, setMachineFingerprint] = useState("");
  
  // O Catálogo Universal Único
  const [universalCatalog, setUniversalCatalog] = useState<AnimeRecord[]>([]);
  const [rollIdx, setRollIdx] = useState(0); // 0: Último, 1: Penúltimo, 2: Antepenúltimo
  const [selectedAnime, setSelectedAnime] = useState<AnimeRecord | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Array<number | string>>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Estado do Dia da Semana do Calendário (0: Seg, 1: Ter, 2: Qua, 3: Qui, 4: Sex, 5: Sáb, 6: Dom)
  const currentWeekDay = (new Date().getDay() + 6) % 7; // Ajusta Domingo (0) para 6 e Segunda (1) para 0
  const [selectedDay, setSelectedDay] = useState<number>(currentWeekDay);
  const [calendarPage, setCalendarPage] = useState<number>(1);
  const CALENDAR_PAGE_SIZE = 12;

  // Filtros da tela Explorar
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS);
  const isAuthenticated = Boolean(auth?.user);
  const allowAdult = Boolean(isAuthenticated && adultContentEnabled);

  // Lista de gêneros e formatos presentes no catálogo carregado (Hentai oculto sem conta ou quando desativado na conta)
  const availableGenres = React.useMemo(
    () => collectGenres(universalCatalog, 24, allowAdult),
    [universalCatalog, allowAdult]
  );
  const availableFormats = React.useMemo(() => collectFormats(universalCatalog), [universalCatalog]);

  // Catálogo filtrado e ordenado para a tela Explorar
  const filteredExploreAnimes = React.useMemo(
    () => applyCatalogFilters(universalCatalog, catalogFilters, searchQuery, allowAdult),
    [universalCatalog, catalogFilters, searchQuery, allowAdult]
  );

  // Home deriva os 3 lançamentos direto do catálogo local (Parquet) quando disponível - zero request ao server.
  // O feed do server funciona como fallback para visitantes sem catalogo carregado em memoria.
  const homeRollLocal = React.useMemo(() => {
    if (!universalCatalog.length) return null;
    return universalCatalog
      .filter((w) => String(w.entity_type) === "WORK" && w.release?.air_date_utc && (w.catalog_visibility ?? "visible") === "visible")
      .filter((w) => allowAdult || !isHentaiOrAdultAnime(w))
      .sort((a, b) => String(b.release?.air_date_utc).localeCompare(String(a.release?.air_date_utc)))
      .slice(0, 3);
  }, [universalCatalog, allowAdult]);
  const homeFeed = useCatalogFeed("home", allowAdult, !isAuthenticated);
  const calendarFeed = useCatalogFeed("calendar", allowAdult);
  const rollAnimes = homeRollLocal ?? (homeFeed.ready ? homeFeed.items : []);
  const homePhase = homeRollLocal ? "ready" : homeFeed.phase;
  useEffect(() => { setRollIdx(index => Math.max(0, Math.min(index, rollAnimes.length - 1))); }, [rollAnimes.length]);

  // Telemetria Contínua Desacoplada de Tier
  const [telemetry, setTelemetry] = useState<TelemetryState>(() => loadTelemetryState());
  const effectiveTier = auth?.user ? auth.user.tier : 0;

  // Sincronizar preferência adulta (+24 Anos), hidratação de XP/Streaks e trava de máquina única
  useEffect(() => {
    const cleanup = initTelemetryLoop(isAuthenticated, effectiveTier);
    const hydrated = hydrateUserGamificationFromServer(auth?.user || null, universalCatalog);
    setTelemetry(hydrated);

    if (auth?.user) {
      if (auth.user.adult_content_enabled !== undefined) {
        setAdultContentEnabled(Boolean(auth.user.adult_content_enabled));
      }

      const mfp = getOrCreateMachineFingerprint();
      setMachineFingerprint(mfp);
      fetch("/api/session/register-device", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ machine_fingerprint: mfp }),
      })
        .then((r) => {
          if (r.status === 409) {
            alert("Esta conta já está conectada ativamente em outro dispositivo.");
          }
        })
        .catch(() => {});
    }

    return () => cleanup();
  }, [isAuthenticated, effectiveTier, auth?.user?.id]);

  useEffect(() => {
    const { bookmarks } = libraryPreferences(auth?.user?.preferences);
    setBookmarkedIds([...new Set([...bookmarks, ...universalCatalog.filter(work => libraryMatches(work, bookmarks)).map(work => work.id)])]);
  }, [auth?.user?.preferences, universalCatalog]);

  // Carregar a Base Indexada Universal Única Canônica e recalcular conclusão reversível
  useEffect(() => {
    let mounted = true;
    const loadLegacyIfNeeded = async () => {
      if (!auth?.user) {
        try { await refreshUnifiedCatalog(); return []; } catch { /* Legacy publication remains usable during migration. */ }
      }
      return getUniversalCatalog();
    };
    loadLegacyIfNeeded().then((catalog) => {
      if (!mounted) return;
      if (catalog && catalog.length > 0) {
        setUniversalCatalog(catalog);
        const firstSafe = catalog.find((a) => !a.genres?.some((g) => g.toLowerCase() === "hentai" || g.toLowerCase() === "erotica"));
        setSelectedAnime(firstSafe || catalog[0]);
        const updatedState = hydrateUserGamificationFromServer(auth?.user || null, catalog);
        setTelemetry(updatedState);
      }
    });

    const handleExpanded = (e: any) => {
      if (!mounted || !Array.isArray(e.detail)) return;
      setUniversalCatalog(e.detail);
      const updatedState = hydrateUserGamificationFromServer(auth?.user || null, e.detail);
      setTelemetry(updatedState);
    };
    window.addEventListener("anirium_catalog_expanded", handleExpanded);

    return () => {
      mounted = false;
      window.removeEventListener("anirium_catalog_expanded", handleExpanded);
    };
  }, [auth?.user]);

  useEffect(() => {
    const handleXpEvent = (e: any) => {
      if (e.detail) setTelemetry(e.detail);
    };
    window.addEventListener("anirium_xp_update", handleXpEvent);
    return () => window.removeEventListener("anirium_xp_update", handleXpEvent);
  }, []);

  // Processar #id_token=... retornado pelo Google OAuth na raiz (https://anirium.com.br)
  // e limpar imediatamente a barra de endereços mantendo a navegação 100% oculta em "/"
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash && window.location.hash.includes("id_token=")) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const idToken = params.get("id_token");
      window.history.replaceState(null, "", catalogLandingUrl(window.location.search));

      if (idToken) {
        fetch("/api/auth/google", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ credential: idToken }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data && data.success) {
              router.reload();
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  const handleOpenContext = (anime: AnimeRecord) => {
    setContextTarget({ type: "work", id: workReference(anime) });
    setActiveTab("context");
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.history.replaceState(null, "", catalogLandingUrl(window.location.search));
    }
  };

  const handlePlayAnime = (anime: AnimeRecord) => {
    if (!anime.release) return handleOpenContext(anime);
    setContextTarget({ type: "episode", id: anime.release.id, params: { workId: anime.release.work_id } });
    setActiveTab("context");
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.history.replaceState(null, "", catalogLandingUrl(window.location.search));
    }
  };

  const handleToggleBookmark = (anime: AnimeRecord) => {
    if (!isAuthenticated || !anime.work_id) return;
    const targetId = anime.work_id;
    const exists = libraryMatches(anime, bookmarkedIds);
    const updated = exists
      ? bookmarkedIds.filter((id) => !libraryMatches(anime, [id]))
      : [...bookmarkedIds, targetId];
    setBookmarkedIds(updated);
    recordBookmarkAction(!exists, isAuthenticated, effectiveTier, targetId, "work");
  };

  return (
    <div
      className="w-screen h-screen flex flex-col justify-between overflow-hidden relative select-none"
      style={{ backgroundColor: tokens.colors.bgBase }}
    >
      <Head title={strings.navigation.home} />

      {/* TOPBAR FLUTUANTE (No-Scroll Viewport) - Apenas quando no Lobby padrão (em ContextView a barra única unificada é exibida) */}
      {activeTab !== "context" && (
        <header
          className="w-full h-14 flex-none px-2 sm:px-3 lg:px-6 z-40 border-b backdrop-blur-xl flex items-center justify-between gap-1 lg:gap-4"
          style={{
            backgroundColor: tokens.colors.bgOverlay,
            borderColor: tokens.colors.borderDefault,
          }}
        >
          {/* Identidade Visual Canônica */}
          <div className="flex items-center gap-1 lg:gap-5 shrink-0">
            <button type="button" aria-label={strings.navigation.home}
              onClick={() => setActiveTab("home")}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl cursor-pointer group transition-all duration-300 hover:scale-[1.02]"
              style={{
                backgroundColor: "rgba(10, 10, 15, 0.45)",
                border: `1px solid ${tokens.colors.borderHighlight || "rgba(255, 199, 102, 0.25)"}`,
                boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
              }}
            >
              {/* Personagem mascote flutuante oficial (logo-char) */}
              <img
                src="/assets/logos/Anirium-favicon.png"
                alt="Anirium Mascot"
                className="w-7 h-7 object-contain drop-shadow-[0_2px_8px_rgba(255,199,102,0.4)] animate-bounce duration-1000 group-hover:rotate-6 transition-transform"
                style={{ animationDuration: "3s" }}
              />
              {/* Logo textual com contraste absoluto e halo dourado */}
              <img
                src="/assets/logos/Anirium-Textlogo.png"
                alt="Anirium"
                className="hidden lg:block h-6 w-auto object-contain filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
              />
            </button>

            {/* DOCK CÁPSULA ACRÍLICA DE NAVEGAÇÃO DE MUNDOS ESSENCIAIS */}
            <nav
              className="flex items-center backdrop-blur-md p-1 rounded-full border text-xs shadow-inner"
              style={{
                backgroundColor: tokens.colors.bgSurface,
                borderColor: tokens.colors.borderDefault,
              }}
            >
              {[
                { id: "home", label: strings.navigation.home, icon: Tv },
                { id: "explore", label: strings.navigation.explore, icon: Compass },
                { id: "calendar", label: strings.navigation.calendar, icon: Calendar },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    aria-label={tab.label}
                    onClick={() => setActiveTab(tab.id as any)}
                    className="flex items-center gap-1.5 px-2 lg:px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer"
                    style={{
                      backgroundColor: isActive ? tokens.colors.accentGold : "transparent",
                      color: isActive ? tokens.colors.bgBase : tokens.colors.textSecondary,
                      boxShadow: isActive ? "0 2px 10px rgba(0,0,0,0.2)" : "none",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* CONTROLES DE IDIOMA, TEMA E PERFIL DE TELEMETRIA */}
          <div className="flex items-center gap-1 lg:gap-3 shrink-0">
            <ThemeLanguageSelector />
            <LolProfileBadge
              user={auth?.user}
              tier={effectiveTier}
              level={telemetry.levelNumber}
              xpPercentage={telemetry.xp}
              title={telemetry.title}
              telemetryState={telemetry}
              onOpenProfile={() => setProfileModalOpen(true)}
            />
          </div>
        </header>
      )}

      {/* MODAL / PAINEL COMPLETO DE PERFIL DO USUÁRIO & GAMIFICAÇÃO */}
      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={auth?.user}
        telemetry={telemetry}
        universalCatalog={universalCatalog}
        bookmarkedIds={bookmarkedIds}
        machineFingerprint={machineFingerprint}
        onSelectAnime={handleOpenContext}
        onPlayAnime={handlePlayAnime}
      />

      {/* VIEWPORT DINÂMICA DE MUNDOS (100vh Sem Rolagem Cega) */}
      <main className="flex-1 overflow-hidden p-0 flex flex-col justify-between relative">
        {activeTab === "home" && (
          <div className="w-full h-full relative">
            <CinematicArena
              rollAnimes={rollAnimes}
              activeIdx={rollIdx}
              feedPhase={homePhase}
              onSelectIdx={setRollIdx}
              onPlay={handlePlayAnime}
              onExplore={handlePlayAnime}
              onToggleBookmark={isAuthenticated ? handleToggleBookmark : undefined}
              isBookmarked={rollAnimes[rollIdx] ? libraryMatches(rollAnimes[rollIdx], bookmarkedIds) : false}
              isAuthenticated={Boolean(auth?.user)}
              hasPlayerAddon={Boolean(auth?.user && effectiveTier >= 2)}
            />
          </div>
        )}

        {activeTab === "context" && contextTarget && (
          <div className="w-full h-full relative z-30">
            <ContextView
              initialType={contextTarget.type}
              initialId={String(contextTarget.id)}
              initialState={contextTarget.params}
              auth={auth}
              onClose={() => {
                setActiveTab("home");
                if (typeof window !== "undefined" && window.location.pathname !== "/") {
                  window.history.replaceState(null, "", catalogLandingUrl(window.location.search));
                }
              }}
            />
          </div>
        )}

        {activeTab === "explore" && (
          <UnifiedCatalogExplorer adult={allowAdult} onOpen={work => { setContextTarget({ type: "work", id: workReference(work) }); setActiveTab("context"); }} fallback={<div className="h-full min-h-0 flex flex-col gap-3 p-4">
            <CatalogFilterBar
              filters={catalogFilters}
              onChange={setCatalogFilters}
              genres={availableGenres}
              formats={availableFormats}
              resultCount={filteredExploreAnimes.length}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
            <div className="flex-1 min-h-0">
              <ModularHubTrack
                title={strings.labels.exploreTitle}
                animes={filteredExploreAnimes}
                activeAnimeId={selectedAnime?.id}
                onSelectAnime={handleOpenContext}
                onPlayAnime={handlePlayAnime}
                onToggleBookmark={isAuthenticated ? handleToggleBookmark : undefined}
                bookmarkedIds={bookmarkedIds}
                layout="grid"
              />
            </div>
          </div>} />
        )}

        {activeTab === "calendar" && (() => {
          const weekDays = calendarWeekDays(language);

          // Todas as obras ativas no ciclo de transmissão (bloqueia Hentai sem conta +24)
          const calendarAnimes = calendarFeed.ready ? calendarFeed.items : filterCatalog(universalCatalog, "calendar", searchQuery, allowAdult);

          // Filtra pelo dia no fuso local e ordena pelo horário de transmissão
          const dayAnimesWithAiring = calendarAnimes
            .map((anime) => ({
              anime,
              airing: getLocalAiring(
                anime.airing_day,
                anime.airing_time,
                new Date(),
                anime.mal_id || anime.id,
                anime.release?.air_date_utc
              ),
            }))
            .filter((item): item is { anime: AnimeRecord; airing: NonNullable<ReturnType<typeof getLocalAiring>> } =>
              item.airing !== null && item.airing.dayIndex === selectedDay
            )
            .sort((a, b) => a.airing.minutes - b.airing.minutes);

          const totalPages = Math.max(1, Math.ceil(dayAnimesWithAiring.length / CALENDAR_PAGE_SIZE));
          const currentPage = Math.min(Math.max(1, calendarPage), totalPages);
          const startIndex = (currentPage - 1) * CALENDAR_PAGE_SIZE;
          const pagedItems = dayAnimesWithAiring.slice(startIndex, startIndex + CALENDAR_PAGE_SIZE);

          return (
            <div className="h-full flex flex-col justify-between gap-3 p-4">
              <CalendarHeader
                selectedDay={selectedDay}
                currentDay={currentWeekDay}
                count={dayAnimesWithAiring.length}
                onSelect={(day) => {
                  setSelectedDay(day);
                  setCalendarPage(1);
                }}
              />

              {/* Esteira de Animes Lançados no Dia Selecionado */}
              {/* Grid de Obras Paginado (Sem Rolagem, Igual ao Explorar) */}
              <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 auto-rows-fr gap-3">
                {pagedItems.map(({ anime, airing }) => (
                  <CalendarWorkCard
                    key={anime.work_id || anime.id}
                    work={anime}
                    airingLabel={getAiringStatusLabel(airing, selectedDay, new Date(), language)}
                    onOpen={handleOpenContext}
                  />
                ))}
                {dayAnimesWithAiring.length === 0 && (
                  <div className="col-span-full flex items-center justify-center p-8 text-sm opacity-60">
                    {calendarText(language, "releases", { day: weekDays[selectedDay].full })} • {strings.labels.empty || "Nenhum anime neste dia."}
                  </div>
                )}
              </div>

              {/* Navegação de Páginas Idêntica ao Explorar */}
              <nav className="flex justify-center items-center gap-4 shrink-0">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={currentPage <= 1}
                  onClick={() => setCalendarPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgSurface)]/5 hover:bg-[color:var(--wc-bgSurface)]/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono opacity-80">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Próxima página"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCalendarPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgSurface)]/5 hover:bg-[color:var(--wc-bgSurface)]/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </nav>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
