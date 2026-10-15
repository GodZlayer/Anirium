"use client";
import { loadCanonicalResume, isReleaseUuid } from "../lib/profilePlaybackIdentity";

import React, { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import AnimeModal from "@/components/AnimeModal";
import FranchiseModal from "@/components/FranchiseModal";
import PluginPlayerHost from "@/components/PluginPlayerHost";
import UserProfileModal from "@/components/UserProfileModal";
import { Anime, AiringSchedule, CanonicalFranchise } from "@/types/anime";
import { useUser } from "@/context/UserContext";
import {
  Sparkles,
  Play,
  Info,
  ChevronLeft,
  ChevronRight,
  Compass,
  Calendar,
  Network,
  Activity,
  Layers,
  ArrowRight,
  Star,
  CheckCircle2,
  Tv,
  Clock,
  Flame,
  Search,
  Filter,
  X,
  Film,
  Tag,
  Hash,
  Trophy,
  Award,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { buildFranchisesFromCatalog, extractFranchiseRoot, FranchiseGroup } from "@/lib/franchiseUtils";
import { getModularCatalogFromParquet } from "@/lib/parquetCatalog";

const POPULAR_FRANCHISES = [
  {
    rank: 1,
    title: "One Piece",
    years: "1999 • 15+ obras",
    image: "https://cdn.myanimelist.net/images/anime/6/73245l.jpg",
    mal_id: 21,
  },
  {
    rank: 2,
    title: "Naruto",
    years: "2002 • 12+ obras",
    image: "https://cdn.myanimelist.net/images/anime/13/17405l.jpg",
    mal_id: 20,
  },
  {
    rank: 3,
    title: "Bleach",
    years: "2004 • 10+ obras",
    image: "https://cdn.myanimelist.net/images/anime/3/40451l.jpg",
    mal_id: 269,
  },
  {
    rank: 4,
    title: "Attack on Titan",
    years: "2013 • 9+ obras",
    image: "https://cdn.myanimelist.net/images/anime/10/47347l.jpg",
    mal_id: 16498,
  },
  {
    rank: 5,
    title: "Demon Slayer",
    years: "2019 • 8+ obras",
    image: "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg",
    mal_id: 38000,
  },
];

const EXPLORE_SUMMARIES = [
  { id: "temporada", name: "Temporada", desc: "Em exibição (entre ep 1 e o último)" },
  { id: "todos", name: "Todos", desc: "Todas as obras com ao menos 1 ep" },
  { id: "nome", name: "Por Nome", desc: "A-Z, números e símbolos" },
] as const;

const FRANCHISE_SUMMARIES = [
  { id: "todas", name: "Todas", desc: "Top 5 geral absoluto do banco canônico" },
  { id: "filtrado", name: "Filtrado", desc: "Filtros por gênero, tema e formato" },
  { id: "nome", name: "Por Nome", desc: "Índice A-Z, números e símbolos" },
] as const;

const FORMATS = [
  { id: "TV", name: "Série TV" },
  { id: "MOVIE", name: "Filme" },
  { id: "OVA", name: "OVA" },
  { id: "ONA", name: "ONA / Web" },
  { id: "SPECIAL", name: "Especial" },
];

const GENRES = [
  { name: "Ação", key: "Action" },
  { name: "Aventura", key: "Adventure" },
  { name: "Comédia", key: "Comedy" },
  { name: "Drama", key: "Drama" },
  { name: "Fantasia", key: "Fantasy" },
  { name: "Sci-Fi", key: "Sci-Fi" },
  { name: "Slice of Life", key: "Slice of Life" },
  { name: "Terror", key: "Horror" },
  { name: "Romance", key: "Romance" },
  { name: "Mistério", key: "Mystery" },
  { name: "Sobrenatural", key: "Supernatural" },
  { name: "Esportes", key: "Sports" },
];

const THEMES_SUBGENRES = [
  { name: "Isekai", key: "Isekai" },
  { name: "Mecha", key: "Mecha" },
  { name: "Psicológico", key: "Psychological" },
  { name: "Escolar", key: "School" },
  { name: "Militar", key: "Military" },
  { name: "Shounen", key: "Shounen" },
  { name: "Seinen", key: "Seinen" },
  { name: "Mitologia", key: "Mythology" },
  { name: "Superpoder", key: "Super Power" },
  { name: "Artes Marciais", key: "Martial Arts" },
  { name: "Magia", key: "Magic" },
  { name: "Viagem no Tempo", key: "Time Travel" },
];

const ALPHABET_CHARS = [
  "Todos", "0-9", "#",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
];

export default function Home() {
  const { user, level, watchHistory, activeTheme, hasPlayerAddon, loginWithGoogle, isLoading } = useUser();
  const googlePromptedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<string>("inicio");

  // Catalogs
  const [seasonalAnimes, setSeasonalAnimes] = useState<Anime[]>([]);
  const [popularAnimes, setPopularAnimes] = useState<Anime[]>([]);
  const [upcomingAnimes, setUpcomingAnimes] = useState<Anime[]>([]);
  const [allAnimes, setAllAnimes] = useState<Anime[]>([]);
  const [universes, setUniverses] = useState<CanonicalFranchise[]>([]);
  const [catalogCounts, setCatalogCounts] = useState<{ totalReleases: number | null; totalFranchises: number | null }>({
    totalReleases: null,
    totalFranchises: null,
  });
  const [schedule, setSchedule] = useState<AiringSchedule[]>([]);

  // Search
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const searchRevisionRef = useRef(0);
  const [isSearching, setIsSearching] = useState(false);

  // Modals & Playback
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [activePlayback, setActivePlayback] = useState<{
    anime: Anime;
    episode: number;
    seasonIdx: number;
  } | null>(null);

  // Carousels Page Indices (Deterministic pagination - Zero scroll)
  const [spotlightIdx, setSpotlightIdx] = useState(0);

  // Explorador Canônico: 3 Sumários + Multi-Filtros (Formato + Gêneros + Subgêneros) + Alfanumérico
  const [exploreSummary, setExploreSummary] = useState<"temporada" | "todos" | "nome">("temporada");
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [activeCharFilter, setActiveCharFilter] = useState<string>("Todos");
  const [activeFilterCategoryTab, setActiveFilterCategoryTab] = useState<"generos" | "subgeneros" | "formatos">("generos");
  const [explorePage, setExplorePage] = useState(0);

  // Aba Franquias: 3 Sumários ("todas" | "filtrado" | "nome") idêntico ao Explorar
  const [franchiseSummary, setFranchiseSummary] = useState<"todas" | "filtrado" | "nome">("todas");
  const [franchiseFormats, setFranchiseFormats] = useState<string[]>([]);
  const [franchiseGenres, setFranchiseGenres] = useState<string[]>([]);
  const [franchiseThemes, setFranchiseThemes] = useState<string[]>([]);
  const [franchiseCharFilter, setFranchiseCharFilter] = useState<string>("Todos");
  const [franchiseFilterCategoryTab, setFranchiseFilterCategoryTab] = useState<"generos" | "subgeneros" | "formatos">("generos");
  const [selectedFranchiseDetail, setSelectedFranchiseDetail] = useState<FranchiseGroup | null>(null);

  const [scheduleTab, setScheduleTab] = useState<number>(new Date().getDay()); // 0=Dom … 6=Sáb
  const [schedulePage, setSchedulePage] = useState(0);

  // Latest released episodes strictly from distinct franchises
  const [latestEpisodes, setLatestEpisodes] = useState<AiringSchedule[]>([]);

  // Fetch initial catalog data
  useEffect(() => {
    async function loadData() {
      try {
        try {
          const parquetData = await getModularCatalogFromParquet();
          if (parquetData.popular?.length || parquetData.seasonal?.length) {
            if (parquetData.seasonal) setSeasonalAnimes(parquetData.seasonal);
            if (parquetData.popular) {
              setPopularAnimes(parquetData.popular);
              setAllAnimes(parquetData.popular);
            }
            if (parquetData.upcoming) setUpcomingAnimes(parquetData.upcoming);
            if (parquetData.counts) setCatalogCounts(parquetData.counts);
            return;
          }
        } catch (parquetErr) {
          console.warn("[Parquet] Fallback para API do Core:", parquetErr);
        }

        const res = await fetch("/api/catalog");
        const data = await res.json();
        if (data.seasonal) setSeasonalAnimes(data.seasonal);
        if (data.popular) setPopularAnimes(data.popular);
        if (data.upcoming) setUpcomingAnimes(data.upcoming);
        if (data.all) setAllAnimes(data.all);
        if (data.universes) setUniverses(data.universes);
        if (data.counts) setCatalogCounts(data.counts);
      } catch (err) {
        console.error("Failed to load initial catalog data:");
      }
    }
    loadData();

    // 1. Programação semanal para a aba Calendário
    fetch("/api/schedule")
      .then((res) => res.json())
      .then((data) => {
        if (data.schedule) setSchedule(data.schedule);
      })
      .catch(() => {});

    // 2. Exatos últimos episódios lançados para o Hero da Home
    fetch("/api/schedule?type=latest")
      .then((res) => res.json())
      .then((data) => {
        if (data.schedule) setLatestEpisodes(data.schedule);
      })
      .catch(() => {});
  }, []);

  // Google One Tap para visitantes
  useEffect(() => {
    if (user || isLoading || googlePromptedRef.current) return;
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const google = (window as any).google;

    if (google?.accounts?.id && googleClientId) {
      googlePromptedRef.current = true;
      try {
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: any) => {
            if (response.credential) {
              await loginWithGoogle({ credential: response.credential });
              window.location.reload();
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        google.accounts.id.prompt();
      } catch {}
    }
  }, [user, isLoading, loginWithGoogle]);

  const handleSearch = async (query: string) => {
    const revision = ++searchRevisionRef.current;
    if (!query || query.trim().length === 0) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (revision === searchRevisionRef.current) setSearchResults(data.results || []);
    } catch (err) {
      console.error("Search failed:");
    }
  };

  const handleStartPlay = (anime: Anime) => {
    setSelectedAnime(anime);
  };

  const handlePlayEpisode = (anime: Anime, episodeNum: number, seasonIdx: number = 0) => {
    if (!hasPlayerAddon) {
      if (anime.streaming_links && anime.streaming_links.length > 0) {
        window.open(anime.streaming_links[0].url, "_blank");
      } else {
        setSelectedAnime(anime);
      }
      return;
    }
    setSelectedAnime(null);
    setActivePlayback({ anime, episode: episodeNum, seasonIdx });
  };

  const [resumeState, setResumeState] = useState<"idle" | "loading" | "unavailable">("idle");
  const resumeBusyRef = useRef(false);
  const resumeOwnerRef = useRef(user?.id);
  resumeOwnerRef.current = user?.id;
  const handleCanonicalResume = async (animeId: number, seasonEntityId: string, episodeEntityId: string) => {
    const owner = user?.id;
    if (!owner || resumeBusyRef.current) return false;
    resumeBusyRef.current = true;
    setResumeState("loading");
    try {
      const playback = await loadCanonicalResume(animeId,seasonEntityId,episodeEntityId,fetch,owner);
      if (resumeOwnerRef.current !== owner) { setResumeState("idle"); return false; }
      if (!playback) { setResumeState("unavailable"); return false; }
      handlePlayEpisode(playback.anime,playback.episode,playback.seasonIdx);
      setResumeState("idle");
      return true;
    } finally { resumeBusyRef.current = false; }
  };

  // Hero 3 animes carousel (os exatos últimos 3 episódios de franquias diferentes lançados, excluindo +18/hentai)
  const [heroIdx, setHeroIdx] = useState(0);

  const cleanRecentAnimes = React.useMemo(() => {
    const isAdult = (a: Anime) => {
      const rating = (a.rating || "").toLowerCase();
      if (rating.includes("rx") || rating.includes("hentai") || rating.includes("r+")) return true;
      if (a.genres?.some((g) => g.name.toLowerCase().includes("hentai") || g.name.toLowerCase().includes("erotica"))) return true;
      return false;
    };

    const extractRoot = (title: string) => {
      return title
        .toLowerCase()
        .replace(/season\s*\d+/gi, "")
        .replace(/\d+(?:nd|rd|th|st)\s*season/gi, "")
        .replace(/part\s*\d+/gi, "")
        .replace(/:\s*.+$/, "")
        .replace(/-\s*.+$/, "")
        .trim();
    };

    const seenFranchises = new Set<string>();
    const seenIds = new Set<number>();
    const list: Anime[] = [];

    // 1. Prioridade absoluta: Exatos últimos episódios lançados (ordenados por TIME_DESC)
    for (const item of latestEpisodes) {
      if (item.anime && !seenIds.has(item.anime.mal_id) && !isAdult(item.anime)) {
        const root = extractRoot(item.anime.title_english || item.anime.title);
        if (!seenFranchises.has(root)) {
          seenFranchises.add(root);
          seenIds.add(item.anime.mal_id);
          // Anexar número do último episódio no objeto anime para exibição
          const animeWithEp = { ...item.anime, latestAiredEpisode: item.episode };
          list.push(animeWithEp);
        }
      }
      if (list.length >= 3) break;
    }

    // 2. Fallback caso a lista de últimos episódios esteja carregando:
    if (list.length < 3) {
      for (const item of schedule) {
        if (item.anime && !seenIds.has(item.anime.mal_id) && !isAdult(item.anime)) {
          const root = extractRoot(item.anime.title_english || item.anime.title);
          if (!seenFranchises.has(root)) {
            seenFranchises.add(root);
            seenIds.add(item.anime.mal_id);
            list.push(item.anime);
          }
        }
        if (list.length >= 3) break;
      }
    }

    if (list.length < 3) {
      for (const a of seasonalAnimes) {
        if (!seenIds.has(a.mal_id) && !isAdult(a)) {
          const root = extractRoot(a.title_english || a.title);
          if (!seenFranchises.has(root)) {
            seenFranchises.add(root);
            seenIds.add(a.mal_id);
            list.push(a);
          }
        }
        if (list.length >= 3) break;
      }
    }

    return list;
  }, [latestEpisodes, schedule, seasonalAnimes]);

  const heroAnime = cleanRecentAnimes[heroIdx] || cleanRecentAnimes[0] || null;

  // Pagination helpers
  const spotlightItemsPerPage = 3;
  const currentSpotlights = seasonalAnimes.slice(
    spotlightIdx * spotlightItemsPerPage,
    (spotlightIdx + 1) * spotlightItemsPerPage
  );
  const maxSpotlightPages = Math.ceil(Math.min(seasonalAnimes.length, 9) / spotlightItemsPerPage);

  // Pool completo de obras do Anirium para consolidação de franquias
  const allCatalogPool = React.useMemo(() => {
    const pool = allAnimes.length > 0 ? allAnimes : [...seasonalAnimes, ...popularAnimes, ...upcomingAnimes];
    const seen = new Set<number>();
    const res: Anime[] = [];
    for (const a of pool) {
      if (!seen.has(a.mal_id)) {
        seen.add(a.mal_id);
        res.push(a);
      }
    }
    return res;
  }, [allAnimes, seasonalAnimes, popularAnimes, upcomingAnimes]);

  // Lista canônica de todas as franquias agregadas (alimentada diretamente do banco PostgreSQL com 8.1k franquias e 11.8k obras)
  const allFranchises = React.useMemo(() => {
    if (universes && universes.length > 0) {
      return universes as FranchiseGroup[];
    }
    return buildFranchisesFromCatalog(allCatalogPool);
  }, [universes, allCatalogPool]);

  const exploreList = React.useMemo(() => {
    // 1. Determinação da Base conforme o Sumário Principal Selecionado
    let base: Anime[] = [];

    if (exploreSummary === "temporada") {
      // Temporada: Animes que estão em exibição ("airing", entre ep 1 e o último)
      // Agrega seasonalAnimes, animes da grade semanal (schedule) e últimos episódios lançados
      const scheduleAnimes = schedule.map((s) => s.anime).filter((a): a is Anime => Boolean(a));
      const latestAnimes = latestEpisodes.map((l) => l.anime).filter((a): a is Anime => Boolean(a));
      const allPool = [...seasonalAnimes, ...scheduleAnimes, ...latestAnimes, ...popularAnimes];

      const seen = new Set<number>();
      for (const a of allPool) {
        if (!seen.has(a.mal_id)) {
          seen.add(a.mal_id);
          const st = (a.status || "").toUpperCase();
          if (st === "RELEASING" || st === "AIRING" || st === "CURRENT") {
            base.push(a);
          }
        }
      }
      if (base.length === 0) {
        base = seasonalAnimes;
      }
    } else if (exploreSummary === "todos") {
      // Todos: Cada anime/lançamento exibido individualmente (não agrupado por franquia)
      const allPool = allAnimes.length > 0 ? allAnimes : [...seasonalAnimes, ...popularAnimes, ...upcomingAnimes];
      const seen = new Set<number>();
      for (const a of allPool) {
        if (!seen.has(a.mal_id)) {
          seen.add(a.mal_id);
          const st = (a.status || "").toUpperCase();
          const eps = a.episodes || 0;
          if (st !== "NOT_YET_RELEASED" || eps >= 1) {
            base.push(a);
          }
        }
      }
    } else if (exploreSummary === "nome") {
      // Nome: Cada anime individualmente, ordenado A-Z pelo seu próprio título de lançamento
      const allPool = allAnimes.length > 0 ? allAnimes : [...seasonalAnimes, ...popularAnimes, ...upcomingAnimes];
      const seen = new Set<number>();
      for (const a of allPool) {
        if (!seen.has(a.mal_id)) {
          seen.add(a.mal_id);
          base.push(a);
        }
      }
      // Ordenação Alfabética A-Z pelo título individual do lançamento
      base.sort((a, b) => {
        const titleA = (a.title_portuguese || a.title_english || a.title || "").toLowerCase();
        const titleB = (b.title_portuguese || b.title_english || b.title || "").toLowerCase();
        return titleA.localeCompare(titleB, "pt-BR");
      });
    }

    // 2. Filtro Alfanumérico por Letra / Dígito / Símbolo (#)
    if (activeCharFilter !== "Todos") {
      base = base.filter((anime) => {
        const title = (anime.title_portuguese || anime.title_english || anime.title || "").trim();
        if (!title) return false;
        const firstChar = title[0].toUpperCase();

        if (activeCharFilter === "0-9") {
          return /[0-9]/.test(firstChar);
        }
        if (activeCharFilter === "#") {
          return !/[A-Z0-9]/i.test(firstChar);
        }
        return firstChar === activeCharFilter;
      });
    }

    // 3. Multi-Filtro: FORMATO (TV, MOVIE, OVA, ONA, SPECIAL) - OR dentro de formatos selecionados
    if (selectedFormats.length > 0) {
      base = base.filter((anime) => {
        const animeFmt = (anime.format || "").toUpperCase();
        return selectedFormats.some((f) => {
          if (f === "TV") return animeFmt === "TV" || animeFmt === "TV_SHORT" || !animeFmt;
          if (f === "MOVIE") return animeFmt === "MOVIE";
          if (f === "OVA") return animeFmt === "OVA";
          if (f === "ONA") return animeFmt === "ONA";
          if (f === "SPECIAL") return animeFmt === "SPECIAL" || animeFmt === "SPINOFF";
          return animeFmt === f;
        });
      });
    }

    // 4. Multi-Filtro: GÊNEROS (Combinação AND - deve possuir todos os gêneros selecionados)
    if (selectedGenres.length > 0) {
      base = base.filter((anime) => {
        const animeGenres = (anime.genres || []).map((g) => g.name.toLowerCase());
        return selectedGenres.every((selGenreName) => {
          const genreObj = GENRES.find((g) => g.name === selGenreName);
          const keyEn = genreObj ? genreObj.key.toLowerCase() : selGenreName.toLowerCase();
          const namePt = selGenreName.toLowerCase();
          return animeGenres.some((ag) => ag === keyEn || ag === namePt);
        });
      });
    }

    // 5. Multi-Filtro: SUBGÊNEROS / TEMAS (MAL & AniList tags/genres)
    if (selectedThemes.length > 0) {
      base = base.filter((anime) => {
        const animeTags = (anime.tags || []).map((t) => t.name.toLowerCase());
        const animeGenres = (anime.genres || []).map((g) => g.name.toLowerCase());
        const synopsisLower = (anime.synopsis || "").toLowerCase();

        return selectedThemes.every((selThemeName) => {
          const themeObj = THEMES_SUBGENRES.find((t) => t.name === selThemeName);
          const keyEn = themeObj ? themeObj.key.toLowerCase() : selThemeName.toLowerCase();
          const namePt = selThemeName.toLowerCase();

          const hasTag = animeTags.some((tag) => tag === keyEn || tag === namePt || tag.includes(keyEn));
          const hasGenre = animeGenres.some((g) => g === keyEn || g === namePt);
          const hasInSynopsis = synopsisLower.includes(keyEn) || synopsisLower.includes(namePt);

          return hasTag || hasGenre || hasInSynopsis;
        });
      });
    }

    return base;
  }, [
    exploreSummary,
    selectedFormats,
    selectedGenres,
    selectedThemes,
    activeCharFilter,
    seasonalAnimes,
    popularAnimes,
    upcomingAnimes,
    allAnimes,
    allFranchises,
    schedule,
    latestEpisodes,
  ]);

  const exploreItemsPerPage = 8;
  const maxExplorePages = Math.max(1, Math.ceil(exploreList.length / exploreItemsPerPage));
  const currentExploreItems = exploreList.slice(
    explorePage * exploreItemsPerPage,
    (explorePage + 1) * exploreItemsPerPage
  );

  // Top 5 Franquias: Rankeado estritamente pela nota geral da franquia, podendo ser "todas", "filtrado" ou "nome"
  // Uma franquia é composta canonicamente por múltiplas produções/obras (worksCount > 1)
  const topFranchises = React.useMemo(() => {
    let list = allFranchises.filter((f) => f.worksCount > 1);

    if (franchiseSummary === "nome") {
      // 1. Filtro Alfanumérico A-Z no modo Nome
      if (franchiseCharFilter !== "Todos") {
        list = list.filter((f) => {
          const title = (f.title_portuguese || f.title_english || f.rootTitle || "").trim();
          if (!title) return false;
          const firstChar = title[0].toUpperCase();
          if (franchiseCharFilter === "0-9") return /[0-9]/.test(firstChar);
          if (franchiseCharFilter === "#") return !/[A-Z0-9]/i.test(firstChar);
          return firstChar === franchiseCharFilter;
        });
      }
    } else if (franchiseSummary === "filtrado") {
      // 1. Filtro de Formatos (TV, MOVIE, OVA, ONA, SPECIAL) presentes na franquia
      if (franchiseFormats.length > 0) {
        list = list.filter((f) => {
          return franchiseFormats.some((fmt) => {
            return f.formats.some((ff) => {
              if (fmt === "TV") return ff === "TV" || ff === "TV_SHORT";
              if (fmt === "MOVIE") return ff === "MOVIE";
              if (fmt === "OVA") return ff === "OVA";
              if (fmt === "ONA") return ff === "ONA";
              if (fmt === "SPECIAL") return ff === "SPECIAL" || ff === "SPINOFF";
              return ff === fmt;
            });
          });
        });
      }

      // 2. Filtro de Gêneros (AND - a franquia como um todo deve contemplar os gêneros)
      if (franchiseGenres.length > 0) {
        list = list.filter((f) => {
          const franchiseGenNames = f.genres.map((g) => g.name.toLowerCase());
          return franchiseGenres.every((selG) => {
            const gObj = GENRES.find((item) => item.name === selG);
            const keyEn = gObj ? gObj.key.toLowerCase() : selG.toLowerCase();
            const namePt = selG.toLowerCase();
            return franchiseGenNames.some((gn) => gn === keyEn || gn === namePt);
          });
        });
      }

      // 3. Filtro de Subgêneros / Temas
      if (franchiseThemes.length > 0) {
        list = list.filter((f) => {
          const tagNames = f.tags.map((t) => t.name.toLowerCase());
          const genNames = f.genres.map((g) => g.name.toLowerCase());
          const synopsisLower = (f.representativeAnime.synopsis || "").toLowerCase();

          return franchiseThemes.every((selTheme) => {
            const tObj = THEMES_SUBGENRES.find((item) => item.name === selTheme);
            const keyEn = tObj ? tObj.key.toLowerCase() : selTheme.toLowerCase();
            const namePt = selTheme.toLowerCase();
            const hasTag = tagNames.some((tag) => tag === keyEn || tag === namePt || tag.includes(keyEn));
            const hasGen = genNames.some((g) => g === keyEn || g === namePt);
            const hasSyn = synopsisLower.includes(keyEn) || synopsisLower.includes(namePt);
            return hasTag || hasGen || hasSyn;
          });
        });
      }
    }

    // Rankeamento obrigatório: ordenação estrita pela Nota Geral da Franquia (decrescente)
    list.sort((a, b) => {
      // 1. Maior nota geral
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      // 2. Maior nota individual de pico como desempate
      if (b.maxScore !== a.maxScore) {
        return b.maxScore - a.maxScore;
      }
      // 3. Maior volume de temporadas/obras canônicas
      return b.seasonsCount - a.seasonsCount;
    });

    // Retorna o Top 5 da seleção (todas, filtrado ou nome)
    return list.slice(0, 5);
  }, [
    allFranchises,
    franchiseSummary,
    franchiseFormats,
    franchiseGenres,
    franchiseThemes,
    franchiseCharFilter,
  ]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0B0B0D] text-[#FFF9F0] flex flex-col select-none">
      {/* Top Console Navigation Bar */}
      <Navbar
        onSearch={handleSearch}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenProfile={() => setShowUserProfileModal(true)}
        isSearching={isSearching}
        onClearSearch={() => {
          setIsSearching(false);
          setSearchResults([]);
        }}
      />

      {/* Main Full-Viewport Console Stage (Position-anchored, NO scroll, responsive to zoom) */}
      <main className="flex-1 w-full h-[calc(100vh-56px)] mt-[56px] p-2 sm:p-4 flex flex-col justify-between overflow-hidden min-h-0">
        {isSearching ? (
          /* Search Overlay Console */
          <div className="h-full w-full flex flex-col justify-between p-3 sm:p-4 bg-[#1A1A1F]/70 rounded-2xl sm:rounded-3xl border border-[#3A3A43]">
            <div className="flex items-center justify-between pb-2 border-b border-[#3A3A43]">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#FFC766]" />
                <h2 className="font-serif text-sm sm:text-base font-bold text-[#FFF9F0]">
                  Resultados da Busca ({searchResults.length})
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsSearching(false);
                  setSearchResults([]);
                }}
                className="px-2.5 py-0.5 rounded-full bg-[#23232A] text-[11px] text-[#EADCC8] hover:text-white transition"
              >
                Limpar
              </button>
            </div>

            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 py-2 items-center overflow-hidden">
              {searchResults.slice(0, 6).map((anime) => (
                <div
                  key={anime.mal_id}
                  onClick={() => setSelectedAnime(anime)}
                  className="h-full flex flex-col rounded-xl sm:rounded-2xl overflow-hidden bg-[#23232A] border border-[#3A3A43] hover:border-[#FFC766] cursor-pointer transition group shadow-md"
                >
                  <div className="relative flex-1 w-full overflow-hidden bg-[#0B0B0D]">
                    <img
                      src={anime.images.webp?.large_image_url || anime.images.jpg?.large_image_url}
                      alt={anime.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="p-2">
                    <h3 className="text-[11px] sm:text-xs font-bold truncate text-[#FFF9F0] group-hover:text-[#FFC766]">
                      {anime.title_portuguese || anime.title_english || anime.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[10px] font-mono text-[#EADCC8]/60 text-right">
              Pressione ESC para sair da busca
            </div>
          </div>
        ) : (
          <>
            {/* 1. ABA INÍCIO: Hero Total Full-Screen + Imagem Promocional do Anime no BG + Mascote Flutuando no Canto Inferior Direito */}
            {activeTab === "inicio" && (
              <div className="h-full w-full relative rounded-2xl sm:rounded-3xl overflow-hidden border border-[#3A3A43]/60 shadow-2xl flex flex-col justify-center p-4 sm:p-8 xl:p-10 select-none">
                {/* Background Promocional do Anime (Full Cover com Gradients Cinematográficos) */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                  {heroAnime && (
                    <img
                      key={heroAnime.mal_id}
                      src={
                        heroAnime.banner_image ||
                        heroAnime.images.webp?.large_image_url ||
                        heroAnime.images.jpg?.large_image_url
                      }
                      alt={heroAnime.title}
                      className="w-full h-full object-cover object-center filter brightness-45 contrast-110 scale-105 transition-all duration-1000 ease-out"
                    />
                  )}
                  {/* Gradiente escuro para legibilidade máxima do texto e identidade Anirium */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/80 to-[#0B0B0D]/50" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0D] via-[#0B0B0D]/85 to-transparent" />
                  <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#FFC766]/10 rounded-full blur-[120px]" />
                </div>

                {/* Conteúdo Superior / Central: Título, Carrossel & Ações do Anime */}
                <div className="relative z-10 flex flex-col justify-center max-w-xl lg:max-w-2xl xl:max-w-3xl space-y-2.5 sm:space-y-4 my-auto">
                  {/* Controles do Carrossel de 3 Animes Recentes */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5 bg-[#1A1A1F]/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#3A3A43]">
                      {cleanRecentAnimes.slice(0, 3).map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setHeroIdx(idx)}
                          className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all ${
                            heroIdx === idx
                              ? "bg-[#FFC766] scale-125 shadow-[0_0_8px_#FFC766]"
                              : "bg-[#3A3A43] hover:bg-[#EADCC8]"
                          }`}
                          title={`Lançamento ${idx + 1}`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHeroIdx((prev) => (prev > 0 ? prev - 1 : cleanRecentAnimes.length - 1))}
                        className="w-6 h-6 rounded-full bg-[#1A1A1F]/80 backdrop-blur-md border border-[#3A3A43] hover:border-[#FFC766] flex items-center justify-center text-[#EADCC8] hover:text-[#FFC766] transition"
                        title="Anterior"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setHeroIdx((prev) => (prev < cleanRecentAnimes.length - 1 ? prev + 1 : 0))}
                        className="w-6 h-6 rounded-full bg-[#1A1A1F]/80 backdrop-blur-md border border-[#3A3A43] hover:border-[#FFC766] flex items-center justify-center text-[#EADCC8] hover:text-[#FFC766] transition"
                        title="Próximo"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(heroAnime as any)?.latestAiredEpisode && (
                        <span className="text-[10px] sm:text-[11px] font-mono font-bold tracking-wider text-[#0B0B0D] bg-[#FFC766] px-2 py-0.5 rounded-full shadow-sm">
                          Ep. {(heroAnime as any).latestAiredEpisode}
                        </span>
                      )}

                      {heroAnime?.format && (
                        <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[#FFC766] bg-[#FFC766]/10 px-2 py-0.5 rounded-full border border-[#FFC766]/30">
                          {heroAnime.format} • {heroAnime.year || "2026"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Título do Anime */}
                  <h1 className="font-serif text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tight text-[#FFF9F0] leading-tight drop-shadow-md">
                    {heroAnime?.title_portuguese || heroAnime?.title_english || heroAnime?.title || "Anirium"}
                  </h1>

                  {/* Sinopse Dinâmica Curada */}
                  <p className="text-xs sm:text-sm text-[#EADCC8]/90 max-w-lg lg:max-w-xl line-clamp-2 sm:line-clamp-3 xl:line-clamp-4 leading-relaxed font-normal drop-shadow">
                    {heroAnime?.synopsis ||
                      "Sua plataforma canônica de descoberta, organização e genealogia de franquias de anime."}
                  </p>

                  {resumeState !== "idle" && <p role={resumeState === "loading" ? "status" : "alert"} className="text-xs text-[#EADCC8]">{resumeState === "loading" ? "Confirmando episódio…" : "Episódio indisponível. Tente novamente."}</p>}
                  {/* Botões de Ação */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
                    <button
                      onClick={() => {
                        if (!heroAnime) return;
                        if (level >= 2) {
                          // Anirium+: vai exatamente para onde o usuário parou
                          const historyItem = watchHistory?.find((h) => h.animeId === heroAnime.mal_id);
                          if (historyItem?.resumeAvailable && isReleaseUuid(historyItem.seasonEntityId) && isReleaseUuid(historyItem.canonicalEntityId)) {
                            void handleCanonicalResume(heroAnime.mal_id,historyItem.seasonEntityId,historyItem.canonicalEntityId);
                          } else { setSelectedAnime(heroAnime); }
                        } else if (hasPlayerAddon) {
                          // Player Comunitário: apenas vai para a tela de episódios
                          setSelectedAnime(heroAnime);
                        } else if (heroAnime.streaming_links && heroAnime.streaming_links.length > 0) {
                          window.open(heroAnime.streaming_links[0].url, "_blank");
                        } else {
                          setSelectedAnime(heroAnime);
                        }
                      }}
                      className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-[#FFC766] to-[#FFB347] text-[#0B0B0D] font-bold text-xs sm:text-sm shadow-xl shadow-[#FFC766]/20 hover:brightness-110 active:scale-95 transition-all"
                      title={level >= 2 ? "Assistir onde parou" : hasPlayerAddon ? "Ver Episódios" : heroAnime?.streaming_links?.[0] ? `Assistir no canal oficial ${heroAnime.streaming_links[0].site}` : "Episódios & Obras"}
                    >
                      {level >= 2 ? (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Assistir</span>
                        </>
                      ) : hasPlayerAddon ? (
                        <>
                          <Tv className="w-3.5 h-3.5 text-[#0B0B0D]" />
                          <span>Ver Episódios</span>
                        </>
                      ) : heroAnime?.streaming_links?.[0] ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 fill-[#0B0B0D] text-[#FFC766]" />
                          <span>Oficial ({heroAnime.streaming_links[0].site})</span>
                          <ExternalLink className="w-3 h-3 opacity-70" />
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Assistir</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => heroAnime && setSelectedAnime(heroAnime)}
                      className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#1A1A1F]/80 hover:bg-[#23232A] text-[#FFF9F0] text-xs sm:text-sm font-semibold border border-[#3A3A43] backdrop-blur-md transition-all"
                      title="Ficha técnica, linhagem e detalhes"
                    >
                      <Info className="w-3.5 h-3.5 text-[#FFC766]" />
                      <span>Detalhes</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("explorar")}
                      className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm text-[#EADCC8] hover:text-[#FFC766] transition font-mono"
                    >
                      <span>Explorar Catálogo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mascote Flutuando Preso na Direita Inferior da Tela (Escalável para Mobile e Zoom) */}
                <div className="absolute right-2 sm:right-6 md:right-8 bottom-0 z-20 pointer-events-none select-none flex items-end">
                  <div className="relative w-36 sm:w-52 md:w-64 lg:w-72 xl:w-80 max-h-[55vh] aspect-square flex items-end justify-center filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.85)] drop-shadow-[0_0_20px_rgba(255,199,102,0.15)]">
                    <img
                      src="/assets/logos/Anirium-Persona-LogoArtistica.png"
                      alt="Anirium Mascote"
                      className="w-full h-full object-contain object-bottom pointer-events-auto transform hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. ABA EXPLORAR: Coluna Estreita à Esquerda (Filtros) + Grid Responsivo de Obras à Direita */}
            {activeTab === "explorar" && (
              <div className="h-full w-full flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
                {/* Coluna Estreita à Esquerda: Sumários, Multi-Filtros (Formatos, Gêneros, Subgêneros) e A-Z */}
                <aside className="w-full md:w-64 lg:w-72 flex-none bg-[#1A1A1F]/70 backdrop-blur-md rounded-2xl p-3 border border-[#3A3A43] flex flex-col justify-between gap-2.5 h-full overflow-hidden">
                  {/* Topo do Sidebar: Cabeçalho com Ícone e Limpar Filtros */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#3A3A43]/60 flex-none">
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-4 h-4 text-[#FFC766]" />
                      <h3 className="font-serif text-sm font-bold text-[#FFF9F0] tracking-wide">
                        Filtros Canônicos
                      </h3>
                    </div>

                    {(selectedFormats.length > 0 || selectedGenres.length > 0 || selectedThemes.length > 0 || activeCharFilter !== "Todos") && (
                      <button
                        onClick={() => {
                          setSelectedFormats([]);
                          setSelectedGenres([]);
                          setSelectedThemes([]);
                          setActiveCharFilter("Todos");
                          setExplorePage(0);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E5484D]/15 text-[#E5484D] border border-[#E5484D]/30 text-[10px] font-semibold hover:bg-[#E5484D]/25 transition"
                      >
                        <X className="w-2.5 h-2.5" />
                        <span>Limpar</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Sumário Principal (Temporada / Todos / Por Nome) */}
                  <div className="flex-none">
                    <div className="text-[10px] font-bold text-[#EADCC8]/60 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Compass className="w-3 h-3 text-[#FFC766]" /> Sumário
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {EXPLORE_SUMMARIES.map((s) => {
                        const isActive = exploreSummary === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              setExploreSummary(s.id);
                              setExplorePage(0);
                            }}
                            title={s.desc}
                            className={`py-1 px-1.5 rounded-lg text-[11px] font-semibold text-center transition-all truncate ${
                              isActive
                                ? "bg-[#FFC766] text-[#0B0B0D] shadow-sm font-bold"
                                : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:border-[#FFC766]/40 border border-transparent"
                            }`}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Conteúdo Dinâmico do Sidebar: Alterna entre Filtros (Gênero/Tema/Tipo) e Letra/Símbolo (A-Z) */}
                  {exploreSummary === "nome" ? (
                    /* MODO "POR NOME": Foco Total na Navegação Alfanumérica */
                    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
                      <div className="flex items-center justify-between pb-1.5 border-b border-[#3A3A43]/50 flex-none">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#FFC766]">
                          <Hash className="w-3.5 h-3.5" />
                          <span>Índice Alfanumérico</span>
                        </div>
                        {activeCharFilter !== "Todos" && (
                          <button
                            onClick={() => {
                              setActiveCharFilter("Todos");
                              setExplorePage(0);
                            }}
                            className="text-[11px] text-[#FFC766] hover:underline"
                          >
                            Ver Todos
                          </button>
                        )}
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-1">
                        <div className="grid grid-cols-4 gap-1.5">
                          {ALPHABET_CHARS.map((char) => {
                            const isActive = activeCharFilter === char;
                            return (
                              <button
                                key={char}
                                onClick={() => {
                                  setActiveCharFilter(char);
                                  setExplorePage(0);
                                }}
                                className={`h-9 flex items-center justify-center rounded-xl text-xs font-mono font-bold transition-all ${
                                  isActive
                                    ? "bg-[#FFC766] text-[#0B0B0D] shadow-md scale-105"
                                    : "bg-[#23232A] text-[#EADCC8] hover:bg-[#3A3A43] hover:text-white border border-[#3A3A43]/40"
                                }`}
                              >
                                {char}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex-none p-2 bg-[#23232A]/70 rounded-xl border border-[#3A3A43]/40 text-center">
                        <p className="text-[10px] text-[#EADCC8]/60">
                          Filtro ativo: <strong className="text-[#FFC766]">{activeCharFilter}</strong>
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* MODO "TEMPORADA" E "TODOS": Abas de Filtros Multi-Categoria (Gênero / Tema / Tipo) */
                    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
                      {/* Abas no Sidebar */}
                      <div className="flex items-center justify-between gap-1 p-0.5 bg-[#23232A] rounded-lg border border-[#3A3A43]/50 flex-none">
                        <button
                          onClick={() => setActiveFilterCategoryTab("generos")}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                            activeFilterCategoryTab === "generos"
                              ? "bg-[#3A3A43] text-[#FFC766] shadow-sm"
                              : "text-[#EADCC8]/70 hover:text-white"
                          }`}
                        >
                          Gênero ({selectedGenres.length})
                        </button>
                        <button
                          onClick={() => setActiveFilterCategoryTab("subgeneros")}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                            activeFilterCategoryTab === "subgeneros"
                              ? "bg-[#3A3A43] text-[#FFC766] shadow-sm"
                              : "text-[#EADCC8]/70 hover:text-white"
                          }`}
                        >
                          Tema ({selectedThemes.length})
                        </button>
                        <button
                          onClick={() => setActiveFilterCategoryTab("formatos")}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                            activeFilterCategoryTab === "formatos"
                              ? "bg-[#3A3A43] text-[#FFC766] shadow-sm"
                              : "text-[#EADCC8]/70 hover:text-white"
                          }`}
                        >
                          Tipo ({selectedFormats.length})
                        </button>
                      </div>

                      {/* Lista de Chips Alternáveis com Scroll Interno Limpo */}
                      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-1 flex flex-col gap-1">
                        {activeFilterCategoryTab === "generos" && (
                          <div className="flex flex-wrap gap-1">
                            {GENRES.map((g) => {
                              const isSelected = selectedGenres.includes(g.name);
                              return (
                                <button
                                  key={g.name}
                                  onClick={() => {
                                    setSelectedGenres((prev) =>
                                      isSelected ? prev.filter((item) => item !== g.name) : [...prev, g.name]
                                    );
                                    setExplorePage(0);
                                  }}
                                  className={`flex items-center justify-between gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                                    isSelected
                                      ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                                      : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:bg-[#3A3A43] border border-[#3A3A43]/40"
                                  }`}
                                >
                                  <span>{g.name}</span>
                                  {isSelected && <X className="w-2.5 h-2.5 stroke-[3]" />}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {activeFilterCategoryTab === "subgeneros" && (
                          <div className="flex flex-wrap gap-1">
                            {THEMES_SUBGENRES.map((t) => {
                              const isSelected = selectedThemes.includes(t.name);
                              return (
                                <button
                                  key={t.name}
                                  onClick={() => {
                                    setSelectedThemes((prev) =>
                                      isSelected ? prev.filter((item) => item !== t.name) : [...prev, t.name]
                                    );
                                    setExplorePage(0);
                                  }}
                                  className={`flex items-center justify-between gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                                    isSelected
                                      ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                                      : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:bg-[#3A3A43] border border-[#3A3A43]/40"
                                  }`}
                                >
                                  <span>{t.name}</span>
                                  {isSelected && <X className="w-2.5 h-2.5 stroke-[3]" />}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {activeFilterCategoryTab === "formatos" && (
                          <div className="flex flex-col gap-1">
                            {FORMATS.map((f) => {
                              const isSelected = selectedFormats.includes(f.id);
                              return (
                                <button
                                  key={f.id}
                                  onClick={() => {
                                    setSelectedFormats((prev) =>
                                      isSelected ? prev.filter((item) => item !== f.id) : [...prev, f.id]
                                    );
                                    setExplorePage(0);
                                  }}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    isSelected
                                      ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                                      : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:bg-[#3A3A43] border border-[#3A3A43]/40"
                                  }`}
                                >
                                  <span>{f.name}</span>
                                  <span className="text-[10px] font-mono opacity-60">[{f.id}]</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </aside>

                {/* Área Principal de Obras à Direita (Grid Panorâmico + Paginação Determinística) */}
                <div className="flex-1 h-full bg-[#1A1A1F]/50 backdrop-blur-md rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-[#3A3A43] flex flex-col justify-between min-h-0 overflow-hidden">
                  {/* Cabeçalho do Catálogo com Sumário Ativo e Controles de Página */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#3A3A43]/60 flex-none">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-[#FFC766]" />
                      <h2 className="font-serif text-sm sm:text-base font-bold text-[#FFF9F0] truncate">
                        {exploreSummary === "temporada"
                          ? "Obras em Exibição na Temporada"
                          : exploreSummary === "todos"
                          ? "Catálogo Geral (Lançados)"
                          : "Catálogo Alfabético Canônico"}
                        <span className="ml-2 text-xs font-normal text-[#EADCC8]/60">
                          ({exploreSummary === "todos" && selectedFormats.length === 0 && selectedGenres.length === 0 && selectedThemes.length === 0 && activeCharFilter === "Todos"
                            ? catalogCounts.totalReleases === null ? "Contagem indisponível" : `${catalogCounts.totalReleases.toLocaleString("pt-BR")} obras canônicas`
                            : `${exploreList.length} obras`})
                        </span>
                      </h2>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="text-[#EADCC8]/60">
                        Pág. {explorePage + 1} de {maxExplorePages || 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          aria-label="Página anterior do catálogo"
                          onClick={() => setExplorePage((prev) => Math.max(0, prev - 1))}
                          disabled={explorePage === 0}
                          className="w-7 h-7 rounded-full bg-[#23232A] border border-[#3A3A43] hover:border-[#FFC766] flex items-center justify-center text-[#EADCC8] hover:text-[#FFC766] disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          aria-label="Próxima página do catálogo"
                          onClick={() => setExplorePage((prev) => Math.min((maxExplorePages || 1) - 1, prev + 1))}
                          disabled={explorePage >= (maxExplorePages || 1) - 1}
                          className="w-7 h-7 rounded-full bg-[#23232A] border border-[#3A3A43] hover:border-[#FFC766] flex items-center justify-center text-[#EADCC8] hover:text-[#FFC766] disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Cards em Grid Determinístico sem sumiço de tela */}
                  {currentExploreItems.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 flex-1 min-h-0 pt-2 pb-1 overflow-hidden">
                      {currentExploreItems.map((anime) => {
                        const posterUrl =
                          anime.images.webp?.large_image_url ||
                          anime.images.jpg?.large_image_url;
                        const title = anime.title_portuguese || anime.title_english || anime.title;

                        return (
                          <div
                            key={anime.mal_id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Abrir ${title}`}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedAnime(anime);
                              }
                            }}
                            onClick={() => setSelectedAnime(anime)}
                            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFC766] h-full rounded-2xl overflow-hidden bg-[#23232A] border border-[#3A3A43] hover:border-[#FFC766] cursor-pointer transition flex flex-col justify-between group shadow-lg min-h-0"
                          >
                            <div className="relative flex-1 w-full overflow-hidden bg-[#0B0B0D] min-h-0">
                              <img
                                src={posterUrl}
                                alt={title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              {anime.score && (
                                <div className="absolute top-2 right-2 bg-[#0B0B0D]/80 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-bold text-[#FFC766] border border-[#FFC766]/30 flex items-center gap-1 shadow">
                                  <Star className="w-2.5 h-2.5 fill-current" />
                                  <span>{anime.score}</span>
                                </div>
                              )}
                              {anime.format && (
                                <div className="absolute top-2 left-2 bg-[#1A1A1F]/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-[#FFF9F0] border border-[#3A3A43]">
                                  {anime.format}
                                </div>
                              )}
                            </div>
                            <div className="p-2 sm:p-2.5 bg-[#1A1A1F] flex-none">
                              <h4 className="text-xs font-bold text-[#FFF9F0] group-hover:text-[#FFC766] truncate transition-colors">
                                {title}
                              </h4>
                              <div className="flex items-center justify-between text-[10px] text-[#EADCC8]/60 mt-0.5">
                                <span className="truncate">
                                  {anime.episodes ? `${anime.episodes} Eps` : "Em exibição"}
                                </span>
                                {anime.year && <span>{anime.year}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#EADCC8]/60">
                      <Compass className="w-10 h-10 text-[#3A3A43] mb-2" />
                      <p className="text-sm font-semibold text-[#FFF9F0]">Nenhuma obra encontrada com os filtros selecionados.</p>
                      <button
                        onClick={() => {
                          setSelectedFormats([]);
                          setSelectedGenres([]);
                          setSelectedThemes([]);
                          setActiveCharFilter("Todos");
                        }}
                        className="mt-3 px-4 py-1.5 rounded-full bg-[#23232A] text-xs text-[#FFC766] hover:bg-[#3A3A43] transition font-medium"
                      >
                        Resetar Filtros
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. ABA CALENDÁRIO: Grade Semanal com Abas de Dias */}
            {activeTab === "calendario" && (
              <div className="h-full w-full bg-[#1A1A1F]/60 backdrop-blur-md rounded-3xl p-5 border border-[#3A3A43] flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-[#3A3A43]">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-5 h-5 text-[#FFC766]" />
                    <h2 className="font-serif text-lg font-bold text-[#FFF9F0]">
                      Calendário Semanal
                    </h2>
                  </div>

                  {/* Day Pills – Dom a Sáb v2-MARKER-9X7K */}
                  <div className="flex items-center gap-1.5 bg-[#23232A] p-1 rounded-full border border-[#3A3A43]">
                    {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((label, idx) => (
                      <button
                        key={idx}
                        onClick={() => setScheduleTab(idx)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                          scheduleTab === idx
                            ? "bg-[#FFC766] text-[#0B0B0D]"
                            : "text-[#EADCC8] hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Schedule Items – filtrados pelo dia selecionado, ordenados por horário */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 py-3 overflow-y-auto items-start content-start">
                  {schedule
                    .filter((item) => new Date(item.airingAt * 1000).getDay() === scheduleTab)
                    .sort((a, b) => a.airingAt - b.airingAt)
                    .map((item, idx) => {
                    const anime = item.anime;
                    if (!anime) return null;
                    const title = anime.title_portuguese || anime.title_english || anime.title;
                    const date = new Date(item.airingAt * 1000);
                    const timeStr = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

                    return (
                      <div
                        key={item.id || idx}
                        onClick={() => setSelectedAnime(anime)}
                        className="h-full max-h-[110px] flex items-center gap-3 p-3 rounded-2xl bg-[#23232A] border border-[#3A3A43] hover:border-[#FFC766] transition cursor-pointer group shadow"
                      >
                        <div className="w-14 h-full rounded-xl overflow-hidden bg-[#0B0B0D] flex-none relative">
                          <img
                            src={anime.images.webp?.large_image_url || anime.images.jpg?.large_image_url}
                            alt={title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition truncate">
                            {title}
                          </h4>
                          <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                            Episódio {item.episode}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                            <span className="font-mono text-[#FFC766] font-bold bg-[#1A1A1F] px-2 py-0.5 rounded border border-[#3A3A43]">
                              {timeStr}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#3A3A43] group-hover:text-[#FFC766] flex-none" />
                      </div>
                    );

                  })}
                </div>
              </div>
            )}

            {/* 4. ABA FRANQUIAS: Baseada no Explorador com Top 5 Franquias Rankeadas por Nota Geral Canônica */}
            {activeTab === "franquias" && (
              <div className="h-full w-full flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
                {/* Coluna Estreita à Esquerda: Sumário (Todas / Filtrado / Por Nome) + Multi-Filtros ou Grade A-Z */}
                <aside className="w-full md:w-64 lg:w-72 flex-none bg-[#1A1A1F]/70 backdrop-blur-md rounded-2xl p-3 border border-[#3A3A43] flex flex-col justify-between gap-2.5 h-full overflow-hidden">
                  {/* Topo do Sidebar: Cabeçalho com Ícone e Limpar Filtros */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#3A3A43]/60 flex-none">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-[#FFC766]" />
                      <h3 className="font-serif text-sm font-bold text-[#FFF9F0] tracking-wide">
                        Filtros de Franquia
                      </h3>
                    </div>

                    {(franchiseFormats.length > 0 || franchiseGenres.length > 0 || franchiseThemes.length > 0 || franchiseCharFilter !== "Todos" || franchiseSummary !== "todas") && (
                      <button
                        onClick={() => {
                          setFranchiseSummary("todas");
                          setFranchiseFormats([]);
                          setFranchiseGenres([]);
                          setFranchiseThemes([]);
                          setFranchiseCharFilter("Todos");
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E5484D]/15 text-[#E5484D] border border-[#E5484D]/30 text-[10px] font-semibold hover:bg-[#E5484D]/25 transition"
                      >
                        <X className="w-2.5 h-2.5" />
                        <span>Limpar</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Sumário Principal de Franquias (Todas / Filtrado / Por Nome) */}
                  <div className="flex-none">
                    <div className="text-[10px] font-bold text-[#EADCC8]/60 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Compass className="w-3 h-3 text-[#FFC766]" /> Sumário
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {FRANCHISE_SUMMARIES.map((s) => {
                        const isActive = franchiseSummary === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              setFranchiseSummary(s.id);
                            }}
                            title={s.desc}
                            className={`py-1 px-1.5 rounded-lg text-[11px] font-semibold text-center transition-all truncate ${
                              isActive
                                ? "bg-[#FFC766] text-[#0B0B0D] shadow-sm font-bold"
                                : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:border-[#FFC766]/40 border border-transparent"
                            }`}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Conteúdo Dinâmico do Sidebar: Alterna entre Filtros (Gênero/Tema/Tipo) e Letra/Símbolo (A-Z) */}
                  {franchiseSummary === "nome" ? (
                    /* MODO "POR NOME": Foco Total na Navegação Alfanumérica */
                    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
                      <div className="flex items-center justify-between pb-1.5 border-b border-[#3A3A43]/50 flex-none">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#FFC766]">
                          <Hash className="w-3.5 h-3.5" />
                          <span>Índice Alfanumérico</span>
                        </div>
                        {franchiseCharFilter !== "Todos" && (
                          <button
                            onClick={() => {
                              setFranchiseCharFilter("Todos");
                            }}
                            className="text-[11px] text-[#FFC766] hover:underline"
                          >
                            Ver Todos
                          </button>
                        )}
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-1">
                        <div className="grid grid-cols-4 gap-1.5">
                          {ALPHABET_CHARS.map((char) => {
                            const isActive = franchiseCharFilter === char;
                            return (
                              <button
                                key={char}
                                onClick={() => {
                                  setFranchiseCharFilter(char);
                                }}
                                className={`h-9 flex items-center justify-center rounded-xl text-xs font-mono font-bold transition-all ${
                                  isActive
                                    ? "bg-[#FFC766] text-[#0B0B0D] shadow-md scale-105"
                                    : "bg-[#23232A] text-[#EADCC8] hover:bg-[#3A3A43] hover:text-white border border-[#3A3A43]/40"
                                }`}
                              >
                                {char}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex-none p-2 bg-[#23232A]/70 rounded-xl border border-[#3A3A43]/40 text-center">
                        <p className="text-[10px] text-[#EADCC8]/60">
                          Filtro ativo: <strong className="text-[#FFC766]">{franchiseCharFilter}</strong>
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* MODO "TODAS" OU "FILTRADO": Abas de Filtros Multi-Categoria (Gênero / Tema / Tipo) */
                    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
                      {/* Abas no Sidebar */}
                      <div className="flex items-center justify-between gap-1 p-0.5 bg-[#23232A] rounded-lg border border-[#3A3A43]/50 flex-none">
                        <button
                          onClick={() => setFranchiseFilterCategoryTab("generos")}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                            franchiseFilterCategoryTab === "generos"
                              ? "bg-[#3A3A43] text-[#FFC766] shadow-sm"
                              : "text-[#EADCC8]/70 hover:text-white"
                          }`}
                        >
                          Gênero ({franchiseGenres.length})
                        </button>
                        <button
                          onClick={() => setFranchiseFilterCategoryTab("subgeneros")}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                            franchiseFilterCategoryTab === "subgeneros"
                              ? "bg-[#3A3A43] text-[#FFC766] shadow-sm"
                              : "text-[#EADCC8]/70 hover:text-white"
                          }`}
                        >
                          Tema ({franchiseThemes.length})
                        </button>
                        <button
                          onClick={() => setFranchiseFilterCategoryTab("formatos")}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                            franchiseFilterCategoryTab === "formatos"
                              ? "bg-[#3A3A43] text-[#FFC766] shadow-sm"
                              : "text-[#EADCC8]/70 hover:text-white"
                          }`}
                        >
                          Tipo ({franchiseFormats.length})
                        </button>
                      </div>

                      {/* Lista de Chips Alternáveis com Scroll Interno Limpo */}
                      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-1 flex flex-col gap-1">
                        {franchiseFilterCategoryTab === "generos" && (
                          <div className="flex flex-wrap gap-1">
                            {GENRES.map((g) => {
                              const isSelected = franchiseGenres.includes(g.name);
                              return (
                                <button
                                  key={g.name}
                                  onClick={() => {
                                    setFranchiseSummary("filtrado");
                                    setFranchiseGenres((prev) =>
                                      isSelected ? prev.filter((item) => item !== g.name) : [...prev, g.name]
                                    );
                                  }}
                                  className={`flex items-center justify-between gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                                    isSelected
                                      ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                                      : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:bg-[#3A3A43] border border-[#3A3A43]/40"
                                  }`}
                                >
                                  <span>{g.name}</span>
                                  {isSelected && <X className="w-2.5 h-2.5 stroke-[3]" />}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {franchiseFilterCategoryTab === "subgeneros" && (
                          <div className="flex flex-wrap gap-1">
                            {THEMES_SUBGENRES.map((t) => {
                              const isSelected = franchiseThemes.includes(t.name);
                              return (
                                <button
                                  key={t.name}
                                  onClick={() => {
                                    setFranchiseSummary("filtrado");
                                    setFranchiseThemes((prev) =>
                                      isSelected ? prev.filter((item) => item !== t.name) : [...prev, t.name]
                                    );
                                  }}
                                  className={`flex items-center justify-between gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                                    isSelected
                                      ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                                      : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:bg-[#3A3A43] border border-[#3A3A43]/40"
                                  }`}
                                >
                                  <span>{t.name}</span>
                                  {isSelected && <X className="w-2.5 h-2.5 stroke-[3]" />}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {franchiseFilterCategoryTab === "formatos" && (
                          <div className="flex flex-col gap-1">
                            {FORMATS.map((f) => {
                              const isSelected = franchiseFormats.includes(f.id);
                              return (
                                <button
                                  key={f.id}
                                  onClick={() => {
                                    setFranchiseSummary("filtrado");
                                    setFranchiseFormats((prev) =>
                                      isSelected ? prev.filter((item) => item !== f.id) : [...prev, f.id]
                                    );
                                  }}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    isSelected
                                      ? "bg-[#FFC766] text-[#0B0B0D] font-bold shadow-sm"
                                      : "bg-[#23232A] text-[#EADCC8] hover:text-white hover:bg-[#3A3A43] border border-[#3A3A43]/40"
                                  }`}
                                >
                                  <span>{f.name}</span>
                                  <span className="text-[10px] font-mono opacity-60">[{f.id}]</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </aside>

                {/* Área Principal das Franquias: Top 5 Rankeado por Nota Geral Canônica */}
                <div className="flex-1 h-full bg-[#1A1A1F]/50 backdrop-blur-md rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-[#3A3A43] flex flex-col justify-between min-h-0 overflow-hidden">
                  {/* Cabeçalho do Ranking */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#3A3A43]/60 flex-none">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[#FFC766]" />
                      <h2 className="font-serif text-sm sm:text-base font-bold text-[#FFF9F0] truncate flex items-center gap-2">
                        <span>Top 5 Franquias Canônicas</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FFC766]/15 text-[#FFC766] border border-[#FFC766]/30 font-bold">
                          Nota Geral
                        </span>
                      </h2>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-[#EADCC8]/60">
                      <span>
                        {franchiseSummary === "todas"
                          ? "Geral Canônico"
                          : franchiseSummary === "nome"
                          ? `Letra: ${franchiseCharFilter}`
                          : "Filtrado"}
                      </span>
                    </div>
                  </div>

                  {/* Lista Top 5 Rankeada em Cards Panorâmicos de Franquia Inteira */}
                  {topFranchises.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2 sm:gap-2.5 flex-1 min-h-0 py-2 overflow-y-auto no-scrollbar">
                      {topFranchises.map((franchise, idx) => {
                        const rankNum = idx + 1;
                        const rep = franchise.representativeAnime;
                        const posterUrl =
                          rep.images.webp?.large_image_url ||
                          rep.images.jpg?.large_image_url;
                        const franchiseTitle =
                          franchise.rootTitle || franchise.title_portuguese || franchise.title_english || rep.title;

                        return (
                          <div
                            key={franchise.id}
                            onClick={() => setSelectedFranchiseDetail(franchise)}
                            className="w-full rounded-2xl bg-[#23232A]/80 border border-[#3A3A43] hover:border-[#FFC766] transition-all cursor-pointer p-2.5 sm:p-3 flex items-center justify-between gap-3 group shadow-md hover:bg-[#23232A]"
                          >
                            {/* Rank Badge + Cover + Info da Franquia */}
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                              {/* Medalha / Posição no Rank */}
                              <div className="flex-none flex items-center justify-center">
                                <span
                                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold font-mono shadow ${
                                    rankNum === 1
                                      ? "bg-[#FFC766] text-[#0B0B0D] ring-2 ring-[#FFC766]/40"
                                      : rankNum === 2
                                      ? "bg-[#EADCC8] text-[#0B0B0D]"
                                      : rankNum === 3
                                      ? "bg-[#CD7F32] text-white"
                                      : "bg-[#1A1A1F] text-[#FFF9F0] border border-[#3A3A43]"
                                  }`}
                                >
                                  #{rankNum}
                                </span>
                              </div>

                              {/* Capa Principal da Franquia */}
                              <div className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl overflow-hidden bg-[#0B0B0D] flex-none relative shadow border border-[#3A3A43]/50">
                                <img
                                  src={posterUrl}
                                  alt={franchiseTitle}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute bottom-0 inset-x-0 bg-black/70 py-0.5 text-[8px] font-mono text-center text-[#FFC766] font-bold">
                                  FRANQUIA
                                </div>
                              </div>

                              {/* Metadados Canônicos da Franquia */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-xs sm:text-sm font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition-colors truncate">
                                    {franchiseTitle}
                                  </h4>
                                  <span className="text-[10px] font-mono text-[#EADCC8]/60 bg-[#1A1A1F] px-1.5 py-0.5 rounded border border-[#3A3A43]/60">
                                    {franchise.yearsRange}
                                  </span>
                                </div>

                                <p className="text-[11px] text-[#EADCC8]/70 mt-1 line-clamp-1">
                                  {rep.synopsis || "Universo canônico completo com todas as suas temporadas, filmes e derivados consolidados."}
                                </p>

                                {/* Tags e Formatos presentes na Franquia */}
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {franchise.formats.slice(0, 3).map((fmt) => (
                                    <span
                                      key={fmt}
                                      className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#1A1A1F] text-[#EADCC8] border border-[#3A3A43]"
                                    >
                                      {fmt}
                                    </span>
                                  ))}
                                  {franchise.genres.slice(0, 2).map((g) => (
                                    <span
                                      key={g.name}
                                      className="text-[9px] px-1.5 py-0.2 rounded bg-[#3A3A43]/50 text-[#FFC766]"
                                    >
                                      {g.name}
                                    </span>
                                  ))}
                                  <span className="text-[10px] text-[#EADCC8]/50 font-mono">
                                    {franchise.seasonsCount} {franchise.seasonsCount === 1 ? "temporada" : "temporadas integradas"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Nota Geral da Franquia + Ação de Explorar Universo */}
                            <div className="flex items-center gap-3 sm:gap-4 flex-none pl-2">
                              {/* Nota Geral Calculada do Anirium */}
                              <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1 bg-[#0B0B0D] px-2.5 py-1 rounded-full border border-[#FFC766]/30 shadow">
                                  <Star className="w-3.5 h-3.5 fill-[#FFC766] text-[#FFC766]" />
                                  <span className="text-xs sm:text-sm font-bold text-[#FFC766] font-mono">
                                    {franchise.averageScore ? franchise.averageScore.toFixed(1) : "—"}
                                  </span>
                                </div>
                                <span className="text-[9px] text-[#EADCC8]/50 font-mono mt-0.5">
                                  Nota Geral
                                </span>
                              </div>

                              <div className="w-8 h-8 rounded-full bg-[#1A1A1F] border border-[#3A3A43] group-hover:border-[#FFC766] flex items-center justify-center text-[#EADCC8] group-hover:text-[#FFC766] transition">
                                <ChevronRight className="w-4 h-4" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#EADCC8]/60">
                      <Network className="w-10 h-10 text-[#3A3A43] mb-2" />
                      <p className="text-sm font-semibold text-[#FFF9F0]">
                        Nenhuma franquia encontrada com os filtros selecionados.
                      </p>
                      <button
                        onClick={() => {
                          setFranchiseSummary("todas");
                          setFranchiseFormats([]);
                          setFranchiseGenres([]);
                          setFranchiseThemes([]);
                          setFranchiseCharFilter("Todos");
                        }}
                        className="mt-3 px-4 py-1.5 rounded-full bg-[#23232A] text-xs text-[#FFC766] hover:bg-[#3A3A43] transition font-medium"
                      >
                        Resetar Filtros de Franquia
                      </button>
                    </div>
                  )}

                  {/* Rodapé Informativo Canônico */}
                  <div className="pt-2 border-t border-[#3A3A43]/60 flex items-center justify-between text-[11px] text-[#EADCC8]/60 font-mono flex-none">
                    <span>
                      Mostrando o <strong>Top 5</strong> das franquias mais bem avaliadas no banco Anirium.
                    </span>
                    <button
                      onClick={() => setActiveTab("explorar")}
                      className="text-[#FFC766] hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>Ver Catálogo Geral</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}

          </>
        )}
      </main>

      {/* 1. Modal Nobre de Detalhes da Obra */}
      {selectedAnime && (
        <AnimeModal
          anime={selectedAnime}
          onClose={() => setSelectedAnime(null)}
          onPlayEpisode={handlePlayEpisode}
          onResumeEpisode={handleCanonicalResume}
          onOpenFranchise={(franchiseRoot) => {
            const found = allFranchises.find(
              (f) =>
                f.rootTitle.toLowerCase() === franchiseRoot.toLowerCase() ||
                f.id.toLowerCase() === franchiseRoot.toLowerCase()
            );
            if (found) {
              setSelectedAnime(null);
              setSelectedFranchiseDetail(found);
            }
          }}
        />
      )}

      {/* 2. Modal Soberano de Universo / Franquia */}
      {selectedFranchiseDetail && (
        <FranchiseModal
          franchise={selectedFranchiseDetail}
          onClose={() => setSelectedFranchiseDetail(null)}
          onSelectAnime={(anime) => {
            setSelectedFranchiseDetail(null);
            setSelectedAnime(anime);
          }}
          onPlayEpisode={(anime, epNum, seasonIdx) => {
            setSelectedFranchiseDetail(null);
            handlePlayEpisode(anime, epNum, seasonIdx);
          }}
        />
      )}

      {/* 3. Slot de Reprodução delegado exclusivamente ao Plugin Ativo da Conta */}
      {activePlayback && (
        <PluginPlayerHost
          anime={activePlayback.anime}
          episode={activePlayback.episode}
          seasonIdx={activePlayback.seasonIdx}
          onBack={() => setActivePlayback(null)}
          onOpenOverview={() => {
            const currentAnime = activePlayback.anime;
            setActivePlayback(null);
            setSelectedAnime(currentAnime);
          }}
          onOpenFranchise={(franchiseRoot) => {
            setActivePlayback(null);
            const found = allFranchises.find(
              (f) =>
                f.rootTitle.toLowerCase() === franchiseRoot.toLowerCase() ||
                f.id.toLowerCase() === franchiseRoot.toLowerCase()
            );
            if (found) {
              setSelectedFranchiseDetail(found);
            }
          }}
          onChangeEpisode={(epNum, seasonIdx) => {
            setActivePlayback({
              anime: activePlayback.anime,
              episode: epNum,
              seasonIdx,
            });
          }}
        />
      )}

      {/* 4. Sistema Completo de Perfil do Usuário */}
      <UserProfileModal
        isOpen={showUserProfileModal}
        onClose={() => setShowUserProfileModal(false)}
        onSelectAnime={async (animeId) => {
          // Buscar anime por id
          try {
            const res = await fetch(`/api/search?q=${animeId}`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
              setSelectedAnime(data.results[0]);
            }
          } catch {}
        }}
        onPlayEpisode={(animeId, _seasonIdx, _epNum, seasonEntityId, episodeEntityId) => {
          return handleCanonicalResume(animeId,seasonEntityId,episodeEntityId);
        }}
      />
    </div>
  );
}
