/**
 * Filtros e ordenação da tela Explorar. Funções puras sobre o catálogo universal:
 * mesma entrada, mesma saída, sem rede e sem estado.
 */
import { isHentaiOrAdultAnime, type UnifiedCatalogWork } from "./parquetCatalog";

export type StatusFilter = "all" | "releasing" | "finished" | "upcoming";
export type SortKey = "popularity" | "score" | "year" | "title";

export interface CatalogFilters {
  status: StatusFilter;
  /** "all" ou um formato exato (TV, MOVIE, OVA, ONA, SPECIAL...) */
  format: string;
  /** "all" ou o nome exato do gênero */
  genre: string;
  sort: SortKey;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  status: "all",
  format: "all",
  genre: "all",
  sort: "popularity",
};

const RELEASING = new Set(["RELEASING", "AIRING", "CURRENT"]);
const UPCOMING = new Set(["NOT_YET_RELEASED", "NOT_YET_AIRED", "UPCOMING"]);
const NON_ANIME = new Set(["MANGA", "NOVEL", "ONE_SHOT", "DOUJINSHI", "MANHWA", "MANHUA"]);
const ADULT_GENRE_NAMES = new Set(["hentai", "erotica", "rx"]);

export function matchesStatus(anime: UnifiedCatalogWork, status: StatusFilter): boolean {
  const s = String(anime.status || "").toUpperCase();
  switch (status) {
    case "releasing": return RELEASING.has(s);
    case "upcoming": return UPCOMING.has(s);
    case "finished": return !RELEASING.has(s) && !UPCOMING.has(s);
    default: return true;
  }
}

function matchesQuery(anime: UnifiedCatalogWork, query: string): boolean {
  if (!query) return true;
  const hay = [
    anime.title,
    anime.title_english,
    anime.title_japanese,
    anime.title_portuguese,
    ...(anime.studios || []),
  ];
  return hay.some((value) => value && value.toLowerCase().includes(query));
}

export function applyCatalogFilters(
  catalog: UnifiedCatalogWork[],
  filters: CatalogFilters,
  searchQuery = "",
  allowAdult = false
): UnifiedCatalogWork[] {
  const query = searchQuery.toLowerCase().trim();

  const result = catalog.filter(
    (a) =>
      (allowAdult || !isHentaiOrAdultAnime(a)) &&
      !NON_ANIME.has(String(a.format || "").toUpperCase()) &&
      matchesStatus(a, filters.status) &&
      (filters.format === "all" || String(a.format || "").toUpperCase() === filters.format) &&
      (filters.genre === "all" || (a.genres || []).includes(filters.genre)) &&
      matchesQuery(a, query)
  );

  const byNumberDesc = (pick: (a: UnifiedCatalogWork) => number | null | undefined) => (a: UnifiedCatalogWork, b: UnifiedCatalogWork) =>
    (pick(b) ?? -Infinity) - (pick(a) ?? -Infinity);

  switch (filters.sort) {
    case "score":
      return result.sort(byNumberDesc((a) => a.score));
    case "year":
      return result.sort(byNumberDesc((a) => a.year));
    case "title":
      return result.sort((a, b) => a.title.localeCompare(b.title));
    case "popularity":
    default:
      // menor número de popularidade = mais popular; sem dado vai para o fim
      return result.sort((a, b) => (a.popularity ?? Infinity) - (b.popularity ?? Infinity));
  }
}

/** Gêneros reais presentes no catálogo, do mais frequente para o menos frequente (oculta Hentai/Erotica quando não permitido). */
export function collectGenres(catalog: UnifiedCatalogWork[], limit = 24, allowAdult = false): string[] {
  const counts = new Map<string, number>();
  for (const anime of catalog) {
    if (!allowAdult && isHentaiOrAdultAnime(anime)) continue;
    for (const genre of anime.genres || []) {
      if (!allowAdult && ADULT_GENRE_NAMES.has(String(genre).toLowerCase().trim())) continue;
      counts.set(genre, (counts.get(genre) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

/** Formatos de anime realmente presentes (TV, MOVIE, OVA...), mais frequentes primeiro. */
export function collectFormats(catalog: UnifiedCatalogWork[]): string[] {
  const counts = new Map<string, number>();
  for (const anime of catalog) {
    const f = String(anime.format || "").toUpperCase();
    if (f && !NON_ANIME.has(f)) counts.set(f, (counts.get(f) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export function isDefaultFilters(filters: CatalogFilters): boolean {
  return (
    filters.status === DEFAULT_CATALOG_FILTERS.status &&
    filters.format === DEFAULT_CATALOG_FILTERS.format &&
    filters.genre === DEFAULT_CATALOG_FILTERS.genre &&
    filters.sort === DEFAULT_CATALOG_FILTERS.sort
  );
}
