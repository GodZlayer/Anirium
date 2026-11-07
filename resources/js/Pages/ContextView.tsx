import { usePresentation as __usePresentation } from "../lib/usePresentation";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Head } from "@inertiajs/react";
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Play,
  Tv,
  Film,
  Calendar,
  Star,
  Users,
  Compass,
  GitBranch,
  BookmarkCheck,
  Bookmark,
  Milestone,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { LolProfileBadge } from "../Components/LolProfileBadge";
import { ThemeLanguageSelector } from "../Components/ThemeLanguageSelector";
import { ModularPlayerBox } from "../Components/ModularPlayerBox";
import { DribbbleContentSwitchers } from "../Components/DribbbleContentSwitchers";
import { DribbbleVerticalActionDock } from "../Components/DribbbleVerticalActionDock";
import { EpisodeDiscussionFeed } from "../Components/EpisodeDiscussionFeed";
import { ArcSourceCredit } from "../Components/ArcSourceCredit";
import { WorkArcCard } from "../Components/WorkArcCard";
import { ContextNavigationCard } from "../Components/ContextNavigationCard";
import { WorkSeasonSelector } from "../Components/WorkSeasonSelector";
import { catalogLandingUrl } from "../lib/catalogLocation.mjs";
import { readNavigationContext, type ContextParameters } from "../lib/contextNavigation";
import { selectArcNavigation } from "../lib/arcNavigation.mjs";
import { createWorkRefreshSession, resolveContextWork } from "../lib/contextWorkRefresh.mjs";
import { AnimeRecord } from "../Components/AnimeCard";
import { getUniversalCatalog, isHentaiOrAdultAnime, resolveUnifiedWork, type UnifiedCatalogWork } from "../lib/parquetCatalog";
import { PublicationDetails } from "../Components/PublicationDetails";
import { loadUniverseWorks } from "../lib/loadUniverseWorks";
import {
  popNavigationStep,
  pushNavigationStep,
  loadNavigationStack,
  clearNavigationStack,
  NavigationStep,
} from "../lib/universalNavigationStack";
import {
  loadTelemetryState,
  initTelemetryLoop,
  hydrateUserGamificationFromServer,
  syncEntityPreference,
  registerCommentXp,
  recordWatchProgress,
  recordBookmarkAction,
  queueTelemetryEvent,
  TelemetryState,
} from "../lib/telemetryXpLoop";
import { getOrCreateMachineFingerprint } from "../lib/deviceFingerprint";
import { getCanonicalArcsForWork, CanonicalArc } from "../lib/canonicalArcs";
import { classifyUniverseWorkWithMAL } from "../lib/universeRelations";
import { classifyEpisode } from "../lib/episodeClassification.mjs";
import { workCapabilities } from "../lib/workCapabilities.mjs";
import { CATALOG_STRINGS } from "../lib/catalogStrings";
import { findCatalogWork, workReference, catalogKey } from "../lib/catalogIdentity.mjs";
import { universeWorksFor } from "../lib/universeMembership.mjs";
import { statusLabelKey } from "../lib/catalogMetadata.mjs";
import { episodeTitle, episodeInstant, episodeNumbersFor, adjacentEpisode } from "../lib/episodeMetadata.mjs";
import { useWorkEpisodeMetadata } from "../lib/useWorkEpisodeMetadata";
import { useCatalogWorkGraph } from "../lib/useCatalogWorkGraph";
import { graphActionTarget, graphCanonicalArcs, contextEpisodeNumbers } from "../lib/catalogEntityGraph.mjs";
import { requestEntityContext, prepareEntityNavigation } from "../lib/catalogEntityContext.mjs";
import { WORK_UUID } from "../lib/catalogAliases.mjs";

interface ContextViewProps {
  initialType: string; // "universe" | "work" | "season" | "arc" | "episode"
  initialId: string;
  initialState?: Partial<ContextParameters>;
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
  onClose?: () => void;
}

export default function ContextView({ initialType, initialId, initialState, auth, onClose }: ContextViewProps) {
  const __presentation = __usePresentation();
  const { tokens, strings, language, getLocalizedTitle, getLocalizedSynopsis, adultContentEnabled } = useDesignTheme();
  const classificationLabels = CATALOG_STRINGS[language] || CATALOG_STRINGS["pt-BR"];

  // Nível da Navegação Fractal Canônica
  const [activeType, setActiveType] = useState<string>(initialType || "work");
  const [activeId, setActiveId] = useState<string>(initialId);
  const [startingContext] = useState(() => readNavigationContext({ type: initialType, id: initialId, params: initialState }));
  const [contextEntity, setContextEntity] = useState<any>(null);
  const navigationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => navigationRequest.current?.abort(), []);
  const [workHint, setWorkHint] = useState<string | undefined>(startingContext?.params.workId);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(startingContext?.params.episode || 1);
  const [selectedArcIndex, setSelectedArcIndex] = useState<number>(startingContext?.params.arcIndex || 0);

  // Switchers Fluidos (No Universo o padrão mostra Lançamentos/Obras; na Obra mostra Arcos)
  const [viewMode, setViewMode] = useState<"arcs" | "releases">(startingContext?.params.viewMode || "arcs");
  const [hideFillers, setHideFillers] = useState<boolean>(startingContext?.params.hideFillers || false);
  const [rightView, setRightView] = useState<"content" | "discussion">("content");

  // Estado da Obra Atual e Catálogo Completo
  const [catalog, setCatalog] = useState<UnifiedCatalogWork[]>([]);
  const [catalogResolved, setCatalogResolved] = useState(false);
  const [catalogLookupFailed, setCatalogLookupFailed] = useState(false);
  const [currentAnime, setCurrentAnime] = useState<UnifiedCatalogWork | null>(null);
  const { graph: identityGraph } = useCatalogWorkGraph(currentAnime?.work_id, auth?.user?.id, Boolean(adultContentEnabled));
  const selectedSeasonId = activeType === "season" ? activeId : activeType === "episode"
    ? contextEntity?.entity.id === activeId ? contextEntity.selection.season_id
      : identityGraph?.episodes.find((episode: any) => episode.numbering_scheme === "original" && episode.number === selectedEpisode)?.season_id : null;
  const selectedSeason = identityGraph?.seasons.find((season: any) => season.id === selectedSeasonId);
  const selectedSeasonNumber = selectedSeason?.number ?? (contextEntity?.entity.id === activeId && activeType === "season" ? contextEntity.selection.season_number : undefined);
  const selectedArcReference = contextEntity?.entity.id === activeId && activeType === "arc"
    ? identityGraph ? activeId : contextEntity.selection.arc_reference ?? activeId : undefined;
  const canonicalArcs = useMemo(() => {
    const arcs = identityGraph ? graphCanonicalArcs(identityGraph) : currentAnime ? getCanonicalArcsForWork(currentAnime) : [];
    return hideFillers ? arcs.filter(arc => !arc.isFiller || arc.arcId === selectedArcReference) : arcs;
  }, [identityGraph, currentAnime, hideFillers, selectedArcReference]);
  const { index: effectiveArcIndex, activeArc, currentEpisodeArc } = useMemo(
    () => selectArcNavigation(canonicalArcs, activeType, selectedEpisode, selectedArcIndex, selectedArcReference),
    [canonicalArcs, activeType, selectedEpisode, selectedArcIndex, selectedArcReference]);
  useEffect(() => {
    if (activeType !== "universe" || !currentAnime) return;
    const controller = new AbortController();
    loadUniverseWorks(currentAnime, Boolean(auth?.user && adultContentEnabled), controller.signal, activeId).then(works => {
      if (!controller.signal.aborted) setCatalog(previous => {
        const merged=new Map(previous.map(work=>[work.work_id || catalogKey(work),work]));
        for(const work of works) merged.set(work.work_id || catalogKey(work),work);
        return [...merged.values()];
      });
    }).catch(error => { if (!controller.signal.aborted) console.warn("[Universe catalog]", error.message); });
    return () => controller.abort();
  }, [activeType, activeId, currentAnime, adultContentEnabled, auth?.user?.id]);
  const episodeDetails = useWorkEpisodeMetadata(currentAnime);
  const episodeDocument = episodeDetails.document;
  const episodeIndex = useMemo(() => new Map((episodeDocument?.episodes || []).map((episode: any) => [episode.number, episode])), [episodeDocument]);
  const [navStack, setNavStack] = useState<NavigationStep[]>(() => loadNavigationStack());
  const universeScrollRef = useRef<HTMLDivElement>(null);

  const handleScrollUniverse = (direction: "left" | "right") => {
    if (!universeScrollRef.current) return;
    const distance = 320;
    universeScrollRef.current.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  // Ações Sociais e Conclusão Locais
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [userRating, setUserRating] = useState<number>(0);
  const [completedEpisodesMap, setCompletedEpisodesMap] = useState<Record<string, boolean>>({});

  // Telemetria Contínua
  const [telemetry, setTelemetry] = useState<TelemetryState>(() => loadTelemetryState());
  const isAuthenticated = !!auth?.user;
  const effectiveTier = auth?.user?.tier || 0;

  useEffect(() => {
    const handleXpEvent = (e: any) => {
      if (e.detail) setTelemetry(e.detail);
    };
    window.addEventListener("anirium_xp_update", handleXpEvent);
    return () => window.removeEventListener("anirium_xp_update", handleXpEvent);
  }, []);

  // 1. Inicializar Telemetria e Registrar Dispositivo de Máquina
  useEffect(() => {
    const cleanup = initTelemetryLoop(isAuthenticated, effectiveTier);
    if (catalog.length > 0) {
      const hydrated = hydrateUserGamificationFromServer(auth?.user || null, catalog);
      setTelemetry(hydrated);
    }

    const mfp = getOrCreateMachineFingerprint();
    if (isAuthenticated) {
      fetch("/api/session/register-device", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ machine_fingerprint: mfp }),
      })
        .then((r) => {
          if (r.status === 409) {
            alert("Esta conta já está conectada ativamente em outro dispositivo.");
            window.location.href = "/";
          }
        })
        .catch(() => {});
    }

    return () => cleanup();
  }, [isAuthenticated, effectiveTier]);

  // 2. Resolver o contexto atual e retomar atualizacoes temporariamente indisponiveis.
  useEffect(() => {
    let mounted = true, legacyRequested = false;
    const controller = new AbortController();
    let legacyCatalog: UnifiedCatalogWork[] = [];
    setCatalogResolved(false);
    setCatalogLookupFailed(false);
    const sameWorkEpisode = activeType === "episode" && currentAnime?.work_id === identityGraph?.entity.id
      && identityGraph?.episodes.some((episode: any) => episode.id === activeId);
    if (!sameWorkEpisode) setCurrentAnime(null);
    setContextEntity(null);
    setCatalog([]);
    const session = createWorkRefreshSession({
      resolve: () => resolveContextWork({ reference: activeId, kind: activeType, resolve: resolveUnifiedWork, readLegacy: getUniversalCatalog, findLegacy: findCatalogWork,
        resolveEntity: (kind: string, id: string) => WORK_UUID.test(id) ? requestEntityContext(kind, id, { preferredWork: workHint, signal: controller.signal }) : undefined }),
      needsRetry: (snapshot: any) => snapshot.provisional,
      onValue: (snapshot: any) => {
        if (!mounted) return;
        if (snapshot.legacy) legacyCatalog = snapshot.legacy;
        const resolved = snapshot.work, found = findCatalogWork(legacyCatalog, activeId);
        setContextEntity(snapshot.context || null);
        if (snapshot.context?.selection.episode_number) setSelectedEpisode(snapshot.context.selection.episode_number);
        const data = resolved ? [...legacyCatalog.filter(work => work !== found && catalogKey(work) !== catalogKey(resolved)), resolved] : legacyCatalog;
        setCatalog(data); setCurrentAnime(resolved); setCatalogResolved(true); setCatalogLookupFailed(snapshot.provisional);
        if (legacyCatalog.length > 1 || !auth?.user) setTelemetry(hydrateUserGamificationFromServer(auth?.user || null, data));
        if (auth?.user && resolved && !legacyRequested) {
          legacyRequested = true;
          void getUniversalCatalog().then(rememberLegacy).catch(() => {});
        }
      },
      onError: (error: Error) => {
        if (!mounted) return;
        setCatalogLookupFailed(true); setCatalogResolved(true);
        console.warn("[Context catalog refresh]", error.message);
      },
    });
    const rememberLegacy = (items: UnifiedCatalogWork[]) => {
      if (!mounted || !items.length || legacyCatalog === items) return;
      legacyCatalog = items; void session.load();
    };
    const handleExpanded = (e: any) => {
      if (Array.isArray(e.detail)) rememberLegacy(e.detail);
    };
    const refreshGeneration = () => { void session.load(); };
    const retryPending = () => { void session.retry(); };
    window.addEventListener("anirium_catalog_expanded", handleExpanded);
    window.addEventListener("anirium_generation_updated", refreshGeneration);
    window.addEventListener("anirium_catalog_check_finished", retryPending);
    void session.load();
    return () => {
      mounted = false; session.dispose(); controller.abort();
      window.removeEventListener("anirium_catalog_expanded", handleExpanded);
      window.removeEventListener("anirium_generation_updated", refreshGeneration);
      window.removeEventListener("anirium_catalog_check_finished", retryPending);
    };
  }, [activeType, activeId, workHint, auth?.user?.id, adultContentEnabled]);

  // 3. Registrar na Pilha Universal de 30 Ações
  useEffect(() => {
    if (currentAnime) {
      const updated = pushNavigationStep({
        path: `/view/${activeType}/${activeId}`,
        type: activeType as any,
        id: activeId,
        label: currentAnime.title,
        params: { episode: selectedEpisode, arcIndex: Math.max(0, effectiveArcIndex), viewMode, hideFillers, ...(workHint ? { workId: workHint } : {}) },
      });
      setNavStack(updated);
    }
  }, [activeType, activeId, currentAnime, selectedEpisode, effectiveArcIndex, viewMode, hideFillers, workHint]);

  // Transição Canônica 100% Interna e Oculta na Barra do Navegador
  const handleNavigate = async (
    type: "universe" | "work" | "season" | "arc" | "episode",
    id: string | number,
    epNum: number = 1,
    arcIdx: number = 0,
    arcReference?: string
  ) => {
    navigationRequest.current?.abort();
    const controller = new AbortController();
    navigationRequest.current = controller;
    let target;
    try {
      target = await prepareEntityNavigation({ graph: identityGraph, catalog, kind: type, reference: id,
        selection: { episode: epNum, arc: arcReference || canonicalArcs[arcIdx]?.arcId, season: contextEntity?.selection.season_number }, signal: controller.signal });
    } catch {
      if (!controller.signal.aborted) setCatalogLookupFailed(true);
      return;
    }
    if (controller.signal.aborted) return;
    setActiveType(type);
    if (type === "universe") setViewMode("releases");
    setActiveId(target.id);
    setWorkHint(target.workId);
    if (arcIdx !== undefined) {
      setSelectedArcIndex(arcIdx);
    }
    if (type === "episode") {
      setSelectedEpisode(epNum);
    }
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.history.replaceState(null, "", catalogLandingUrl(window.location.search));
    }
  };

  // Botão de Retorno Determinístico (Até 30 ações contínuas)
  const handleGoBack = () => {
    navigationRequest.current?.abort();
    const prev = popNavigationStep();
    const restored = readNavigationContext(prev);
    if (restored) {
      setActiveType(restored.type);
      setActiveId(restored.id);
      setSelectedEpisode(restored.params.episode);
      setSelectedArcIndex(restored.params.arcIndex);
      setViewMode(restored.params.viewMode);
      setHideFillers(restored.params.hideFillers);
      setWorkHint(restored.params.workId);
    } else if (onClose) {
      onClose();
    } else {
      window.location.href = "/";
    }
  };

  // Botão Logo Anirium: Volta para Home Zerando a Pilha de Volta
  const handleGoHome = () => {
    clearNavigationStack();
    setNavStack([]);
    if (onClose) {
      onClose();
    } else {
      window.location.href = "/";
    }
  };

  // Chave Única Indexada de Interação do Usuário no Contexto Atual
  const contextUniqueKey = useMemo(() => {
    if (contextEntity?.entity.id === activeId && contextEntity.entity.kind === activeType) return activeId;
    const canonical = graphActionTarget(identityGraph, activeType, { episode: selectedEpisode, arc: activeArc?.arcId });
    if (canonical) return canonical;
    return `${activeType}:${activeId}${activeType === "arc" || activeType === "season" ? `:arc-${selectedArcIndex + 1}` : ""}${activeType === "episode" ? `:ep-${selectedEpisode}` : ""}`;
  }, [identityGraph, contextEntity, activeType, activeId, selectedArcIndex, selectedEpisode, activeArc]);
  useEffect(() => {
    if (!identityGraph || WORK_UUID.test(activeId)) return;
    const canonical = graphActionTarget(identityGraph, activeType, { episode: selectedEpisode, arc: activeArc?.arcId });
    if (canonical) {
      setActiveId(canonical);
      setWorkHint(activeType === "work" ? undefined : currentAnime?.work_id);
    }
  }, [identityGraph, activeType, activeId, selectedEpisode, activeArc, currentAnime]);
  const episodePreferenceKey = (number: number): string => identityGraph
    ? graphActionTarget(identityGraph, "episode", { episode: number }) || ""
    : currentAnime ? `episode:${workReference(currentAnime)}:ep-${number}` : "";

  // Carregar e sincronizar estado social individual persistido por chave única
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedLikes = JSON.parse(localStorage.getItem("anirium_user_likes") || "{}");
      const storedBookmarks = JSON.parse(localStorage.getItem("anirium_user_bookmarks") || "{}");
      const storedRatings = JSON.parse(localStorage.getItem("anirium_user_ratings") || "{}");
      const storedCompleted = JSON.parse(localStorage.getItem("anirium_user_completed") || "{}");

      setIsLiked(!!storedLikes[contextUniqueKey]);
      setIsBookmarked(!!storedBookmarks[contextUniqueKey]);
      setUserRating(storedRatings[contextUniqueKey] || 0);
      setCompletedEpisodesMap(storedCompleted);
    } catch {}
  }, [contextUniqueKey]);

  // Ações Sociais Rápidas Vinculadas à Chave Única Indexada (+2 XP Like, +5 XP Bookmark, +5 XP Nota)
  const handleToggleLike = () => {
    if (!isAuthenticated) return;
    const next = !isLiked;
    setIsLiked(next);

    try {
      const storedLikes = JSON.parse(localStorage.getItem("anirium_user_likes") || "{}");
      if (next) storedLikes[contextUniqueKey] = true;
      else delete storedLikes[contextUniqueKey];
      localStorage.setItem("anirium_user_likes", JSON.stringify(storedLikes));
    } catch {}

    const nextState = syncEntityPreference(
      {
        target_type: activeType,
        target_id: contextUniqueKey,
        liked: next,
      },
      true
    );
    setTelemetry(nextState);

    queueTelemetryEvent({
      target_type: activeType as any,
      target_id: contextUniqueKey,
      event_type: "like",
      payload: { liked: next, unique_key: contextUniqueKey },
    });
  };

  const handleToggleBookmark = () => {
    if (!isAuthenticated) return;
    const next = !isBookmarked;
    setIsBookmarked(next);

    try {
      const storedBookmarks = JSON.parse(localStorage.getItem("anirium_user_bookmarks") || "{}");
      if (next) storedBookmarks[contextUniqueKey] = true;
      else delete storedBookmarks[contextUniqueKey];
      localStorage.setItem("anirium_user_bookmarks", JSON.stringify(storedBookmarks));
    } catch {}

    const nextState = recordBookmarkAction(next, isAuthenticated, effectiveTier, contextUniqueKey, activeType);
    setTelemetry(nextState);
  };

  const handleRate = (rating: number) => {
    if (!isAuthenticated) return;
    setUserRating(rating);

    try {
      const storedRatings = JSON.parse(localStorage.getItem("anirium_user_ratings") || "{}");
      if (rating > 0) storedRatings[contextUniqueKey] = rating;
      else delete storedRatings[contextUniqueKey];
      localStorage.setItem("anirium_user_ratings", JSON.stringify(storedRatings));
    } catch {}

    const nextState = syncEntityPreference(
      {
        target_type: activeType,
        target_id: contextUniqueKey,
        user_score: rating > 0 ? rating : null,
      },
      true
    );
    setTelemetry(nextState);

    queueTelemetryEvent({
      target_type: activeType as any,
      target_id: contextUniqueKey,
      event_type: "rate",
      payload: { rating, unique_key: contextUniqueKey },
    });
  };

  // Alternar conclusão de Episódio (+10 XP ep + bônus reversível de Arco/Temporada/Obra/Universo)
  const handleToggleEpisodeComplete = (epNumber: number) => {
    if (!isAuthenticated || !currentAnime) return;
    const workId = workReference(currentAnime);
    const epKey = episodePreferenceKey(epNumber);
    if (!epKey) return;
    const isCurrentlyCompleted = !!completedEpisodesMap[epKey];
    const nextCompleted = !isCurrentlyCompleted;

    const updatedMap = { ...completedEpisodesMap };
    if (nextCompleted) updatedMap[epKey] = true;
    else delete updatedMap[epKey];
    setCompletedEpisodesMap(updatedMap);

    try {
      localStorage.setItem("anirium_user_completed", JSON.stringify(updatedMap));
    } catch {}

    const nextState = syncEntityPreference(
      {
        target_type: "episode",
        target_id: epKey,
        ...(identityGraph ? { work_id: currentAnime.work_id, episode_number: epNumber } : {}),
        status: nextCompleted ? "completed" : "watching",
        metadata: {
          work_id: workId,
          episode_num: epNumber,
        },
      },
      true
    );
    setTelemetry(nextState);

    queueTelemetryEvent({
      target_type: "episode",
      target_id: epKey,
      event_type: "episode_completed",
      payload: { completed: nextCompleted, work_id: workId, episode_num: epNumber },
    });
  };

  // Classificador Semântico de Produções/Obras dentro de um Universo (Inspirado no MAL)
  const classifyUniverseWork = useCallback((work: any) => {
    return classifyUniverseWorkWithMAL(work);
  }, []);

  // Obras Reais do Mesmo Universo Indexadas da Base Parquet
  const universeWorks = useMemo(() => universeWorksFor(catalog, currentAnime, activeType === "universe" ? activeId : undefined), [currentAnime, catalog, activeType, activeId]);

  // Arcos Narrativos Reais do Universo (Costura cronológica das sagas e fases das obras principais + filmes canônicos)
  const universeArcs = useMemo(() => {
    if (!universeWorks.length) return [];
    
    const chronologicalWorks = [...universeWorks].sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));

    const allArcs: any[] = [];
    const seenArcIds = new Set<string>();
    let globalIndex = 0;

    for (const work of chronologicalWorks) {
      const canonical = getCanonicalArcsForWork(work).filter(arc => !hideFillers || !arc.isFiller);
      for (const [sourceArcIndex, arc] of canonical.entries()) {
        if (hideFillers && arc.isFiller) continue;
        const arcKey = `${catalogKey(work)}:${arc.arcId}`;
        if (seenArcIds.has(arcKey)) continue;
        seenArcIds.add(arcKey);

        const isMovieArc = arc.arcType === "CANON_MOVIE" && arc.classification === "canon";
        const targetMal = arc.sourceWorkMalId || work.mal_id;
        const matchedSourceWork = work;

        allArcs.push({
          id: arcKey,
          sourceArcIndex,
          sourceArcId: arc.arcId,
          mal_id: targetMal,
          work_reference: workReference(work),
          title: arc.name,
          saga: arc.saga || getLocalizedTitle(matchedSourceWork),
          cover_image: matchedSourceWork.cover_image || matchedSourceWork.banner_image || work.cover_image,
          banner_image: matchedSourceWork.banner_image || matchedSourceWork.cover_image || work.banner_image,
          year: matchedSourceWork.year,
          format: work.format,
          classification: arc.classification || "unknown",
          episodes_count: arc.episodesCount,
          synopsis: arc.synopsis,
          status: classificationLabels[arc.classification || "unknown"],
          isArc: true,
          isCanonMovie: isMovieArc,
          phaseNum: ++globalIndex,
          startEp: arc.startEp,
          endEp: arc.endEp,
          sourceWorkTitle: getLocalizedTitle(work),
        });
      }
    }

    return allArcs;
  }, [universeWorks, hideFillers, classificationLabels, getLocalizedTitle]);

  // Lista Real de Episódios Indexados da Obra ou do Arco Selecionado
  const indexedEpisodeNumbers = useMemo(() => identityGraph ? contextEpisodeNumbers(identityGraph, "work", identityGraph.entity.id)
    : episodeNumbersFor(currentAnime, episodeDocument), [identityGraph, currentAnime, episodeDocument]);
  const totalEpisodes = currentAnime?.episodes_count ?? "—";
  const episodesList = useMemo(() => {
    const list: Array<{
      number: number;
      arcEpisodeNum: number;
      isFiller: boolean;
      classification: string;
      title?: string;
      arcName?: string;
      arcSaga?: string;
    }> = [];

    const allowed = new Set(identityGraph && ["arc", "season"].includes(activeType)
      ? contextEpisodeNumbers(identityGraph, activeType, activeId) : activeType === "season" ? [] : indexedEpisodeNumbers);
    // Se estivermos visualizando um arco específico (activeType === "arc")
    if (activeType === "arc" && activeArc) {
      const numbers = indexedEpisodeNumbers.filter((number: number) => allowed.has(number)
        && (identityGraph || (number >= activeArc.startEp && number <= activeArc.endEp)));
      for (const i of numbers) {
        const arcCounter = Number.isSafeInteger(activeArc.startEp) && i >= activeArc.startEp && i <= activeArc.endEp ? i - activeArc.startEp + 1 : i;
        const classification = classifyEpisode(currentAnime, i);
        const isFiller = classification === "filler";
        if (hideFillers && isFiller) {
          continue;
        }
        list.push({
          number: i,
          arcEpisodeNum: arcCounter,
          isFiller: Boolean(isFiller),
          classification,
          title: episodeTitle(episodeIndex.get(i), language, `${strings.labels.episode} ${i}`),
          arcName: activeArc.name,
          arcSaga: activeArc.saga,
        });
      }
      return list;
    }

    // Caso padrão: todos os episódios da obra cruzando com o arco canônico correspondente e com a tabela real de fillers
    for (const i of indexedEpisodeNumbers) {
      if (!allowed.has(i)) continue;
      const classification = classifyEpisode(currentAnime, i);
      const isFiller = classification === "filler";
      if (hideFillers && isFiller) continue;

      // Localizar o arco ao qual este episódio global pertence
      const matchedArc = canonicalArcs.find((a) => i >= a.startEp && i <= a.endEp);
      const arcEp = matchedArc ? (i - matchedArc.startEp + 1) : i;

      list.push({
        number: i,
        arcEpisodeNum: arcEp,
        isFiller: Boolean(isFiller),
        classification,
        title: episodeTitle(episodeIndex.get(i), language, `${strings.labels.episode} ${i}`),
        arcName: matchedArc?.name,
        arcSaga: matchedArc?.saga,
      });
    }
    return list;
  }, [identityGraph, activeId, activeType, activeArc, indexedEpisodeNumbers, hideFillers, currentAnime, canonicalArcs, strings, episodeIndex, language]);

  if (!currentAnime) {
    return (
      <div
        className="w-full h-full min-h-0 flex flex-col gap-4 items-center justify-center font-mono text-xs select-none"
        style={{ backgroundColor: tokens.colors.bgBase, color: tokens.colors.textMuted }}
      >
        {classificationLabels[!catalogResolved ? "loading" : catalogLookupFailed ? "unavailable" : "notFound"]}
        {catalogResolved && <button onClick={handleGoHome} className="border rounded-lg px-4 py-2">{strings.navigation.home}</button>}
      </div>
    );
  }

  // Trava Estrita de Conteúdo Sensível (+24 Anos): exige conta autenticada E o switcher explícito da conta ativado
  if (isHentaiOrAdultAnime(currentAnime) && (!isAuthenticated || !adultContentEnabled)) {
    return (
      <div
        className="w-full h-full min-h-0 flex flex-col items-center justify-center p-6 select-none text-center gap-4"
        style={{ backgroundColor: tokens.colors.bgBase, color: tokens.colors.textPrimary }}
      >
        <div
          className="max-w-md p-6 rounded-3xl border backdrop-blur-xl flex flex-col items-center gap-4 shadow-2xl"
          style={{
            backgroundColor: "rgba(15, 17, 23, 0.85)",
            borderColor: tokens.colors.borderDefault,
          }}
        >
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-widest bg-[color:var(--wc-bgSurface)]/5 text-[color:var(--wc-textSecondary)] border border-[color:var(--wc-borderDefault)]/10">
            Preferência da Conta • +24 Anos
          </span>
          <h2 className="text-lg font-black tracking-wide text-[color:var(--wc-textPrimary)]">
            Conteúdo Oculto por Padrão
          </h2>
          <p className="text-xs text-[color:var(--wc-textMuted)] leading-relaxed">
            {isAuthenticated
              ? "Esta obra exige a ativação explícita do filtro de Conteúdo Sensível (+24 Anos) no menu de Preferências da sua Conta (canto superior direito)."
              : "Esta obra não está disponível no modo visitante sem conta."}
          </p>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleGoHome}
              className="px-4 py-2 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all hover:scale-105"
              style={{
                backgroundColor: tokens.colors.accentGold,
                borderColor: tokens.colors.accentGold,
                color: tokens.colors.bgBase,
              }}
            >
              Voltar ao Início
            </button>
          </div>
        </div>
      </div>
    );
  }

  const localizedTitle = getLocalizedTitle(currentAnime);
  const currentStatusKey = statusLabelKey(currentAnime.status);
  const selectedAirTime = episodeInstant(episodeIndex.get(selectedEpisode)?.air_date_utc);
  const localizedSynopsis = getLocalizedSynopsis(currentAnime);
  const bannerImage = currentAnime.banner_image || currentAnime.cover_image;
  const canGoBack = navStack.length > 1;

  return (
    <div
      className="w-full h-full min-h-0 flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
      style={{ backgroundColor: tokens.colors.bgBase, color: tokens.colors.textPrimary }}
    >
      <Head title={`${localizedTitle} [${activeType.toUpperCase()}] - Anirium`} />

      {/* 1. TOP APP BAR: NAVEGAÇÃO, PILHA DE 30 AÇÕES & BREADCRUMBS CANÔNICOS */}
      <header
        className="h-14 flex-none border-b px-2 lg:px-6 flex items-center justify-between gap-1 lg:gap-3 z-40 backdrop-blur-xl"
        style={{
          backgroundColor: tokens.colors.bgSurface,
          borderColor: tokens.colors.borderDefault,
        }}
      >
        <div className="flex flex-1 items-center gap-1 lg:gap-3 min-w-0">
          {/* Identidade Visual Canônica Anirium (Retorna à Home Zerando a Pilha) */}
          <button type="button" aria-label={strings.navigation.home}
            onClick={handleGoHome}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl cursor-pointer group transition-all duration-300 hover:scale-[1.02] shrink-0"
            style={{
              backgroundColor: "rgba(10, 10, 15, 0.45)",
              border: `1px solid ${tokens.colors.borderHighlight || "rgba(255, 199, 102, 0.25)"}`,
            }}
            title="Início (Zerar navegação e voltar ao Lobby)"
          >
            <img
              src="/assets/logos/Anirium-favicon.png"
              alt="Anirium Mascot"
              className="w-6 h-6 object-contain drop-shadow-[0_2px_8px_rgba(255,199,102,0.4)]"
            />
            <img
              src="/assets/logos/Anirium-Textlogo.png"
              alt="Anirium"
              className="h-5 w-auto object-contain hidden lg:inline-block filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
            />
          </button>

          {/* Botão de Retorno da Pilha de 30 Ações */}
          <button
            onClick={handleGoBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm shrink-0"
            style={{
              backgroundColor: tokens.colors.bgBase,
              borderColor: tokens.colors.borderDefault,
              color: tokens.colors.accentGold,
            }}
            title={canGoBack ? "Voltar ao estado anterior" : "Voltar ao Início"}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{canGoBack ? (navStack.length > 2 ? `Voltar (${navStack.length - 1})` : "Voltar") : "Início"}</span>
          </button>

          {/* Breadcrumb Interligado nos 4 Níveis (Universo > Obra > Temporada/Arco > Episódio) */}
          <nav className="flex flex-1 min-w-0 items-center gap-1.5 text-xs font-mono overflow-x-auto no-scrollbar [&>button]:shrink-0 [&>button]:whitespace-nowrap">
            {/* Nível 1: Universo */}
            <button
              onClick={() => handleNavigate("universe", workReference(currentAnime))}
              className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                activeType === "universe" ? "font-bold text-[color:var(--wc-textPrimary)] shadow-sm" : "opacity-60 hover:opacity-100"
              }`}
              style={{
                backgroundColor: activeType === "universe" ? tokens.colors.bgBase : "transparent",
                borderColor: activeType === "universe" ? tokens.colors.accentGold : tokens.colors.borderDefault,
                color: activeType === "universe" ? tokens.colors.accentGold : tokens.colors.textMuted,
              }}
            >
              Universo
            </button>

            <span className="opacity-40">❯</span>

            {/* Nível 2: Obra */}
            <button
              onClick={() => handleNavigate("work", workReference(currentAnime))}
              className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer truncate max-w-[140px] ${
                activeType === "work" ? "font-bold text-[color:var(--wc-textPrimary)] shadow-sm" : "opacity-60 hover:opacity-100"
              }`}
              style={{
                backgroundColor: activeType === "work" ? tokens.colors.bgBase : "transparent",
                borderColor: activeType === "work" ? tokens.colors.accentGold : tokens.colors.borderDefault,
                color: activeType === "work" ? tokens.colors.accentGold : tokens.colors.textMuted,
              }}
            >
              {localizedTitle}
            </button>

            {selectedSeason && (activeType === "season" || activeType === "episode") && <>
              <span className="opacity-40">❯</span>
              <button type="button" onClick={() => handleNavigate("season", selectedSeason.id)}
                className="px-2.5 py-1 rounded-lg border border-[color:var(--wc-borderDefault)]/10" style={{ color: tokens.colors.accentGold }}>
                {strings.labels.season} {selectedSeason.number}
              </button>
            </>}

            {activeArc && (activeType === "season" || activeType === "arc" || activeType === "episode") && (
              <>
                <span className="opacity-40">❯</span>
                <button
                  onClick={() => handleNavigate(activeType === "season" ? "season" : "arc", workReference(currentAnime), activeArc ? activeArc.startEp : 1, Math.max(0, effectiveArcIndex))}
                  className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer truncate max-w-[180px] ${
                    activeType === "season" || activeType === "arc" ? "font-bold text-[color:var(--wc-textPrimary)] shadow-sm" : "opacity-60 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: activeType === "season" || activeType === "arc" ? tokens.colors.bgBase : "transparent",
                    borderColor: tokens.colors.accentGold,
                    color: tokens.colors.accentGold,
                  }}
                  title={activeArc ? `${activeArc.name} (${activeArc.startEp}-${activeArc.endEp})` : "Arco Canônico"}
                >
                  {activeType === "season"
                    ? `${strings.labels.season} ${selectedSeasonNumber ?? "—"}`
                    : activeArc
                    ? activeArc.name
                    : "Arco Canônico"}
                </button>
              </>
            )}

            {activeType === "episode" && (
              <>
                <span className="opacity-40">❯</span>
                <span className="px-2.5 py-1 rounded-lg font-bold text-[color:var(--wc-textPrimary)] bg-[color:var(--wc-bgBase)]/40 border border-[#FFC766] flex items-center gap-1.5 shadow-sm">
                  <span>{currentEpisodeArc ? `Ep. ${currentEpisodeArc.episodeInArc}` : `Ep. ${selectedEpisode}`}</span>
                  <span className="text-[10px] font-normal text-[color:var(--wc-textMuted)]">({selectedEpisode}/{totalEpisodes})</span>
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Direita: Perfil sem nível para Guest + Seletor de Idioma */}
        <div className="flex items-center gap-1 lg:gap-3 shrink-0">
          <ThemeLanguageSelector />
          <LolProfileBadge
            user={auth?.user}
            tier={effectiveTier}
            level={telemetry.levelNumber}
            xpPercentage={telemetry.xp}
            title={telemetry.title}
            telemetryState={telemetry}
          />
        </div>
      </header>

      {/* 2. CORPO MACRO DA TELA (Área de Conteúdo 100vh Sem Rolagem Cega + Switcher Vertical à Direita) */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Background Atmosférico Imersivo Completo (Cinema Glassmorphism) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <img
            src={bannerImage}
            alt={localizedTitle}
            className="w-full h-full object-cover brightness-[0.20] filter blur-xl scale-110 opacity-70 transition-all duration-700"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 30% 20%, rgba(255, 199, 102, 0.08) 0%, transparent 60%), linear-gradient(to bottom, rgba(11, 11, 13, 0.75) 0%, ${tokens.colors.bgBase} 100%)`,
            }}
          />
        </div>

        <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative z-10">
          {/* HEADER DA TELA COMPACTO: ARTE PROMOCIONAL OFICIAL COM DEGRADÊ FLUIDO */}
          <section
            className="relative w-full h-20 sm:h-24 flex-none overflow-hidden border-b flex items-center justify-between px-6 backdrop-blur-md"
            style={{ borderColor: "rgba(255, 255, 255, 0.07)", backgroundColor: "rgba(11, 11, 13, 0.45)" }}
          >
            <div className="relative z-10 flex flex-col justify-center gap-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border backdrop-blur-md shadow-sm"
                  style={{
                    backgroundColor: "rgba(10, 10, 15, 0.7)",
                    borderColor: tokens.colors.accentGold,
                    color: tokens.colors.accentGold,
                  }}
                >
                  {activeType === "universe"
                    ? "UNIVERSO"
                    : activeType === "work"
                    ? "OBRA"
                    : activeType === "season"
                    ? "TEMPORADA"
                    : activeType === "arc"
                    ? "ARCO"
                    : "EPISÓDIO"}
                </span>
                <span className="text-xs font-mono flex items-center gap-1.5 text-[color:var(--wc-textMuted)]">
                  {catalogLookupFailed && <span role="status" aria-label={classificationLabels.updatePending} title={classificationLabels.updatePending} tabIndex={0} className="inline-flex text-[color:var(--wc-stateWarning)] cursor-help">
                    <Info aria-hidden="true" className="w-3.5 h-3.5" />
                  </span>}
                  <Star className="w-3.5 h-3.5 fill-[#FFC766] text-[#FFC766]" />
                  <strong className="text-[color:var(--wc-textPrimary)]">
                    {currentAnime.score != null ? Number(currentAnime.score).toFixed(1) : "—"}
                  </strong>
                  <span>•</span>
                  <span>{currentAnime.year ?? "—"}</span>
                  <span>•</span>
                  <span>{currentAnime.format || strings.labels.format}</span>
                  {(activeType === "arc" || activeType === "season") && activeArc && (
                    <>
                      <span>•</span>
                      <span className="text-[color:var(--wc-stateSuccess)] font-bold">{activeArc.episodesCount}{" "}{__presentation.text("CATALOG_STRINGS:episodesShort")}</span>
                    </>
                  )}
                  {activeType === "episode" && currentEpisodeArc && (
                    <>
                      <span>•</span>
                      <span className="text-[#FFC766] font-bold">{currentEpisodeArc.name}</span>
                    </>
                  )}
                </span>
              </div>

              <h1 className="text-lg sm:text-2xl font-black font-serif text-[color:var(--wc-textPrimary)] tracking-tight drop-shadow-md truncate">
                {activeType === "episode"
                  ? `${localizedTitle} - Ep. ${currentEpisodeArc ? currentEpisodeArc.episodeInArc : selectedEpisode} (Nº ${selectedEpisode} Geral)`
                  : activeType === "season"
                  ? `${localizedTitle} — ${strings.labels.season} ${selectedSeasonNumber ?? "—"}`
                  : activeType === "arc" && activeArc
                  ? `${localizedTitle} — Arco: ${activeArc.name}`
                  : localizedTitle}
              </h1>
              {currentAnime.catalog_visibility === "quarantined" && <span role="status" className="text-xs text-[color:var(--wc-stateWarning)]">{classificationLabels.evidencePending}</span>}
            </div>

            {/* SWITCHER HORIZONTAL ESTILO DRIBBBLE INTEGRADO NA BARRA SUPERIOR (Apenas nas listas de conteúdos; some nos Comentários e no Player de Episódio) */}
            {rightView === "content" && activeType !== "episode" && currentAnime.entity_type === "WORK" && (
              <div className="relative z-10 flex items-center shrink-0">
                <DribbbleContentSwitchers
                  viewMode={viewMode}
                  onChangeViewMode={setViewMode}
                  hideFillers={hideFillers}
                  onToggleHideFillers={() => setHideFillers(!hideFillers)}
                  showModeToggle={activeType === "universe" && universeArcs.length > 0}
                  showClassification={(activeType === "universe" ? universeWorks : [currentAnime]).some(work => workCapabilities(work).classification)}
                  countLabel={
                    activeType === "universe"
                      ? (viewMode === "arcs" ? `${universeArcs.length} arcos` : `${universeWorks.length} obras`)
                      : activeType === "work" && canonicalArcs.length > 0
                      ? `${canonicalArcs.length} arcos`
                      : `${episodesList.length} eps`
                  }
                />
                {episodeDetails.error && <span role="status" title={classificationLabels.episodesUnavailable} aria-label={classificationLabels.episodesUnavailable}><Info className="w-4 h-4 text-[color:var(--wc-stateWarning)]" /></span>}
              </div>
            )}
          </section>

          {/* PALCO CENTRAL DETERMINÍSTICO (Sem Rolagem de Página, 100% Contido no Viewport) */}
          <div className="flex-1 p-4 sm:p-5 min-h-0 overflow-hidden flex flex-col justify-center">
            {rightView === "discussion" ? (
              /* FEED DE CONVERSA DO NÍVEL ATUAL COM CONTAINER LIMITADO */
              <div className="max-w-3xl w-full mx-auto h-full flex flex-col overflow-hidden">
                <EpisodeDiscussionFeed
                  key={contextUniqueKey}
                  contextKey={contextUniqueKey}
                  contextType={activeType}
                  contextTitle={
                    activeType === "episode"
                      ? `${localizedTitle} - Ep. ${currentEpisodeArc ? currentEpisodeArc.episodeInArc : selectedEpisode}`
                      : (activeType === "arc" || activeType === "season") && activeArc
                      ? `${localizedTitle}: ${activeArc.name}`
                      : activeType === "universe"
                      ? `Universo ${localizedTitle}`
                      : localizedTitle
                  }
                  targetId={activeId}
                  episodeNum={selectedEpisode}
                  isAuthenticated={isAuthenticated}
                />
              </div>
            ) : (
              /* CONTEÚDO ESPECÍFICO DE ACORDO COM O NÍVEL DE PROFUNDIDADE (100vh No-Scroll) */
              <div className="w-full h-full flex flex-col justify-center overflow-hidden">
                {activeType === "arc" && !activeArc && (
                  <p className="text-center text-sm" style={{ color: tokens.colors.textMuted }}>{classificationLabels.noArcs}</p>
                )}
                {/* ======================================================== */}
                {/* A. TELA UNIVERSO: Trilha Horizontal fluida de Obras/Arcos */}
                {/* ======================================================== */}
                {activeType === "universe" && (
                  <div className="w-full h-full min-h-0 flex flex-col justify-between py-2 relative">
                    {/* Header Informativo Limpo (Sem duplicação de botões) */}
                    <div className="flex items-center justify-between pb-2 border-b flex-none" style={{ borderColor: tokens.colors.borderDefault }}>
                      <div className="flex items-center gap-2 font-mono text-xs font-bold" style={{ color: tokens.colors.accentGold }}>
                        <GitBranch className="w-4 h-4" />
                        <span>Universo Expandido</span>
                        <span className="text-[color:var(--wc-textMuted)] font-normal">•</span>
                        <span className="text-[color:var(--wc-textSecondary)] font-semibold">
                          {viewMode === "arcs" ? `Arcos Narrativos (${universeArcs.length})` : `Lançamentos Conectados (${universeWorks.length})`}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-[color:var(--wc-textMuted)]">
                        {viewMode === "arcs" ? "Fases e sagas sequenciais da história" : "Produções e spin-offs em ordem de lançamento"}
                      </span>
                    </div>

                    {/* Container de Carrossel Relativo com Controles Físicos Flutuantes */}
                    <div className="relative flex-1 min-h-0 flex items-center group/carousel">
                      {viewMode === "arcs" && universeArcs.length === 0 && (
                        <p className="w-full text-center text-sm" style={{ color: tokens.colors.textMuted }}>{classificationLabels.noArcs}</p>
                      )}
                      {/* Botão de Rolagem Esquerda Flutuante */}
                      <button
                        onClick={() => handleScrollUniverse("left")}
                        className="absolute left-1 z-30 p-2.5 rounded-full border shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer opacity-70 hover:opacity-100 hidden sm:flex items-center justify-center"
                        style={{
                          backgroundColor: "rgba(10, 10, 15, 0.75)",
                          borderColor: tokens.colors.accentGold,
                          color: tokens.colors.accentGold,
                        }}
                        title="Rolar para esquerda"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>

                      {/* Botão de Rolagem Direita Flutuante */}
                      <button
                        onClick={() => handleScrollUniverse("right")}
                        className="absolute right-1 z-30 p-2.5 rounded-full border shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer opacity-70 hover:opacity-100 hidden sm:flex items-center justify-center"
                        style={{
                          backgroundColor: "rgba(10, 10, 15, 0.75)",
                          borderColor: tokens.colors.accentGold,
                          color: tokens.colors.accentGold,
                        }}
                        title="Rolar para direita"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>

                      {/* Trilha do Carrossel com Scroll Invisível */}
                      <div
                        ref={universeScrollRef}
                        className="w-full h-full flex items-center gap-4 overflow-x-auto overflow-y-hidden py-4 px-2 min-h-0 scroll-smooth [&::-webkit-scrollbar]:hidden"
                        style={{
                          scrollbarWidth: "none",
                          msOverflowStyle: "none",
                        }}
                      >
                        {viewMode === "arcs" ? (
                          universeArcs.map((arc, idx) => (
                            <ContextNavigationCard
                              key={`arc-${arc.id}-${idx}`}
                              label={arc.title}
                              onOpen={() => handleNavigate("arc", arc.work_reference, arc.startEp || 1, arc.sourceArcIndex, arc.sourceArcId)}
                              className="relative group w-72 h-full max-h-[385px] p-4 rounded-2xl border transition-all duration-300 hover:scale-[1.03] active:scale-95 cursor-pointer backdrop-blur-xl shadow-xl flex flex-col justify-between shrink-0 overflow-hidden"
                              style={{
                                backgroundColor: "rgba(15, 17, 23, 0.75)",
                                borderColor: tokens.colors.borderDefault,
                              }}
                            >
                              {/* Arte e Selo de Arco */}
                              <div className="relative w-full h-44 rounded-xl overflow-hidden shadow-inner border border-[color:var(--wc-borderDefault)]/5">
                                <img
                                  src={arc.cover_image}
                                  alt={arc.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div
                                  className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold backdrop-blur-md"
                                  style={{
                                    backgroundColor: "rgba(10, 10, 15, 0.8)",
                                    borderColor: arc.isCanonMovie
                                      ? "#C084FC"
                                      : arc.classification === "filler"
                                      ? "rgba(239, 68, 68, 0.4)"
                                      : tokens.colors.accentGold,
                                    color: arc.isCanonMovie
                                      ? "#C084FC"
                                      : arc.classification === "filler"
                                      ? "#F87171"
                                      : tokens.colors.accentGold,
                                  }}
                                >
                                  {arc.saga || `Arco #${idx + 1}`}
                                </div>
                                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[color:var(--wc-bgBase)]/70 border border-[color:var(--wc-borderDefault)]/10 text-[color:var(--wc-stateSuccess)]">
                                  {arc.isCanonMovie ? "1 filme completo" : `${arc.episodes_count} episódios`}
                                </div>
                              </div>

                              {/* Conteúdo Descritivo do Arco */}
                              <div className="flex-1 flex flex-col justify-between pt-3">
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span
                                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                                        arc.isCanonMovie
                                          ? "bg-[color:var(--wc-statePrimary)]/10 text-[color:var(--wc-statePrimary)] border border-[color:var(--wc-statePrimary)]/30"
                                          : arc.classification === "filler"
                                          ? "bg-[color:var(--wc-stateError)]/10 text-[color:var(--wc-stateError)] border border-[color:var(--wc-stateError)]/20"
                                          : "bg-[color:var(--wc-stateSuccess)]/10 text-[color:var(--wc-stateSuccess)] border border-[color:var(--wc-stateSuccess)]/20"
                                      }`}
                                    >
                                      {classificationLabels[arc.classification || "unknown"]}
                                    </span>
                                    <span className="text-[10px] font-mono text-[color:var(--wc-textMuted)]">
                                      {arc.isCanonMovie ? "Longa-metragem" : `Eps ${arc.startEp}–${arc.endEp}`}
                                    </span>
                                  </div>
                                  <h3 className="font-bold text-sm text-[color:var(--wc-textPrimary)] group-hover:text-[#FFC766] transition-colors line-clamp-1">
                                    {arc.title}
                                  </h3>
                                  <p className="text-[11px] line-clamp-2 mt-1 leading-snug text-[color:var(--wc-textMuted)]">
                                    {arc.synopsis}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between pt-2 text-xs font-mono" style={{ color: tokens.colors.accentGold }}>
                                  <span className="font-semibold group-hover:underline">Explorar Arco</span>
                                  <span className="group-hover:translate-x-1 transition-transform">❯</span>
                                </div>
                              </div>
                            </ContextNavigationCard>
                          ))
                        ) : (
                          universeWorks.map((work, idx) => {
                            const relationInfo = classifyUniverseWork(work);
                            const displayEps = work.episodes_count || work.latest_episode_num;
                            const epsLabel = work.entity_type === "WORK" ? (displayEps ? `${displayEps} eps` : "—") : work.format;

                            return (
                              <ContextNavigationCard
                                key={catalogKey(work)}
                                label={getLocalizedTitle(work)}
                                onOpen={() => handleNavigate("work", workReference(work))}
                                className="relative group w-64 h-full max-h-[385px] p-4 rounded-2xl border transition-all duration-300 hover:scale-[1.03] active:scale-95 cursor-pointer backdrop-blur-xl shadow-xl flex flex-col justify-between shrink-0 overflow-hidden"
                                style={{
                                  backgroundColor: "rgba(15, 17, 23, 0.75)",
                                  borderColor: tokens.colors.borderDefault,
                                }}
                              >
                                <div className="relative w-full h-44 rounded-xl overflow-hidden shadow-inner border border-[color:var(--wc-borderDefault)]/5">
                                  <img
                                    src={work.cover_image}
                                    alt={work.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  />
                                  <div
                                    className="absolute top-2 left-2 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold backdrop-blur-md"
                                    style={{
                                      backgroundColor: "rgba(10, 10, 15, 0.8)",
                                      borderColor: relationInfo.border,
                                      color: relationInfo.text,
                                    }}
                                  >
                                    {relationInfo.label}
                                  </div>
                                  <div
                                    className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[color:var(--wc-bgBase)]/70 border border-[color:var(--wc-borderDefault)]/10"
                                    style={{ color: tokens.colors.accentGold }}
                                  >
                                    {work.year ?? "—"}
                                  </div>
                                </div>

                                <div className="flex-1 flex flex-col justify-between pt-3">
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span
                                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase"
                                        style={{
                                          backgroundColor: relationInfo.bg,
                                          borderColor: relationInfo.border,
                                          color: relationInfo.text,
                                        }}
                                      >
                                        {work.format || classificationLabels.unknown}
                                      </span>
                                      <span className="text-[10px] font-mono text-[color:var(--wc-stateSuccess)]">
                                        {epsLabel}
                                      </span>
                                    </div>
                                    <h3 className="font-bold text-sm text-[color:var(--wc-textPrimary)] group-hover:text-[#FFC766] transition-colors line-clamp-1">
                                      {getLocalizedTitle(work)}
                                    </h3>
                                    <p className="text-[11px] line-clamp-2 mt-1 leading-snug text-[color:var(--wc-textMuted)]">
                                      {getLocalizedSynopsis(work)}
                                    </p>
                                  </div>

                                  <div className="flex items-center justify-between pt-2 text-xs font-mono" style={{ color: tokens.colors.accentGold }}>
                                    <span className="font-semibold group-hover:underline">Acessar Obra</span>
                                    <span className="group-hover:translate-x-1 transition-transform">❯</span>
                                  </div>
                                </div>
                              </ContextNavigationCard>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ======================================================== */}
                {/* B. TELA OBRA: Painel Duplo com Pôster, Atmosfera e Arcos Ilustrados */}
                {/* ======================================================== */}
                {activeType === "work" && (
                  <div className="w-full h-full grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-h-0 overflow-hidden py-1">
                    {/* Painel Esquerdo: Pôster + Ficha Técnica Geometrizada (Clean & Floating) */}
                    <div
                      className="lg:col-span-4 p-5 rounded-3xl border flex flex-col justify-between backdrop-blur-2xl shadow-2xl min-h-0 overflow-hidden relative"
                      style={{
                        backgroundColor: "rgba(15, 17, 23, 0.70)",
                        borderColor: "rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
                        <div className="flex gap-4 items-center">
                          {/* Pôster em relevo com sombra cinematográfica */}
                          <div
                            className="w-24 sm:w-28 h-36 sm:h-40 rounded-2xl overflow-hidden shrink-0 border shadow-2xl relative group/poster"
                            style={{ borderColor: "rgba(255, 255, 255, 0.12)" }}
                          >
                            <img
                              src={currentAnime.cover_image || bannerImage}
                              alt={localizedTitle}
                              className="w-full h-full object-cover group-hover/poster:scale-105 transition-transform duration-500"
                            />
                          </div>

                          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-[#FFC766] backdrop-blur-md"
                                style={{ backgroundColor: "rgba(10, 10, 15, 0.6)", borderColor: "rgba(255, 199, 102, 0.3)" }}
                              >
                                {currentAnime.studios?.[0] || "—"}
                              </span>
                              <span
                                className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-[color:var(--wc-stateSuccess)] backdrop-blur-md"
                                style={{ backgroundColor: "rgba(10, 10, 15, 0.6)", borderColor: "rgba(52, 211, 153, 0.3)" }}
                              >
                                {currentStatusKey ? strings.labels[currentStatusKey] : classificationLabels.unknown}
                              </span>
                            </div>

                            <h2 className="font-extrabold text-base sm:text-lg text-[color:var(--wc-textPrimary)] tracking-tight line-clamp-2">
                              {localizedTitle}
                            </h2>

                            <span className="text-xs font-mono text-[#FFC766] flex items-center gap-1">
                              <span>★</span>
                              <strong>{currentAnime.score != null ? Number(currentAnime.score).toFixed(1) : "—"}</strong>
                              <span className="text-[color:var(--wc-textMuted)]">•</span>
                              <span className="text-[color:var(--wc-textMuted)]">{currentAnime.year ?? "—"}</span>
                            </span>
                          </div>
                        </div>

                        {/* Sinopse da Obra com tipografia arejada */}
                        <div className="pt-2 border-t border-[color:var(--wc-borderDefault)]/5">
                          <p className="text-xs leading-relaxed font-sans line-clamp-4 text-[color:var(--wc-textSecondary)]">
                            {localizedSynopsis}
                          </p>
                        </div>
                      </div>

                      {/* Métricas e Tags em Docks Geométricos Flutuantes */}
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t text-xs font-mono" style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}>
                        <div
                          className="p-2.5 rounded-2xl border text-center transition-all hover:border-[#FFC766]/40"
                          style={{ backgroundColor: "rgba(10, 10, 15, 0.5)", borderColor: tokens.colors.borderDefault }}
                        >
                          <span className="text-[9px] block text-[color:var(--wc-textMuted)] uppercase tracking-wider">Total</span>
                          <strong className="text-[#FFC766] text-xs sm:text-sm">{currentAnime.entity_type === "WORK" ? `${currentAnime.episodes_count ?? "—"} eps` : currentAnime.format}</strong>
                        </div>
                        <div
                          className="p-2.5 rounded-2xl border text-center transition-all hover:border-[#FFC766]/40"
                          style={{ backgroundColor: "rgba(10, 10, 15, 0.5)", borderColor: tokens.colors.borderDefault }}
                        >
                          <span className="text-[9px] block text-[color:var(--wc-textMuted)] uppercase tracking-wider">{__presentation.text("I18N_DICTIONARY:labels.sortScore")}</span>
                          <strong className="text-[color:var(--wc-textPrimary)] text-xs sm:text-sm">★ {currentAnime.score != null ? Number(currentAnime.score).toFixed(1) : "—"}</strong>
                        </div>
                        <div
                          className="p-2.5 rounded-2xl border text-center transition-all hover:border-[#FFC766]/40"
                          style={{ backgroundColor: "rgba(10, 10, 15, 0.5)", borderColor: tokens.colors.borderDefault }}
                        >
                          <span className="text-[9px] block text-[color:var(--wc-textMuted)] uppercase tracking-wider">Origem</span>
                          <strong className="text-[color:var(--wc-stateSuccess)] text-xs sm:text-sm">{currentAnime.metadata_source || "—"}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Painel Direito da OBRA: Exibe Temporadas (se múltipla) ou Episódios Diretos (se obra direta) */}
                    {currentAnime.entity_type !== "WORK" ? <PublicationDetails work={currentAnime} /> : <div className="lg:col-span-8 flex flex-col justify-between min-h-0 overflow-hidden">
                      {identityGraph && <WorkSeasonSelector seasons={identityGraph.seasons} episodes={identityGraph.episodes}
                        label={strings.labels.season} episodeLabel={classificationLabels.episodesShort} accent={tokens.colors.accentGold}
                        onOpen={id => handleNavigate("season", id)} />}
                      <div className="flex items-center justify-between pb-2 border-b flex-none" style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}>
                        <div className="flex items-center gap-2 font-mono text-xs font-bold" style={{ color: tokens.colors.accentGold }}>
                          <Layers className="w-4 h-4" />
                          <span>
                            {canonicalArcs.length === 0
                              ? `Episódios da Obra (${episodesList.length})`
                              : `Arcos da Obra (${canonicalArcs.length})`}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[color:var(--wc-textMuted)]">
                          {canonicalArcs.length === 0
                            ? `${indexedEpisodeNumbers.length} episódios catalogados`
                            : `${canonicalArcs.length} arcos • ${currentAnime.episodes_count ?? "—"} eps`}
                        </span>
                        <ArcSourceCredit arcs={canonicalArcs} />
                      </div>

                      {canonicalArcs.length === 0 ? (
                        /* OBRA DIRETA: Exibe a grade de episódios diretamente pronta para assistir */
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 py-2 min-h-0 overflow-y-auto pr-1 content-start [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
                          {episodesList.map((ep) => (
                            <button
                              key={ep.number}
                              onClick={() => handleNavigate("episode", workReference(currentAnime), ep.number)}
                              title={ep.title}
                              className="h-16 flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer shadow-lg backdrop-blur-md"
                              style={{
                                backgroundColor: selectedEpisode === ep.number ? "rgba(255, 199, 102, 0.12)" : "rgba(15, 17, 23, 0.75)",
                                borderColor: selectedEpisode === ep.number ? tokens.colors.accentGold : "rgba(255, 255, 255, 0.08)",
                              }}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                  style={{ backgroundColor: ep.classification === "unknown" ? tokens.colors.textMuted : ep.isFiller ? "#F87171" : tokens.colors.accentGold }}
                                />
                                <div className="truncate">
                                  <span className="font-mono text-xs font-bold block truncate text-[color:var(--wc-textPrimary)]">
                                    Episódio {ep.number}
                                  </span>
                                  <span className="text-[10px] font-mono block truncate text-[color:var(--wc-textMuted)]">
                                    {classificationLabels[ep.classification]}
                                  </span>
                                </div>
                              </div>
                              <Play className="w-3.5 h-3.5 text-[color:var(--wc-textMuted)] hover:text-[#FFC766] shrink-0 transition-colors" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        /* OBRA COM TEMPORADAS: Exibe as Temporadas que levam aos seus Episódios */
                        <div className="flex-1 flex flex-col gap-3 py-2 min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
                          {canonicalArcs.map((arc, idx) => (
                            <WorkArcCard key={arc.arcId} arc={arc} image={bannerImage} accent={tokens.colors.accentGold}
                              selected={selectedArcIndex === idx && activeType === "arc"}
                              onSelect={() => handleNavigate("arc", workReference(currentAnime), arc.startEp, idx)}
                              labels={{
                                title: `${classificationLabels.arc} ${idx + 1}: ${arc.name}`,
                                classification: classificationLabels[arc.classification || "unknown"],
                                range: `${classificationLabels.episodes} ${arc.startEp ?? "—"}–${arc.endEp ?? "—"}`,
                                count: `${arc.episodesCount} ${classificationLabels.episodesShort}`,
                                action: classificationLabels.viewEpisodes,
                              }} />
                          ))}
                        </div>
                      )}
                    </div>}
                  </div>
                )}

                {/* ======================================================== */}
                {/* C. TELA TEMPORADA / ARCO: Seletor de Episódios em Grade Compacta No-Scroll */}
                {/* ======================================================== */}
                {(activeType === "season" || activeType === "arc") && (
                  <div className="w-full h-full flex flex-col justify-between py-1 min-h-0 overflow-hidden">
                    <div className="flex items-center justify-between pb-2 border-b flex-none" style={{ borderColor: tokens.colors.borderDefault }}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold" style={{ color: tokens.colors.accentGold }}>
                          {activeType === "arc" && activeArc ? activeArc.name : "Episódios da Temporada"}
                        </span>
                        {activeType === "arc" && activeArc && (
                          <span
                            className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                            style={{
                              backgroundColor: tokens.colors.bgBase,
                              borderColor: activeArc.isFiller ? "#FFA07A" : tokens.colors.accentGold,
                              color: activeArc.isFiller ? "#FFA07A" : tokens.colors.accentGold,
                            }}
                          >
                            {activeArc.saga || classificationLabels[activeArc.classification || "unknown"]} • Eps {activeArc.startEp} a {activeArc.endEp}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px]" style={{ color: tokens.colors.textMuted }}>
                        {episodesList.length} episódios catalogados nesta fase
                      </span>
                    </div>

                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 py-3 min-h-0 overflow-hidden items-center">
                      {episodesList.slice(0, 18).map((ep) => (
                        <button
                          key={ep.number}
                          onClick={() => handleNavigate("episode", workReference(currentAnime), ep.number)}
                          title={ep.title}
                          className="h-16 flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer shadow-lg backdrop-blur-md"
                          style={{
                            backgroundColor: selectedEpisode === ep.number ? "rgba(255, 199, 102, 0.12)" : "rgba(15, 17, 23, 0.75)",
                            borderColor: selectedEpisode === ep.number ? tokens.colors.accentGold : "rgba(255, 255, 255, 0.08)",
                          }}
                          title={`Episódio ${ep.arcEpisodeNum} do arco • Nº ${ep.number} no total da série`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                              style={{
                                backgroundColor: ep.classification === "unknown" ? tokens.colors.textMuted : ep.isFiller ? "#F87171" : tokens.colors.accentGold,
                              }}
                              title={classificationLabels[ep.classification]}
                            />
                            <div className="truncate">
                              <div className="flex items-baseline gap-1 truncate">
                                <span className="font-mono text-xs font-bold truncate text-[color:var(--wc-textPrimary)]">
                                  Ep. {ep.arcEpisodeNum}
                                </span>
                                <span className="text-[10px] font-mono text-[color:var(--wc-textMuted)]">
                                  (#{ep.number})
                                </span>
                              </div>
                              <span className="text-[10px] font-mono block truncate text-[color:var(--wc-textMuted)]">
                                {ep.arcName || classificationLabels[ep.classification]}
                              </span>
                            </div>
                          </div>
                          <Play className="w-3.5 h-3.5 text-[color:var(--wc-textMuted)] hover:text-[#FFC766] shrink-0 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ======================================================== */}
                {/* D. TELA EPISÓDIO: Player modular e controles 100% contidos na viewport */}
                {/* ======================================================== */}
                {activeType === "episode" && (
                  <div className="w-full h-full max-w-4xl mx-auto flex flex-col justify-between py-1 min-h-0 overflow-hidden">
                    {/* Player Modular Plug-and-Play */}
                    <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                      <div className="w-full max-h-[380px] aspect-video">
                        <ModularPlayerBox
                          catalogIdentity={identityGraph && currentAnime.work_id ? {
                            workId: currentAnime.work_id,
                            episodeId: identityGraph.episodes.find((episode: any) => episode.id === activeId)?.id || graphActionTarget(identityGraph, "episode", { episode: selectedEpisode }) || undefined,
                            seasonId: selectedSeason?.id,
                          } : undefined}
                          catalogEpisodes={identityGraph?.episodes.filter((episode: any) => episode.numbering_scheme === "original")}
                          catalogSeasonNumber={selectedSeasonNumber}
                          anime={currentAnime}
                          episodeNum={selectedEpisode}
                          seasonIdx={0}
                          isAuthenticated={isAuthenticated}
                          tier={effectiveTier}
                          onChangeEpisode={(ep) => { void handleNavigate("episode", workReference(currentAnime), ep); }}
                          onProgress={(data) => {
                            const episodeId = data.episodeId || graphActionTarget(identityGraph, "episode", { episode: data.episode });
                            if (identityGraph && !episodeId && currentAnime.format === "MOVIE" && currentAnime.work_id) {
                              syncEntityPreference({ target_type: "work", target_id: currentAnime.work_id, progress_seconds: data.currentTime,
                                status: data.completed ? "completed" : "watching" }, isAuthenticated);
                              return;
                            }
                            recordWatchProgress(
                              data.currentTime,
                              data.completed,
                              isAuthenticated,
                              effectiveTier,
                              data.animeId,
                              data.episode,
                              episodeId && currentAnime.work_id ? { episode_id: episodeId, work_id: currentAnime.work_id } : undefined
                            );
                          }}
                        />
                      </div>
                    </div>

                    {/* Detalhes do Episódio e Acesso Rápido aos Vizinhos */}
                    <div
                      className="p-3.5 rounded-2xl border flex flex-col gap-2.5 backdrop-blur-md flex-none mt-2"
                      style={{
                        backgroundColor: tokens.colors.bgSurface,
                        borderColor: tokens.colors.borderDefault,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#FFC766]">
                              {currentEpisodeArc ? `${currentEpisodeArc.name} • Ep. ${currentEpisodeArc.episodeInArc} (${currentEpisodeArc.episodeInArc}/${currentEpisodeArc.episodesCount})` : `Episódio ${selectedEpisode}`}
                            </span>
                            <span className="text-[color:var(--wc-textMuted)] font-mono text-xs">•</span>
                            <span className="font-mono text-[11px] text-[color:var(--wc-textMuted)]">
                              Nº {selectedEpisode} de {totalEpisodes} no geral
                            </span>
                          </div>
                          <h3 className="font-bold text-sm text-[color:var(--wc-textPrimary)] mt-0.5 truncate max-w-md">
                            {episodeTitle(episodeIndex.get(selectedEpisode), language, `${localizedTitle} - Ep. ${selectedEpisode}`)}
                          </h3>
                          {selectedAirTime !== null && <time dateTime={new Date(selectedAirTime).toISOString()} className="text-[10px] text-[color:var(--wc-textMuted)]">{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(selectedAirTime)}</time>}
                        </div>

                        <div className="flex items-center gap-2">
                          {isAuthenticated && (
                            <button
                              type="button"
                              onClick={() => handleToggleEpisodeComplete(selectedEpisode)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                                completedEpisodesMap[episodePreferenceKey(selectedEpisode)]
                                  ? "bg-[color:var(--wc-stateSuccess)]/20 border-[color:var(--wc-stateSuccess)]/50 text-[color:var(--wc-stateSuccess)]"
                                  : "hover:border-[#FFC766] text-[color:var(--wc-textSecondary)]"
                              }`}
                              style={{
                                backgroundColor: completedEpisodesMap[episodePreferenceKey(selectedEpisode)]
                                  ? undefined
                                  : tokens.colors.bgBase,
                                borderColor: completedEpisodesMap[episodePreferenceKey(selectedEpisode)]
                                  ? undefined
                                  : tokens.colors.borderDefault,
                              }}
                              title="Marcar como concluído (+10 XP e soma para arco/temporada/obra/universo)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {completedEpisodesMap[episodePreferenceKey(selectedEpisode)]
                                  ? "Concluído (+10 XP)"
                                  : "Marcar Concluído"}
                              </span>
                            </button>
                          )}
                          <button
                            disabled={!indexedEpisodeNumbers.some((number: number) => number < selectedEpisode)}
                            onClick={() => { void handleNavigate("episode", workReference(currentAnime), adjacentEpisode(indexedEpisodeNumbers, selectedEpisode, -1)); }}
                            className="px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition disabled:opacity-40 cursor-pointer hover:border-[#FFC766]"
                            style={{ backgroundColor: tokens.colors.bgBase, borderColor: tokens.colors.borderDefault, color: tokens.colors.textMuted }}
                          >{__presentation.text("UNIFIED_CATALOG_STRINGS:previous")}</button>
                          <button
                            disabled={!indexedEpisodeNumbers.some((number: number) => number > selectedEpisode)}
                            onClick={() => { void handleNavigate("episode", workReference(currentAnime), adjacentEpisode(indexedEpisodeNumbers, selectedEpisode, 1)); }}
                            className="px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition disabled:opacity-40 cursor-pointer hover:border-[#FFC766]"
                            style={{ backgroundColor: tokens.colors.bgBase, borderColor: tokens.colors.borderDefault, color: tokens.colors.accentGold }}
                          >
                            Próximo
                          </button>
                        </div>
                      </div>

                      {/* Mini Track Intra-Arco: Escolha direta de episódios sem sair da tela */}
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-[color:var(--wc-borderDefault)]/5">
                        {episodesList.map((ep) => {
                          const isCurrent = ep.number === selectedEpisode;
                          const isEpDone = !!completedEpisodesMap[episodePreferenceKey(ep.number)];
                          return (
                            <button
                              key={ep.number}
                              onClick={() => { void handleNavigate("episode", workReference(currentAnime), ep.number); }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 border ${
                                isCurrent
                                  ? "shadow-sm scale-105"
                                  : "opacity-60 hover:opacity-100"
                              }`}
                              style={{
                                backgroundColor: isCurrent
                                  ? tokens.colors.accentGold
                                  : isEpDone
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : "rgba(10, 10, 15, 0.6)",
                                color: isCurrent
                                  ? tokens.colors.bgBase
                                  : isEpDone
                                  ? "#34D399"
                                  : tokens.colors.textSecondary,
                                borderColor: isCurrent
                                  ? tokens.colors.accentGold
                                  : isEpDone
                                  ? "rgba(52, 211, 153, 0.4)"
                                  : "rgba(255, 255, 255, 0.08)",
                              }}
                              title={`${ep.title}${ep.arcName ? ` • ${ep.arcName}` : ""}${isEpDone ? " • Concluído" : ""}`}
                            >
                              <span>Ep. {ep.arcEpisodeNum}</span>
                              {isEpDone && (
                                <CheckCircle2 className="w-2.5 h-2.5 text-[color:var(--wc-stateSuccess)]" />
                              )}
                              {ep.isFiller && (
                                <span className="w-1 h-1 rounded-full bg-[color:var(--wc-stateError)]" title={__presentation.text("CATALOG_STRINGS:filler")} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* 3. SWITCHER VERTICAL ESTILO DRIBBBLE FLUTUANTE À DIREITA */}
        <aside className="pr-4 py-4 flex flex-col items-center justify-center shrink-0 z-30">
          <DribbbleVerticalActionDock
            activeView={rightView}
            onChangeView={setRightView}
            isLiked={isLiked}
            isBookmarked={isBookmarked}
            userRating={userRating}
            isAuthenticated={isAuthenticated}
            onToggleLike={handleToggleLike}
            onToggleBookmark={handleToggleBookmark}
            onRate={handleRate}
          />
        </aside>
      </div>
    </div>
  );
}
