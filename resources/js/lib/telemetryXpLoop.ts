/**
 * Micro-Módulo Puro: Telemetry, RPG Level Curve, Streaks & Dynamic Catalog XP Engine (TGCode Standard)
 * Totalmente desacoplado de Tier:
 * - Visitante (Guest / Tier 0): XP e progressão desligados; emite apenas telemetria passiva de presença e tráfego.
 * - Usuário Logado (Tier 1 a 3): XP contínuo matematicamente escalonado (RPG), presença ativa (+1 XP/min),
 *   streaks de presença (1d/1w/1m/1y), interações sociais indexadas e conclusão reversível de catálogo.
 */

import { getOrCreateMachineFingerprint } from "./deviceFingerprint";
import { readCatalogCompletion, emptyCatalogCompletion } from "./catalogCompletion.mjs";
import { createCanonicalPreferenceWriter } from "./canonicalPreferenceWriter.mjs";
import { achievementLabel, unlockedAchievementIds, selectAchievementId } from "./achievementCatalog.mjs";
import experienceRules from "../../data/experience-rules.json";

export interface EntityPreferenceRecord {
  entity_id?: string;
  work_id?: string;
  episode_number?: number;
  target_type: string;
  target_id: string;
  status?: string | null;
  user_score?: number | null;
  bookmarked?: boolean;
  liked?: boolean;
  progress_seconds?: number;
  metadata?: any;
}

export interface TelemetryState {
  xp: number; // 0 a 100% no nível atual (progresso circular LoL Badge)
  levelNumber: number; // Nível 1 a infinito
  totalXp: number; // XP total acumulado (reversível se catálogo expandir)
  currentLevelXp: number; // XP acumulado dentro do nível atual
  nextLevelRequiredXp: number; // XP necessário para subir do nível atual para o próximo
  activeMinutes: number; // Minutos com janela ativa (+1 XP/min)
  currentStreak: number; // Dias seguidos de presença
  longestStreak: number; // Maior sequência de dias
  streakXp: number; // XP acumulado de presença diária + bônus semanais/mensais/anuais
  totalSecondsWatched: number;
  episodesCompleted: number;
  arcsCompleted: number;
  seasonsCompleted: number;
  worksCompleted: number;
  universesCompleted: number;
  bookmarksCount: number;
  likesCount: number;
  ratingsCount: number;
  commentsCount: number;
  unlockedTitles: string[];
  unlockedTitleIds: string[];
  titleId: string;
  title: string;
}

export interface TelemetryEvent {
  target_type: "global" | "universe" | "work" | "season" | "episode" | "arc";
  target_id: string | number;
  event_type:
    | "presence_ping"
    | "active_minute"
    | "dwell_time"
    | "playback_heartbeat"
    | "episode_completed"
    | "like"
    | "favorite"
    | "rate"
    | "comment";
  payload?: Record<string, any>;
}

const STORAGE_KEY = "anirium_telemetry_state";
let eventQueue: TelemetryEvent[] = [];
let flushInterval: any = null;
let activeMinuteInterval: any = null;
let currentAuthFlag = false;
let currentTierFlag = 0;
let cachedCompletion = emptyCatalogCompletion();
let currentAccountId: string | null = null;
let cachedPreferences: EntityPreferenceRecord[] = [];
let cachedCommentedTargets: Set<string> = new Set();
let cachedCustomTitle: string | null = null;
let achievementLanguage = "pt-BR";

/**
 * Curva Matemática Escalonada (Estilo Jogo / RPG baseada no Nível 1 = 10 XP):
 * XP necessário para avançar do Nível L para L + 1:
 * XP_req(L) = floor(10 * L^1.5)
 * Exemplos:
 * - Nível 1 -> 2: 10 XP
 * - Nível 2 -> 3: 28 XP
 * - Nível 5 -> 6: 111 XP
 * - Nível 10 -> 11: 316 XP
 */
export function xpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.floor(experienceRules.curve.base * Math.pow(safeLevel, experienceRules.curve.exponent));
}

export function computeLevelFromTotalXp(totalXp: number): {
  levelNumber: number;
  currentLevelXp: number;
  nextLevelRequiredXp: number;
  xpPercentage: number;
} {
  let remaining = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let req = xpRequiredForLevel(level);

  while (remaining >= req) {
    remaining -= req;
    level += 1;
    req = xpRequiredForLevel(level);
  }

  const xpPercentage = req > 0 ? Math.min(99, Math.floor((remaining / req) * 100)) : 0;
  return {
    levelNumber: level,
    currentLevelXp: remaining,
    nextLevelRequiredXp: req,
    xpPercentage,
  };
}

export function defaultTelemetryState(): TelemetryState {
  return {
    xp: 0,
    levelNumber: 1,
    totalXp: 0,
    currentLevelXp: 0,
    nextLevelRequiredXp: 10,
    activeMinutes: 0,
    currentStreak: 0,
    longestStreak: 0,
    streakXp: 0,
    totalSecondsWatched: 0,
    episodesCompleted: 0,
    arcsCompleted: 0,
    seasonsCompleted: 0,
    worksCompleted: 0,
    universesCompleted: 0,
    bookmarksCount: 0,
    likesCount: 0,
    ratingsCount: 0,
    commentsCount: 0,
    unlockedTitles: [],
    unlockedTitleIds: [],
    titleId: "achievement.guest",
    title: achievementLabel("achievement.guest", achievementLanguage),
  };
}

export function loadTelemetryState(): TelemetryState {
  if (typeof window === "undefined") {
    return defaultTelemetryState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaultTelemetryState(), ...JSON.parse(raw) };
    }
  } catch {}
  return defaultTelemetryState();
}

export function saveTelemetryState(state: TelemetryState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("anirium_xp_update", { detail: state }));
  } catch {}
}

export function computeTitle(level: number, episodesCompleted: number, tier: number, unlockedIds: string[] = [], customTitle?: string | null): string {
  const ids = unlockedIds.length ? unlockedIds : unlockedAchievementIds({ level, episodes:episodesCompleted, tier, universes:0 });
  return achievementLabel(selectAchievementId(ids, customTitle), achievementLanguage);
}

export function setGamificationLanguage(language: string): void {
  if (achievementLanguage === language) return;
  achievementLanguage = language;
  recalculateUserGamification();
}

/**
 * Recalcula deterministicamente todo o XP, Nível e Títulos do usuário cruzando:
 * 1. Presença ativa (+1 XP/min)
 * 2. Presença diária e Streaks (+10/dia, +50/semana, +250/mês, +2500/ano)
 * 3. Interações sociais (+2 Like, +5 Bookmark, +5 Nota, +10 1º Comentário por ID)
 * 4. Conclusão reversível do catálogo lançado (+10 Ep, +50 Arco, +100 Temporada, +100 Obra, +1000 Universo + Título Master)
 */
export function recalculateUserGamification(
  catalogInput?: any[],
  preferencesInput?: EntityPreferenceRecord[],
  commentedInput?: string[],
  metaInput?: {
    activeMinutes?: number;
    currentStreak?: number;
    longestStreak?: number;
    streakXp?: number;
    tier?: number;
    isAuthenticated?: boolean;
    customTitle?: string | null;
  }
): TelemetryState {
  if (preferencesInput) cachedPreferences = preferencesInput;
  if (commentedInput) cachedCommentedTargets = new Set(commentedInput);
  if (metaInput?.customTitle !== undefined) cachedCustomTitle = metaInput.customTitle;

  const current = loadTelemetryState();
  const isAuthenticated = metaInput?.isAuthenticated ?? currentAuthFlag;
  const tier = metaInput?.tier ?? currentTierFlag;

  if (!isAuthenticated || tier === 0) {
    const guestState: TelemetryState = {
      ...defaultTelemetryState(),
      titleId: "achievement.guest",
      title: achievementLabel("achievement.guest", achievementLanguage),
    };
    saveTelemetryState(guestState);
    return guestState;
  }

  const activeMinutes = metaInput?.activeMinutes ?? current.activeMinutes ?? 0;
  const currentStreak = metaInput?.currentStreak ?? current.currentStreak ?? 1;
  const longestStreak = metaInput?.longestStreak ?? current.longestStreak ?? 1;
  const streakXp = metaInput?.streakXp ?? current.streakXp ?? 10;

  const counts = cachedCompletion.counts;
  const totalCompletedEpisodesCount = counts.episodes;
  const arcsCompleted = counts.arcs, seasonsCompleted = counts.seasons;
  const worksCompleted = counts.works, universesCompleted = counts.universes;
  const likesCount = cachedPreferences.filter(pref => pref.entity_id && pref.liked).length;
  const bookmarksCount = cachedPreferences.filter(pref => pref.entity_id && pref.bookmarked).length;
  const ratingsCount = cachedPreferences.filter(pref => pref.entity_id && Number(pref.user_score) > 0).length;
  const commentsCount = cachedCommentedTargets.size;


  // Soma Determinística Total de XP
  const activeXp = activeMinutes * experienceRules.presence.minute;
  const socialXp =
    likesCount * experienceRules.social.like +
    bookmarksCount * experienceRules.social.bookmark +
    ratingsCount * experienceRules.social.rating +
    commentsCount * experienceRules.social.comment;

  const catalogXp =
    totalCompletedEpisodesCount * experienceRules.catalog.episodes +
    arcsCompleted * experienceRules.catalog.arcs +
    seasonsCompleted * experienceRules.catalog.seasons +
    worksCompleted * experienceRules.catalog.works +
    universesCompleted * experienceRules.catalog.universes;

  const totalXp = activeXp + streakXp + socialXp + catalogXp;
  const levelCalc = computeLevelFromTotalXp(totalXp);

  const uniqueTitleIds = unlockedAchievementIds({ tier, level:levelCalc.levelNumber, episodes:totalCompletedEpisodesCount, universes:universesCompleted });
  const uniqueTitles = uniqueTitleIds.map((id: string) => achievementLabel(id, achievementLanguage));
  const titleId = selectAchievementId(uniqueTitleIds, cachedCustomTitle);
  const activeTitle = achievementLabel(titleId, achievementLanguage);

  const nextState: TelemetryState = {
    xp: levelCalc.xpPercentage,
    levelNumber: levelCalc.levelNumber,
    totalXp,
    currentLevelXp: levelCalc.currentLevelXp,
    nextLevelRequiredXp: levelCalc.nextLevelRequiredXp,
    activeMinutes,
    currentStreak,
    longestStreak,
    streakXp,
    totalSecondsWatched: current.totalSecondsWatched || 0,
    episodesCompleted: totalCompletedEpisodesCount,
    arcsCompleted,
    seasonsCompleted,
    worksCompleted,
    universesCompleted,
    bookmarksCount,
    likesCount,
    ratingsCount,
    commentsCount,
    unlockedTitles: uniqueTitles,
    unlockedTitleIds: uniqueTitleIds,
    titleId,
    title: activeTitle,
  };

  saveTelemetryState(nextState);
  return nextState;
}

// Sincroniza estado completo do usuário vindo do backend (Inertia auth.user ou GET /api/entity/preferences)
export function hydrateUserGamificationFromServer(
  authUser: any,
  catalog?: any[]
): TelemetryState {
  if (!authUser) {
    currentAccountId = null;
    cachedCompletion = emptyCatalogCompletion();
    currentAuthFlag = false;
    currentTierFlag = 0;
    return recalculateUserGamification(catalog, [], [], {
      isAuthenticated: false,
      tier: 0,
    });
  }

  const incomingCompletion = readCatalogCompletion(authUser.catalog_completion);
  if (currentAccountId === String(authUser.id) && incomingCompletion
    && Date.parse(incomingCompletion.observed_at || "") < Date.parse(cachedCompletion.observed_at || "")) return recalculateUserGamification();
  currentAccountId = String(authUser.id);
  cachedCompletion = readCatalogCompletion(authUser.catalog_completion) || emptyCatalogCompletion();
  currentAuthFlag = true;
  currentTierFlag = Number(authUser.tier || 1);

  // Hidrata também o localStorage para acesso instantâneo nos componentes
  if (typeof window !== "undefined" && Array.isArray(authUser.preferences)) {
    try {
      const likesMap: Record<string, boolean> = {};
      const bookmarksMap: Record<string, boolean> = {};
      const ratingsMap: Record<string, number> = {};
      const completedMap: Record<string, boolean> = {};

      for (const p of authUser.preferences) {
        const key = String(p.entity_id || p.target_id);
        if (p.liked) likesMap[key] = true;
        if (p.bookmarked) bookmarksMap[key] = true;
        if (p.user_score) ratingsMap[key] = Number(p.user_score);
        if (p.status === "completed") completedMap[key] = true;
      }

      localStorage.setItem("anirium_user_likes", JSON.stringify(likesMap));
      localStorage.setItem("anirium_user_bookmarks", JSON.stringify(bookmarksMap));
      localStorage.setItem("anirium_user_ratings", JSON.stringify(ratingsMap));
      localStorage.setItem("anirium_user_completed", JSON.stringify(completedMap));
    } catch {}
  }

  return recalculateUserGamification(
    catalog,
    authUser.preferences || cachedPreferences,
    authUser.commented_targets || Array.from(cachedCommentedTargets),
    {
      activeMinutes: Number(authUser.active_minutes ?? 0),
      currentStreak: Number(authUser.current_streak ?? 1),
      longestStreak: Number(authUser.longest_streak ?? 1),
      streakXp: Number(authUser.streak_xp ?? 10),
      tier: currentTierFlag,
      isAuthenticated: true,
      customTitle: authUser.custom_title ?? null,
    }
  );
}

/**
 * Atualiza uma preferência no cache em memória, recalcula o XP na hora e envia para o PostgreSQL
 */
export function syncEntityPreference(
  payload: {
    work_id?: string;
    episode_number?: number;
    target_type: string;
    target_id: string;
    status?: string | null;
    user_score?: number | null;
    bookmarked?: boolean;
    liked?: boolean;
    progress_seconds?: number;
    metadata?: Record<string, any>;
  },
  isAuthenticated: boolean = currentAuthFlag
): TelemetryState {
  if (!isAuthenticated) return loadTelemetryState();

  if (typeof window !== "undefined") void writePreference(payload, currentAccountId);
  return loadTelemetryState();
}

const writePreference = createCanonicalPreferenceWriter({
  isCurrent: (account: string | null) => currentAuthFlag && account !== null && account === currentAccountId,
  write: async (payload: unknown) => {
    const response = await fetch("/api/entity/preference", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("Preference rejected: " + response.status);
    return response.json();
  },
  apply: (response: any) => {
    const completion = readCatalogCompletion(response.catalog_completion), preference = response.preference;
    if (!completion || !preference?.entity_id || preference.target_id !== preference.entity_id) throw new Error("Invalid canonical preference response");
    cachedCompletion = completion;
    cachedPreferences = cachedPreferences.filter(pref => !(pref.target_type === preference.target_type && (pref.entity_id || pref.target_id) === preference.entity_id));
    cachedPreferences.push(preference);
    recalculateUserGamification();
  },
  failed: async (error: unknown) => {
    window.dispatchEvent(new CustomEvent("anirium_preference_error", { detail: String(error) }));
  },
});

export function registerCommentXp(targetKey: string, isAuthenticated: boolean = currentAuthFlag): TelemetryState {
  if (!isAuthenticated) return loadTelemetryState();
  cachedCommentedTargets.add(targetKey);
  return recalculateUserGamification();
}

// Fila em batch de telemetria leve (sem engasgar FPS)
export function queueTelemetryEvent(event: TelemetryEvent): void {
  eventQueue.push(event);
  if (eventQueue.length >= 10) {
    flushTelemetryQueue();
  }
}

export function flushTelemetryQueue(): void {
  if (eventQueue.length === 0 || typeof window === "undefined") return;
  const eventsToSend = [...eventQueue];
  eventQueue = [];

  const payload = JSON.stringify({
    machine_fingerprint: getOrCreateMachineFingerprint(),
    events: eventsToSend,
  });

  fetch("/api/telemetry/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function initTelemetryLoop(isLoggedIn: boolean = false, tier: number = 1): () => void {
  if (typeof window === "undefined") return () => {};
  currentAuthFlag = isLoggedIn;
  if (isLoggedIn && tier > 0) currentTierFlag = tier;

  // Ping inicial de presença de máquina
  queueTelemetryEvent({
    target_type: "global",
    target_id: window.location.pathname,
    event_type: "presence_ping",
    payload: { screen: `${window.screen.width}x${window.screen.height}`, is_logged_in: isLoggedIn },
  });

  if (!flushInterval) {
    flushInterval = setInterval(flushTelemetryQueue, 15000);
    window.addEventListener("beforeunload", flushTelemetryQueue);
  }

  // Heartbeat de Janela Ativa: +1 XP a cada 60 segundos com aba visível
  if (activeMinuteInterval) {
    clearInterval(activeMinuteInterval);
    activeMinuteInterval = null;
  }

  if (isLoggedIn) {
    activeMinuteInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        const st = loadTelemetryState();
        const nextActiveMinutes = (st.activeMinutes || 0) + 1;
        queueTelemetryEvent({
          target_type: "global",
          target_id: "active_window",
          event_type: "active_minute",
          payload: { active_minutes: nextActiveMinutes },
        });
        recalculateUserGamification(undefined, undefined, undefined, {
          activeMinutes: nextActiveMinutes,
          isAuthenticated: true,
        });
        flushTelemetryQueue();
      }
    }, 60000);
  }

  return () => {
    flushTelemetryQueue();
  };
}

export function recordWatchProgress(
  secondsDelta: number,
  isCompleted: boolean = false,
  isAuthenticated: boolean = false,
  tier: number = 0,
  workId?: number | string,
  episodeNum?: number,
  identity?: { episode_id: string; work_id: string }
): TelemetryState {
  const current = loadTelemetryState();
  current.totalSecondsWatched = (current.totalSecondsWatched || 0) + secondsDelta;
  saveTelemetryState(current);

  if (!identity?.episode_id || !identity.work_id) return current;
  if (isAuthenticated && isCompleted) {
    return syncEntityPreference({ target_type: "episode", target_id: identity.episode_id, work_id: identity.work_id,
      episode_number: episodeNum, status: "completed", progress_seconds: secondsDelta }, true);
  }
  queueTelemetryEvent({ target_type: "episode", target_id: identity.episode_id, event_type: "playback_heartbeat",
    payload: { secondsDelta, isCompleted } });

  return recalculateUserGamification(undefined, undefined, undefined, {
    isAuthenticated,
    tier,
  });
}

export function recordBookmarkAction(
  added: boolean,
  isAuthenticated: boolean = false,
  tier: number = 0,
  targetKey?: string,
  targetType: string = "work"
): TelemetryState {
  if (isAuthenticated && targetKey) {
    return syncEntityPreference(
      {
        target_type: targetType,
        target_id: targetKey,
        bookmarked: added,
      },
      true
    );
  }

  queueTelemetryEvent({
    target_type: targetType as any,
    target_id: targetKey || "active",
    event_type: "favorite",
    payload: { added },
  });

  return loadTelemetryState();
}
