export function catalogEpisodeCounts(catalog: { seasons_json?: unknown; episodes?: unknown } | null): (number | null)[] | null {
  if (!catalog) return null;
  const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
  let seasons = catalog.seasons_json;
  if (typeof seasons === "string") {
    try { seasons = JSON.parse(seasons); } catch { return null; }
  }
  if (Array.isArray(seasons) && seasons.length) {
    return seasons.map(season => season && count(season.episodes) ? season.episodes : null);
  }
  if (seasons != null && !Array.isArray(seasons)) return null;
  return count(catalog.episodes) ? [catalog.episodes] : null;
}
