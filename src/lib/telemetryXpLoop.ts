/**
 * Micro-Módulo Puro (~50 linhas): Telemetry & XP Loop Engine
 * Conecta ações reais na interface a:
 * - Acúmulo de XP contínuo (Assistir vídeos, favoritar, completar episódios)
 * - Títulos dinâmicos conquistados
 * - Persistência imediata no cliente (localStorage) com sincronização otimista
 */

export interface TelemetryState {
  xp: number; // 0 a 100% no nível atual
  levelNumber: number; // Nível 1 a infinito
  totalSecondsWatched: number;
  episodesCompleted: number;
  bookmarksCount: number;
  title: string;
}

const STORAGE_KEY = "anirium_telemetry_state";

export function loadTelemetryState(): TelemetryState {
  if (typeof window === "undefined") {
    return { xp: 42, levelNumber: 1, totalSecondsWatched: 0, episodesCompleted: 0, bookmarksCount: 0, title: "Explorador Canônico" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { xp: 42, levelNumber: 1, totalSecondsWatched: 0, episodesCompleted: 0, bookmarksCount: 0, title: "Explorador Canônico" };
}

export function saveTelemetryState(state: TelemetryState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("anirium_xp_update", { detail: state }));
  } catch {}
}

export function computeTitle(level: number, episodesCompleted: number, tier: number): string {
  if (tier === 3) return "Admin Supremo";
  if (episodesCompleted >= 100) return "Lenda Shonen";
  if (episodesCompleted >= 30) return "Fã Master Bleach";
  if (episodesCompleted >= 10) return "Veterano de Simulcast";
  if (level >= 5) return "Explorador de Universos";
  return tier === 2 ? "Anirium+ Pro" : tier === 1 ? "Membro Conectado" : "Visitante";
}

export function recordWatchProgress(secondsDelta: number, isCompleted: boolean = false, tier: number = 0): TelemetryState {
  const current = loadTelemetryState();
  current.totalSecondsWatched += secondsDelta;
  if (isCompleted) current.episodesCompleted += 1;

  // Ganho de XP: 1 XP a cada 30 segundos assistidos + 15 XP por episódio completo
  const xpGained = Math.floor(secondsDelta / 30) + (isCompleted ? 15 : 0);
  let newXp = current.xp + xpGained;
  let newLevel = current.levelNumber;

  while (newXp >= 100) {
    newXp -= 100;
    newLevel += 1;
  }

  current.xp = Math.max(0, Math.min(99, newXp));
  current.levelNumber = newLevel;
  current.title = computeTitle(newLevel, current.episodesCompleted, tier);

  saveTelemetryState(current);
  return current;
}

export function recordBookmarkAction(added: boolean, tier: number = 0): TelemetryState {
  const current = loadTelemetryState();
  current.bookmarksCount = Math.max(0, current.bookmarksCount + (added ? 1 : -1));
  if (added) {
    let newXp = current.xp + 5;
    if (newXp >= 100) {
      newXp -= 100;
      current.levelNumber += 1;
    }
    current.xp = newXp;
  }
  current.title = computeTitle(current.levelNumber, current.episodesCompleted, tier);
  saveTelemetryState(current);
  return current;
}
