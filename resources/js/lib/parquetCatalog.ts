import { parquetRead } from "hyparquet";

export interface ParquetAnime {
  id: number;
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_portuguese?: string | null;
  title_spanish?: string | null;
  title_french?: string | null;
  title_german?: string | null;
  images_json?: string;
  images?: any;
  synopsis?: string | null;
  synopses?: Record<string, string>;
  score?: number | null;
  popularity?: number | null;
  episodes_count?: number | null;
  status: string; // RELEASING, COMPLETED, UPCOMING
  category?: string;
  genres?: string[];
  studios?: string[];
  year?: number | null;
  format?: string;
  universe_id?: string | null;
  cover_image: string;
  banner_image: string;
  updated_at?: number;
}

// O Catálogo Universal Único em Memória
let universalCatalogCache: ParquetAnime[] | null = null;
let catalogLoadingPromise: Promise<ParquetAnime[]> | null = null;

function normalizeAnime(record: any): ParquetAnime {
  let images = record.images || {};
  if (typeof record.images_json === "string") {
    try { images = JSON.parse(record.images_json); } catch {}
  }

  const cover_image =
    images.jpg?.large_image_url ||
    images.jpg?.image_url ||
    images.webp?.large_image_url ||
    record.cover_image ||
    "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80";

  const banner_image =
    images.jpg?.large_image_url ||
    cover_image;

  let genres: string[] = [];
  if (Array.isArray(record.genres)) {
    genres = record.genres;
  } else if (typeof record.genres_json === "string") {
    try { genres = JSON.parse(record.genres_json); } catch {}
  }

  let studios: string[] = [];
  if (Array.isArray(record.studios)) {
    studios = record.studios;
  } else if (typeof record.studios_json === "string") {
    try { studios = JSON.parse(record.studios_json); } catch {}
  }

  const mal_id = Number(record.mal_id || record.id || Math.floor(Math.random() * 100000));

  return {
    id: mal_id,
    mal_id,
    title: String(record.title || ""),
    title_english: record.title_english ? String(record.title_english) : undefined,
    title_japanese: record.title_japanese ? String(record.title_japanese) : undefined,
    title_portuguese: record.title_portuguese ? String(record.title_portuguese) : undefined,
    title_spanish: record.title_spanish ? String(record.title_spanish) : undefined,
    title_french: record.title_french ? String(record.title_french) : undefined,
    title_german: record.title_german ? String(record.title_german) : undefined,
    synopsis: record.synopsis ? String(record.synopsis) : "",
    synopses: record.synopses || undefined,
    score: record.score != null ? Number(record.score) : undefined,
    popularity: record.popularity != null ? Number(record.popularity) : undefined,
    episodes_count: record.episodes != null ? Number(record.episodes) : (record.episodes_count != null ? Number(record.episodes_count) : undefined),
    status: String(record.status || "COMPLETED").toUpperCase(),
    category: record.category ? String(record.category) : "all",
    genres,
    studios,
    year: record.year != null ? Number(record.year) : undefined,
    format: String(record.format || "TV"),
    universe_id: record.universe_id ? String(record.universe_id) : `univ-${mal_id}`,
    cover_image,
    banner_image,
    updated_at: record.updated_at ? Number(record.updated_at) : Date.now(),
  };
}

async function loadSliceData(sliceName: string): Promise<ParquetAnime[]> {
  try {
    const res = await fetch(`/data/${sliceName}.json`);
    if (res.ok) {
      const rows = await res.json();
      return rows.map((record: any) => normalizeAnime(record));
    }
  } catch {}

  try {
    const response = await fetch(`/data/${sliceName}.parquet`);
    if (!response.ok) return [];
    const arrayBuffer = await response.arrayBuffer();

    const items: ParquetAnime[] = [];
    await parquetRead({
      file: arrayBuffer,
      rowFormat: "object",
      onComplete: (rows) => {
        for (const record of rows) {
          items.push(normalizeAnime(record));
        }
      },
    });

    return items;
  } catch (err) {
    console.error(`[Parquet] Falha ao ler fatia ${sliceName}:`, err);
    return [];
  }
}

/**
 * Carrega e funde a base única em um mapa indexado sem duplicações (mal_id).
 * O catálogo inteiro é um só.
 */
export async function getUniversalCatalog(): Promise<ParquetAnime[]> {
  if (universalCatalogCache) {
    return universalCatalogCache;
  }

  if (catalogLoadingPromise) {
    return catalogLoadingPromise;
  }

  catalogLoadingPromise = (async () => {
    // Carrega as fatias da base em paralelo e funde pelo mal_id
    const slices = await Promise.all([
      loadSliceData("catalog-popular"),
      loadSliceData("catalog-seasonal"),
      loadSliceData("catalog-upcoming"),
    ]);

    const animeMap = new Map<number, ParquetAnime>();

    for (const slice of slices) {
      for (const item of slice) {
        if (!animeMap.has(item.mal_id)) {
          animeMap.set(item.mal_id, item);
        } else {
          // Atualiza dados caso a fatia mais recente tenha campos adicionais
          animeMap.set(item.mal_id, { ...animeMap.get(item.mal_id)!, ...item });
        }
      }
    }

    const merged = Array.from(animeMap.values());
    universalCatalogCache = merged;
    return merged;
  })();

  return catalogLoadingPromise;
}

/**
 * Filtros puros aplicados sobre o catálogo universal único
 */
export function filterCatalog(
  catalog: ParquetAnime[],
  filterType: "all" | "popular" | "releasing" | "upcoming" | "calendar" | "franchises",
  searchQuery?: string
): ParquetAnime[] {
  let filtered = catalog;

  // 1. Filtro de Texto Global (busca por qualquer título ou estúdio)
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        (a.title_english && a.title_english.toLowerCase().includes(query)) ||
        (a.title_japanese && a.title_japanese.toLowerCase().includes(query)) ||
        (a.title_portuguese && a.title_portuguese.toLowerCase().includes(query)) ||
        (a.studios && a.studios.some((s) => s.toLowerCase().includes(query)))
    );
  }

  // 2. Filtro Lógico por Tela / Perspectiva
  switch (filterType) {
    case "popular":
      return [...filtered].sort((a, b) => (b.score || 0) - (a.score || 0));

    case "releasing":
      return filtered.filter(
        (a) => a.status === "RELEASING" || a.status === "AIRING" || a.status === "CURRENT"
      );

    case "upcoming":
      return filtered.filter(
        (a) => a.status === "UPCOMING" || a.status === "NOT_YET_AIRED"
      );

    case "calendar":
      // Ordenação temporal / transmissões da semana
      return [...filtered].sort((a, b) => (b.year || 0) - (a.year || 0));

    case "franchises":
      // Obras que possuem identificador de universo ou sequências
      return filtered.filter((a) => a.universe_id || (a.episodes_count && a.episodes_count > 12));

    case "all":
    default:
      return filtered;
  }
}
