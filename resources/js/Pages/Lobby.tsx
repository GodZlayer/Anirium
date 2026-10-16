import React, { useState, useEffect } from "react";
import { Head } from "@inertiajs/react";
import {
  Search,
  Compass,
  Calendar,
  Layers,
  Sparkles,
  Volume2,
  Tv,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { LolProfileBadge } from "../Components/LolProfileBadge";
import { ThemeLanguageSelector } from "../Components/ThemeLanguageSelector";
import { CinematicArena } from "../Components/CinematicArena";
import { ModularHubTrack } from "../Components/ModularHubTrack";
import { OrbitalFranchiseMap } from "../Components/OrbitalFranchiseMap";
import { AnimeRecord } from "../Components/AnimeCard";
import {
  loadTelemetryState,
  recordBookmarkAction,
  recordWatchProgress,
  TelemetryState,
} from "../lib/telemetryXpLoop";

// Mock Inicial Canônico com metadados para as 6 línguas
const INITIAL_ANIMES: AnimeRecord[] = [
  {
    id: 1,
    mal_id: 269,
    title: "Bleach",
    title_english: "Bleach",
    title_japanese: "BLEACH - ブリーチ -",
    title_portuguese: "Bleach: Sociedade das Almas",
    title_spanish: "Bleach: Sociedad de Almas",
    title_french: "Bleach: Soul Society",
    title_german: "Bleach: Soul Society Saga",
    synopses: {
      "pt-BR": "Ichigo Kurosaki é um estudante comum até que sua família é atacada por um Hollow. Ele se torna um Shinigami substituto para defender o mundo dos vivos.",
      "en-US": "Ichigo Kurosaki is an ordinary high schooler until his family is attacked by a Hollow. He becomes a Substitute Soul Reaper to defend the living world.",
      "ja-JP": "黒崎一護は霊が見えること以外は普通の高校生。だが悪霊・虚（ホロウ）の襲撃を受け、死神代行として現世と尸魂界を守る戦いに身を投じる。",
      "es-ES": "Ichigo Kurosaki es un estudiante de secundaria común hasta que su familia es atacada por un Hollow. Se convierte en un Shinigami sustituto para defender el mundo.",
      "fr-FR": "Ichigo Kurosaki est un lycéen ordinaire jusqu'à ce que sa famille soit attaquée par un Hollow. Il devient Shinigami suppléant pour défendre le monde des vivants.",
      "de-DE": "Ichigo Kurosaki ist ein gewöhnlicher Schüler, bis seine Familie von einem Hollow angegriffen wird. Er wird ein Ersatz-Shinigami, um die lebende Welt zu verteidigen.",
    },
    score: 8.9,
    episodes_count: 366,
    status: "COMPLETED",
    banner_image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1400&q=80",
    cover_image: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: 2,
    mal_id: 41467,
    title: "Bleach: Thousand-Year Blood War",
    title_english: "Bleach: Thousand-Year Blood War",
    title_japanese: "BLEACH 千年血戦篇",
    title_portuguese: "Bleach: A Guerra Sangrenta dos Mil Anos",
    title_spanish: "Bleach: La Guerra Sangrienta de los Mil Años",
    title_french: "Bleach: La Guerre Sanglante de Mille Ans",
    title_german: "Bleach: Tausendjähriger Blutkrieg",
    synopses: {
      "pt-BR": "A paz é interrompida quando sinos de alerta soam na Soul Society. O império oculto Wandenreich, liderado por Yhwach, declara guerra contra os Shinigami.",
      "en-US": "Peace is shattered as sirens wail through Soul Society. The hidden Wandenreich empire, led by Yhwach, declares total war against the Soul Reapers.",
      "ja-JP": "尸魂界に鳴り響く警報。突如現れた見えざる帝国（ヴァンデンライヒ）の皇帝ユーハバッハが、死神たちに宣戦布告し千年にわたる因縁の戦いが幕を開ける。",
      "es-ES": "La paz se rompe cuando suenan las alarmas en la Sociedad de Almas. El imperio oculto Wandenreich, liderado por Yhwach, declara la guerra a los Shinigami.",
      "fr-FR": "La paix est troublée par les alarmes de la Soul Society. L'empire caché du Wandenreich, dirigé par Yhwach, déclare une guerre totale aux Shinigami.",
      "de-DE": "Der Friede wird gestört, als in der Soul Society Alarm ertönt. Das verborgene Wandenreich unter Yhwach erklärt den Shinigami den totalen Krieg.",
    },
    score: 9.1,
    episodes_count: 39,
    status: "RELEASING",
    banner_image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1400&q=80",
    cover_image: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: 3,
    mal_id: 40456,
    title: "Demon Slayer: Kimetsu no Yaiba",
    title_english: "Demon Slayer: Kimetsu no Yaiba",
    title_japanese: "鬼滅の刃",
    title_portuguese: "Demon Slayer: Kimetsu no Yaiba",
    title_spanish: "Guardianes de la Noche: Kimetsu no Yaiba",
    title_french: "Demon Slayer: Kimetsu no Yaiba",
    title_german: "Demon Slayer: Kimetsu no Yaiba",
    synopses: {
      "pt-BR": "Tanjiro Kamado parte em uma jornada perigosa para vingar sua família e encontrar a cura para sua irmã Nezuko, transformada em um demônio.",
      "en-US": "Tanjiro Kamado sets out on a hazardous journey to avenge his slaughtered family and restore the humanity of his demonized sister Nezuko.",
      "ja-JP": "家族を鬼に皆殺しにされた心優しき少年・炭治郎。唯一生き残るも鬼に変貌した妹・禰豆子を人間に戻すため、鬼狩りの道へと旅立つ。",
      "es-ES": "Tanjiro Kamado emprende un peligroso viaje para vengar a su familia y curar a su hermana Nezuko, convertida en demonio.",
      "fr-FR": "Tanjiro Kamado entreprend un voyage périlleux pour venger sa famille et trouver un remède pour sa sœur Nezuko transformée en démon.",
      "de-DE": "Tanjiro Kamado begibt sich auf eine gefährliche Reise, um seine Familie zu rächen und seine in einen Dämon verwandelte Schwester Nezuko zu heilen.",
    },
    score: 8.8,
    episodes_count: 55,
    status: "COMPLETED",
    banner_image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1400&q=80",
    cover_image: "https://images.unsplash.com/photo-1541562232579-512a21360020?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: 4,
    mal_id: 51009,
    title: "Jujutsu Kaisen Season 2",
    title_english: "Jujutsu Kaisen Season 2",
    title_japanese: "呪術廻戦 懐玉・玉折 / 渋谷事変",
    title_portuguese: "Jujutsu Kaisen: Incidente em Shibuya",
    title_spanish: "Jujutsu Kaisen: Incidente de Shibuya",
    title_french: "Jujutsu Kaisen: Incident de Shibuya",
    title_german: "Jujutsu Kaisen: Shibuya-Vorfall",
    synopses: {
      "pt-BR": "O passado de Gojo Satoru e Geto Suguru ressurge, culminando na colossal armadilha orquestrada em Shibuya no Halloween de 2018.",
      "en-US": "The intertwined past of Satoru Gojo and Suguru Geto resurfaces, culminating in the cataclysmic Shibuya Incident on Halloween 2018.",
      "ja-JP": "五条悟と夏油傑の訣別の過去「懐玉・玉折」。そして2018年10月31日、ハロウィンで賑わう渋谷に帳が降ろされ、未曾有の呪術テロ「渋谷事変」が勃発する。",
      "es-ES": "El pasado de Gojo Satoru y Geto Suguru resurge, culminando en la trampa colosal de Shibuya durante Halloween de 2018.",
      "fr-FR": "Le passé liant Satoru Gojo et Suguru Geto ressurgit, culminant dans le terrible Incident de Shibuya le soir d'Halloween 2018.",
      "de-DE": "Die gemeinsame Vergangenheit von Satoru Gojo und Suguru Geto bricht auf und gipfelt im verheerenden Shibuya-Zwischenfall an Halloween 2018.",
    },
    score: 8.9,
    episodes_count: 23,
    status: "COMPLETED",
    banner_image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1400&q=80",
    cover_image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80",
  },
];

import { getUniversalCatalog, filterCatalog, ParquetAnime } from "../lib/parquetCatalog";

interface LobbyProps {
  auth?: {
    user?: {
      id: number;
      name: string;
      email: string;
      avatar?: string;
      tier: number;
    } | null;
  };
}

export default function LobbyPage({ auth }: LobbyProps) {
  const { tokens, strings, language } = useDesignTheme();

  // Estados Reativos Globais
  const [activeTab, setActiveTab] = useState<"home" | "explore" | "calendar" | "franchises">("home");
  
  // O Catálogo Universal Único
  const [universalCatalog, setUniversalCatalog] = useState<AnimeRecord[]>(INITIAL_ANIMES);
  const [rollIdx, setRollIdx] = useState(0); // 0: Último, 1: Penúltimo, 2: Antepenúltimo
  const [selectedAnime, setSelectedAnime] = useState<AnimeRecord | null>(INITIAL_ANIMES[0]);
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([1]);
  const [searchQuery, setSearchQuery] = useState("");

  // Os 3 últimos lançamentos canônicos ordenados para o Roll do Cinema
  const rollAnimes = React.useMemo(() => {
    const releasing = filterCatalog(universalCatalog, "releasing");
    if (releasing.length >= 3) {
      return releasing.slice(0, 3);
    }
    return universalCatalog.slice(0, 3);
  }, [universalCatalog]);

  // Telemetria Contínua Desacoplada de Tier
  const [telemetry, setTelemetry] = useState<TelemetryState>(() => loadTelemetryState());
  const effectiveTier = auth?.user ? auth.user.tier : 0;

  // Carregar a Base Indexada Universal Única
  useEffect(() => {
    let mounted = true;
    getUniversalCatalog().then((catalog) => {
      if (!mounted) return;
      if (catalog && catalog.length > 0) {
        setUniversalCatalog(catalog);
        setSelectedAnime(catalog[0]);
      }
    });

    const handleCatalogExpanded = (e: any) => {
      if (!mounted) return;
      if (e.detail && Array.isArray(e.detail)) {
        setUniversalCatalog(e.detail);
      }
    };

    window.addEventListener("anirium_catalog_expanded", handleCatalogExpanded);

    return () => {
      mounted = false;
      window.removeEventListener("anirium_catalog_expanded", handleCatalogExpanded);
    };
  }, []);

  useEffect(() => {
    const handleXpEvent = (e: any) => {
      if (e.detail) setTelemetry(e.detail);
    };
    window.addEventListener("anirium_xp_update", handleXpEvent);
    return () => window.removeEventListener("anirium_xp_update", handleXpEvent);
  }, []);

  const handlePlayAnime = (anime: AnimeRecord) => {
    // Ação real na UI: dispara telemetria de 60s assistidos e adiciona XP contínuo
    recordWatchProgress(60, false, effectiveTier);
  };

  const handleToggleBookmark = (anime: AnimeRecord) => {
    const exists = bookmarkedIds.includes(anime.id);
    const updated = exists
      ? bookmarkedIds.filter((id) => id !== anime.id)
      : [...bookmarkedIds, anime.id];
    setBookmarkedIds(updated);
    recordBookmarkAction(!exists, effectiveTier);
  };

  return (
    <div
      className="w-screen h-screen flex flex-col justify-between overflow-hidden relative select-none"
      style={{ backgroundColor: tokens.colors.bgBase }}
    >
      <Head title={strings.navigation.home} />

      {/* TOPBAR FLUTUANTE (No-Scroll Viewport) */}
      <header
        className="w-full h-14 flex-none px-6 z-40 border-b backdrop-blur-xl flex items-center justify-between gap-4"
        style={{
          backgroundColor: tokens.colors.bgOverlay,
          borderColor: tokens.colors.borderDefault,
        }}
      >
        {/* Identidade Visual Canônica */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <div
            onClick={() => setActiveTab("home")}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <img
              src="/assets/logos/Anirium-Textlogo.png"
              alt="Anirium"
              className="h-7 w-auto object-contain drop-shadow-[0_2px_8px_rgba(255,199,102,0.25)] group-hover:scale-105 transition-transform"
            />
          </div>

          {/* DOCK CÁPSULA ACRÍLICA DE NAVEGAÇÃO DE MUNDOS */}
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
              { id: "franchises", label: strings.navigation.franchises, icon: Layers },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer"
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

        {/* BUSCA RÁPIDA DE CATÁLOGO */}
        <div className="flex-1 max-w-xs mx-6">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs"
            style={{
              backgroundColor: tokens.colors.bgSurface,
              borderColor: tokens.colors.borderDefault,
            }}
          >
            <Search className="w-3.5 h-3.5" style={{ color: tokens.colors.textMuted }} />
            <input
              type="text"
              placeholder={strings.navigation.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-xs"
              style={{ color: tokens.colors.textPrimary }}
            />
          </div>
        </div>

        {/* CONTROLES DE IDIOMA, TEMA E PERFIL DE TELEMETRIA */}
        <div className="flex items-center gap-3">
          <ThemeLanguageSelector />
          <LolProfileBadge
            user={auth?.user}
            tier={effectiveTier}
            level={telemetry.levelNumber}
            xpPercentage={telemetry.xp}
            title={telemetry.title}
          />
        </div>
      </header>

      {/* VIEWPORT DINÂMICA DE MUNDOS (100vh Sem Rolagem Cega) */}
      <main className="flex-1 overflow-hidden p-0 flex flex-col justify-between relative">
        {activeTab === "home" && (
          <div className="w-full h-full relative">
            <CinematicArena
              rollAnimes={rollAnimes}
              activeIdx={rollIdx}
              onSelectIdx={setRollIdx}
              onPlay={handlePlayAnime}
              onToggleBookmark={handleToggleBookmark}
              isBookmarked={rollAnimes[rollIdx] ? bookmarkedIds.includes(rollAnimes[rollIdx].id) : false}
            />
          </div>
        )}

        {activeTab === "explore" && (
          <div className="h-full flex flex-col justify-between gap-4">
            <div
              className="p-6 rounded-3xl border flex flex-col gap-2"
              style={{
                backgroundColor: tokens.colors.bgSurface,
                borderColor: tokens.colors.borderDefault,
              }}
            >
              <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: tokens.colors.accentGold }}>
                {strings.labels.exploreTitle}
              </h2>
              <p className="text-xs" style={{ color: tokens.colors.textMuted }}>
                {strings.labels.exploreDescription} ({universalCatalog.length} {strings.labels.worksCount})
              </p>
            </div>
            <ModularHubTrack
              title={strings.labels.releasing}
              animes={filterCatalog(universalCatalog, "releasing", searchQuery)}
              activeAnimeId={selectedAnime?.id}
              onSelectAnime={(a) => setSelectedAnime(a)}
              onPlayAnime={handlePlayAnime}
              onToggleBookmark={handleToggleBookmark}
              bookmarkedIds={bookmarkedIds}
            />
          </div>
        )}

        {activeTab === "calendar" && (
          <div className="h-full flex flex-col justify-between gap-4">
            <div
              className="p-6 rounded-3xl border flex flex-col gap-2"
              style={{
                backgroundColor: tokens.colors.bgSurface,
                borderColor: tokens.colors.borderDefault,
              }}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: tokens.colors.accentGold }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: tokens.colors.textPrimary }}>
                  {strings.labels.calendarTitle}
                </h2>
              </div>
              <p className="text-xs" style={{ color: tokens.colors.textMuted }}>
                {strings.labels.calendarDescription}
              </p>
            </div>
            <ModularHubTrack
              title={strings.labels.calendarTrackTitle}
              animes={filterCatalog(universalCatalog, "calendar", searchQuery)}
              activeAnimeId={selectedAnime?.id}
              onSelectAnime={(a) => setSelectedAnime(a)}
              onPlayAnime={handlePlayAnime}
              onToggleBookmark={handleToggleBookmark}
              bookmarkedIds={bookmarkedIds}
            />
          </div>
        )}

        {activeTab === "franchises" && (
          <div className="h-full flex flex-col justify-center">
            <OrbitalFranchiseMap />
          </div>
        )}
      </main>

      {/* FOOTER DISCRETO DE STATUS DO SISTEMA */}
      <footer
        className="h-8 border-t px-6 flex items-center justify-between text-[10px] font-mono tracking-wider z-40 backdrop-blur-md"
        style={{
          backgroundColor: tokens.colors.bgOverlay,
          borderColor: tokens.colors.borderDefault,
          color: tokens.colors.textMuted,
        }}
      >
        <span>ANIRIUM CORE v1.0 • LARAVEL 11 + INERTIA v2 + REACT 19</span>
        <span>UNIVERSAL INDEXED BASE (PARQUET)</span>
      </footer>
    </div>
  );
}
