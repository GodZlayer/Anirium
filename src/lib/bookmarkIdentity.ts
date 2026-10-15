import type { BookmarkItem } from "./userProfiles";

export function isEpisodeBookmarked(items: readonly BookmarkItem[], episode: number, seasonId: string) {
  return items.some(item => item.entityType === "EPISODE" && item.seasonEntityId === seasonId && item.episodeNumber === episode);
}
