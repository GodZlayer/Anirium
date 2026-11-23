export type WatchCompletionKind = "complete" | "partial" | "none";

export interface WatchCompletionStatus {
  status: WatchCompletionKind;
  watched: number;
  total: number;
}

export interface WatchableWorkLike {
  id?: string | number | null;
  uuid?: string | null;
  slug?: string | null;
  mal_id?: number | null;
  episodes_count?: number | null;
  total_episodes?: number | null;
}

export function loadCompletedEpisodesMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem("anirium_user_completed") || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function workCompletionPrefixes(work: WatchableWorkLike): string[] {
  const refs = new Set<string>();
  if (work.uuid) refs.add(String(work.uuid));
  if (work.id !== undefined && work.id !== null && String(work.id) !== "") refs.add(String(work.id));
  if (work.slug) refs.add(String(work.slug));
  if (work.mal_id && Number(work.mal_id) > 0) refs.add(`mal-${work.mal_id}`);
  return Array.from(refs).map((ref) => `episode:${ref}:ep-`);
}

export function getWorkWatchStatus(
  work: WatchableWorkLike,
  completedMap?: Record<string, boolean>,
): WatchCompletionStatus {
  const map = completedMap ?? loadCompletedEpisodesMap();
  const prefixes = workCompletionPrefixes(work);
  const watchedEpNumbers = new Set<string>();

  for (const [key, done] of Object.entries(map)) {
    if (!done) continue;
    for (const prefix of prefixes) {
      if (key.startsWith(prefix)) {
        watchedEpNumbers.add(key.slice(prefix.length));
        break;
      }
    }
  }

  const watched = watchedEpNumbers.size;
  const total = Math.max(0, Number(work.episodes_count ?? work.total_episodes ?? 0) || 0);
  if (watched === 0) {
    return { status: "none", watched: 0, total };
  }
  if (total > 0 && watched >= total) {
    return { status: "complete", watched, total };
  }
  return { status: "partial", watched, total };
}

export function getArcWatchStatus(
  work: WatchableWorkLike,
  startEp: number,
  endEp: number,
  completedMap?: Record<string, boolean>,
): WatchCompletionStatus {
  const map = completedMap ?? loadCompletedEpisodesMap();
  const prefixes = workCompletionPrefixes(work);
  const start = Math.max(1, Math.floor(startEp || 1));
  const end = Math.max(start, Math.floor(endEp || start));
  const total = end - start + 1;
  let watched = 0;

  for (let ep = start; ep <= end; ep++) {
    if (prefixes.some((prefix) => !!map[`${prefix}${ep}`])) {
      watched++;
    }
  }

  if (watched === 0) return { status: "none", watched: 0, total };
  if (watched >= total) return { status: "complete", watched, total };
  return { status: "partial", watched, total };
}

export function getUniverseWatchStatus(
  works: WatchableWorkLike[],
  completedMap?: Record<string, boolean>,
): WatchCompletionStatus {
  const map = completedMap ?? loadCompletedEpisodesMap();
  let watched = 0;
  let total = 0;
  for (const w of works) {
    const st = getWorkWatchStatus(w, map);
    watched += st.watched;
    total += st.total;
  }
  if (watched === 0) return { status: "none", watched: 0, total };
  if (total > 0 && watched >= total) return { status: "complete", watched, total };
  return { status: "partial", watched, total };
}
