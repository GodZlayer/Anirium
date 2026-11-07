import { WORK_UUID } from "../../lib/catalogAliases.mjs";

export interface CatalogPlaybackIdentity {
  workId: string;
  episodeId?: string;
  seasonId?: string;
}

export interface CatalogPlaybackEpisode { id: string; number: number; season_id?: string | null }

export function playbackPreparationRequest(identity: CatalogPlaybackIdentity | undefined, legacy: Record<string, unknown>) {
  if (!identity) return legacy;
  if (!WORK_UUID.test(identity.workId) || (identity.episodeId && !WORK_UUID.test(identity.episodeId))
    || (identity.seasonId && !WORK_UUID.test(identity.seasonId))) return null;
  return { workId: identity.workId.toLowerCase(), ...(identity.episodeId ? { episodeId: identity.episodeId.toLowerCase() } : {}) };
}

export function playbackIdentityMatches(expected: CatalogPlaybackIdentity | undefined, value: any): boolean {
  if (!expected) return true;
  return Boolean(playbackPreparationRequest(expected, {}) && value && value.workId === expected.workId.toLowerCase()
    && (value.episodeId || "") === (expected.episodeId?.toLowerCase() || "")
    && (!value.seasonId || WORK_UUID.test(value.seasonId)));
}

export function adjacentCatalogEpisode(episodes: CatalogPlaybackEpisode[] | undefined, id: string | undefined, direction: number) {
  if (!episodes || !id) return null;
  const sorted = [...episodes].sort((a, b) => a.number - b.number);
  const index = sorted.findIndex(episode => episode.id === id);
  return index < 0 ? null : sorted[index + (direction < 0 ? -1 : 1)] || null;
}
