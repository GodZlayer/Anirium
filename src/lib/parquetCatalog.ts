import { parquetRead } from "hyparquet";

export interface ParquetAnime {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  images_json: string;
  synopsis?: string | null;
  score?: number | null;
  popularity?: number | null;
  episodes?: number | null;
  status: string;
  category: string;
  genres_json: string;
  studios_json: string;
  year?: number | null;
  format: string;
  universe_id?: string | null;
  updated_at: number;
}

export interface CatalogSliceData {
  seasonal: any[];
  popular: any[];
  upcoming: any[];
  counts: {
    totalReleases: number;
    totalFranchises: number;
  };
}

// Cache em memória do cliente
let memoryCatalogCache: CatalogSliceData | null = null;

/**
 * Lê um arquivo Parquet do servidor/CDN via fetch de arrayBuffer
 * e converte as colunas em objetos formatados idênticos ao Anime de catálogo.
 */
export async function readParquetSlice(url: string): Promise<any[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Parquet] Falha ao carregar fatia ${url}: ${response.status}`);
      return [];
    }
    const arrayBuffer = await response.arrayBuffer();

    const items: any[] = [];
    await parquetRead({
      file: arrayBuffer,
      rowFormat: "object",
      onComplete: (rows) => {
        for (const record of rows) {
          let images = {};
          try {
            images = typeof record.images_json === "string" ? JSON.parse(record.images_json) : record.images_json;
          } catch {
            images = {};
          }

          let genres = [];
          try {
            genres = typeof record.genres_json === "string" ? JSON.parse(record.genres_json) : record.genres_json;
          } catch {
            genres = [];
          }

          let studios = [];
          try {
            studios = typeof record.studios_json === "string" ? JSON.parse(record.studios_json) : record.studios_json;
          } catch {
            studios = [];
          }

          items.push({
            mal_id: Number(record.mal_id),
            id_mal: Number(record.mal_id),
            title: String(record.title || ""),
            title_english: record.title_english ? String(record.title_english) : null,
            title_japanese: record.title_japanese ? String(record.title_japanese) : null,
            images,
            synopsis: record.synopsis ? String(record.synopsis) : "",
            score: record.score != null ? Number(record.score) : null,
            popularity: record.popularity != null ? Number(record.popularity) : null,
            episodes: record.episodes != null ? Number(record.episodes) : null,
            status: String(record.status || "FINISHED"),
            category: String(record.category || "catalog_archive"),
            genres: Array.isArray(genres) ? genres : [],
            studios: Array.isArray(studios) ? studios : [],
            year: record.year != null ? Number(record.year) : null,
            format: String(record.format || "TV"),
            universe_id: record.universe_id ? String(record.universe_id) : `mal-${record.mal_id}`,
            updated_at: Number(record.updated_at || Date.now())
          });
        }
      }
    });

    return items;
  } catch (err) {
    console.error(`[Parquet] Erro ao processar arquivo ${url}:`, err);
    return [];
  }
}

/**
 * Carrega e mescla o catálogo modular direto das fatias Parquet compactadas em /data/
 */
export async function getModularCatalogFromParquet(): Promise<CatalogSliceData> {
  if (memoryCatalogCache) {
    return memoryCatalogCache;
  }

  // Carrega fatias em paralelo com latência mínima
  const [popular, seasonal, upcoming, diff] = await Promise.all([
    readParquetSlice("/data/catalog-popular.parquet"),
    readParquetSlice("/data/catalog-seasonal.parquet"),
    readParquetSlice("/data/catalog-upcoming.parquet"),
    readParquetSlice("/data/catalog-diff.parquet")
  ]);

  // Se houver registros no diff (mutações recentes), sobrepõe nos populares/seasonal/upcoming
  if (diff.length > 0) {
    const diffMap = new Map(diff.map((item: any) => [item.mal_id, item]));
    const applyDiff = (list: any[]) =>
      list.map(item => (diffMap.has(item.mal_id) ? { ...item, ...diffMap.get(item.mal_id) } : item));

    const finalPopular = applyDiff(popular);
    const finalSeasonal = applyDiff(seasonal);
    const finalUpcoming = applyDiff(upcoming);

    memoryCatalogCache = {
      popular: finalPopular,
      seasonal: finalSeasonal,
      upcoming: finalUpcoming,
      counts: {
        totalReleases: 36552,
        totalFranchises: 30638
      }
    };
    return memoryCatalogCache;
  }

  memoryCatalogCache = {
    popular,
    seasonal,
    upcoming,
    counts: {
      totalReleases: 36552,
      totalFranchises: 30638
    }
  };

  return memoryCatalogCache;
}
