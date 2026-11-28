export interface EpisodeResumeSnapshot {
  episodeKey: string;
  position: number;
  duration: number;
  quality?: string;
  audio?: string;
  subtitle?: string;
  completed: boolean;
  updatedAt: number;
}

export const EPISODE_RESUME_STORAGE_KEY = "anirium_episode_resume_v1";
const MAX_RETAINED_EPISODES = 3;
const MIN_RESUME_SECONDS = 5;
const COMPLETION_TAIL_SECONDS = 15;

export function buildEpisodeResumeKey(params: {
  episodeId?: string;
  workId?: string;
  animeId?: number | string;
  episodeNum: number;
}): string {
  if (params.episodeId) return `ep:${params.episodeId.toLowerCase()}`;
  const work = params.workId ? params.workId.toLowerCase() : String(params.animeId ?? "unknown");
  return `work:${work}:ep:${params.episodeNum}`;
}

function readAllSnapshots(storage?: Pick<Storage, "getItem">): EpisodeResumeSnapshot[] {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return [];
    const raw = store.getItem(EPISODE_RESUME_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is EpisodeResumeSnapshot =>
        Boolean(item) &&
        typeof item.episodeKey === "string" &&
        Number.isFinite(item.position) &&
        Number.isFinite(item.updatedAt),
    );
  } catch {
    return [];
  }
}

function writeAllSnapshots(list: EpisodeResumeSnapshot[], storage?: Pick<Storage, "setItem">): void {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(EPISODE_RESUME_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota/private-mode storage errors.
  }
}

export function loadEpisodeResume(
  episodeKey: string,
  storage?: Pick<Storage, "getItem">,
): EpisodeResumeSnapshot | null {
  if (!episodeKey) return null;
  const entry = readAllSnapshots(storage).find((item) => item.episodeKey === episodeKey);
  if (!entry) return null;
  if (entry.completed) return null;
  if (entry.position < MIN_RESUME_SECONDS) return null;
  if (entry.duration > 0 && entry.duration - entry.position <= COMPLETION_TAIL_SECONDS) return null;
  return entry;
}

export function saveEpisodeResume(
  snapshot: EpisodeResumeSnapshot,
  storage?: Pick<Storage, "getItem" | "setItem">,
): void {
  if (!snapshot.episodeKey || !Number.isFinite(snapshot.position) || snapshot.position < 0) return;

  const existing = readAllSnapshots(storage).filter((item) => item.episodeKey !== snapshot.episodeKey);
  const next = [
    {
      ...snapshot,
      updatedAt: snapshot.updatedAt || Date.now(),
    },
    ...existing,
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RETAINED_EPISODES);

  writeAllSnapshots(next, storage);
}

export function clearEpisodeResume(
  episodeKey: string,
  storage?: Pick<Storage, "getItem" | "setItem">,
): void {
  if (!episodeKey) return;
  const remaining = readAllSnapshots(storage).filter((item) => item.episodeKey !== episodeKey);
  writeAllSnapshots(remaining, storage);
}
