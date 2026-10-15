import type { Anime } from "../types/anime";

export const isReleaseUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Re-resolve the selected release after refreshing the catalog; never reuse a stale index. */
export function resolveProfileRelease(results: Anime[], routeId: number, releaseId: string) {
  if (!Array.isArray(results) || !isReleaseUuid(releaseId) || !Number.isSafeInteger(routeId) || routeId < 1) return null;
  const anime = results.find(row => row?.mal_id === routeId);
  if (!anime) return null;
  const seasons = anime.seasons;
  const seasonIdx = seasons?.length ? seasons.findIndex(season => season.entityId === releaseId) : anime.seasonEntityId === releaseId ? 0 : -1;
  if (seasonIdx < 0) return null;
  return { anime, seasonIdx };
}

export function resolveProfilePlayback(results: Anime[], routeId: number, releaseId: string, episode: number) {
  if (!Number.isSafeInteger(episode) || episode < 1) return null;
  const release = resolveProfileRelease(results, routeId, releaseId);
  if (!release) return null;
  const { anime, seasonIdx } = release;
  const seasons = anime.seasons;
  const count = seasons?.length ? seasons[seasonIdx].episodes : anime.episodes;
  if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && episode > count) return null;
  return { anime, seasonIdx, episode };
}

export function resolveProfileActivityPlayback(results: Anime[], routeId: number, releaseId: string, episodeId: string, progress: unknown) {
  if (!isReleaseUuid(episodeId) || !Array.isArray(progress)) return null;
  const matches = progress.filter(row => row?.canonicalEntityId === episodeId && row.seasonEntityId === releaseId);
  if (matches.length !== 1 || typeof matches[0].number !== "number") return null;
  return resolveProfilePlayback(results, routeId, releaseId, matches[0].number);
}

export async function loadCanonicalResume(routeId: number, releaseId: string, episodeId: string, fetcher: typeof fetch = fetch, ownerId?: string) {
  if (!isReleaseUuid(releaseId) || !isReleaseUuid(episodeId)) return null;
  try {
    const response = await fetcher(`/api/search?q=${routeId}`);
    if (!response.ok) return null;
    const catalog = await response.json();
    const release = resolveProfileRelease(catalog.results, routeId, releaseId);
    if (!release) return null;
    const params = new URLSearchParams({animeId:String(routeId),seasonIdx:String(release.seasonIdx),seasonEntityId:releaseId,episodeEntityId:episodeId});
    const progressResponse = await fetcher(`/api/progress?${params}`);
    if (!progressResponse.ok) return null;
    const progress = await progressResponse.json();
    if (ownerId !== undefined && progress.userId !== ownerId) return null;
    return progress.success === true ? resolveProfileActivityPlayback(catalog.results,routeId,releaseId,episodeId,progress.episodes) : null;
  } catch { return null; }
}

export interface CanonicalEpisodeProgress {
  canonicalEntityId: string;
  seasonEntityId: string;
  completed: boolean;
  watchedSeconds: number;
  totalSeconds: number;
}

export interface ScopedEpisodeProgress {
  ownerId: string | null;
  seasonEntityId: string | null;
  episodes: Record<number, CanonicalEpisodeProgress>;
}

const emptyProgress: Record<number, CanonicalEpisodeProgress> = {};
export function scopedEpisodeProgress(state: ScopedEpisodeProgress, ownerId: string | null, seasonEntityId: string | undefined) {
  return ownerId !== null && isReleaseUuid(seasonEntityId) && state.ownerId === ownerId && state.seasonEntityId === seasonEntityId ? state.episodes : emptyProgress;
}

export function readCanonicalProgress(data: any, seasonId: string): Record<number, CanonicalEpisodeProgress> | null {
  if (data?.success !== true || !Array.isArray(data.episodes) || !isReleaseUuid(seasonId)) return null;
  const map: Record<number, CanonicalEpisodeProgress> = {};
  for (const row of data.episodes) {
    if (!row || !isReleaseUuid(row.canonicalEntityId) || row.seasonEntityId !== seasonId ||
      !Number.isSafeInteger(row.number) || row.number < 1 || row.number > 2147483647 || map[row.number] ||
      typeof row.completed !== "boolean" || ![row.watchedSeconds,row.totalSeconds].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647)) return null;
    map[row.number] = {canonicalEntityId:row.canonicalEntityId,seasonEntityId:row.seasonEntityId,completed:row.completed,watchedSeconds:row.watchedSeconds,totalSeconds:row.totalSeconds};
  }
  return map;
}

export function recommendCanonicalResume(anime: Anime | null, history: Array<{animeId: number | null; resumeAvailable: boolean; completed: boolean; seasonEntityId?: string; canonicalEntityId?: string; episodeNumber: number | null}>, progress: Record<number, CanonicalEpisodeProgress>) {
  if (!anime) return {isResume:false as const,seasonIdx:null,episodeNum:null,seasonEntityId:null,episodeEntityId:null};
  const candidate = history.find(row => row.animeId === anime.mal_id);
  const select = (seasonId: unknown, episodeId: unknown, number: unknown) => {
    if (!isReleaseUuid(seasonId) || !isReleaseUuid(episodeId) || typeof number !== "number") return null;
    const target = resolveProfilePlayback([anime],anime.mal_id,seasonId,number);
    return target ? {isResume:true as const,seasonIdx:target.seasonIdx,episodeNum:target.episode,seasonEntityId:seasonId,episodeEntityId:episodeId} : null;
  };
  if (candidate?.resumeAvailable && !candidate.completed) {
    const target = select(candidate.seasonEntityId,candidate.canonicalEntityId,candidate.episodeNumber);
    if (target) return target;
  }
  for (const [number,row] of Object.entries(progress)) {
    if (!row.completed && row.watchedSeconds > 0) {
      const target = select(row.seasonEntityId,row.canonicalEntityId,Number(number));
      if (target) return target;
    }
  }
  return {isResume:false as const,seasonIdx:null,episodeNum:null,seasonEntityId:null,episodeEntityId:null};
}
