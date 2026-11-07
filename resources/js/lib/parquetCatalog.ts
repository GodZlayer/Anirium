import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { catalogIdentity } from "./catalogIdentity.mjs";
import { catalogMetadata } from "./catalogMetadata.mjs";
import { readCatalogRelease } from "./catalogRelease.mjs";
import { createCatalogSnapshotCache } from "./catalogSnapshotCache.mjs";
import { createCatalogGenerationClient } from "./catalogGenerationClient.mjs";
import { catalogFetch } from "./catalogTransport.mjs";
import { catalogPreviewSelected } from "./catalogLocation.mjs";

export interface ParquetAnime {
  id: number;
  mal_id: number;
  catalog_key: string;
  entity_type: "WORK" | "MANGA";
  metadata_source?: string;
  episodes_metadata_url?: string;
  episodes_checked_at?: string;
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
  universe_source?: string;
  relations_json?: string | null;
  arcs_json?: string | null;
  cover_image: string;
  banner_image: string;
  updated_at?: number;
  latest_episode_num?: number;
  release?: { id: string; work_id: string; number: number; air_date_utc: string };
  airing_day?: string;
  airing_time?: string;
  airing_timezone?: string;
  official_site_url?: string;
  streaming_links?: Array<{ site: string; url: string }>;
  filler_episodes_json?: string | null;
}

export type UnifiedCatalogWork = Omit<ParquetAnime, "id" | "mal_id" | "entity_type"> & {
  id: number | string; mal_id: number | null; entity_type: "WORK" | "MANGA" | "NOVEL";
  catalog_visibility?: string; provider_health_json?: string;
  work_id?: string; account_reference?: string; aliases_json?: string; capabilities_json?: string;
  chapters_count?: number | null; volumes_count?: number | null; universe_v2_id?: string;
  universe_ids_json?: string; universe_identity_version?: number; universe_reconciliation_pending?: boolean; continuity_root_work_id?: string;
};

// O Catálogo Universal Único em Memória

// Dicionário canônico para mapping imediato de títulos em português
const PORTUGUESE_TITLE_MAP: Record<string, string> = {
  "Shingeki no Kyojin": "Ataque dos Titãs",
  "Attack on Titan": "Ataque dos Titãs",
  "Kimetsu no Yaiba": "Demon Slayer: Caçador de Demônios",
  "Demon Slayer: Kimetsu no Yaiba": "Demon Slayer: Caçador de Demônios",
  "Boku no Hero Academia": "My Hero Academia",
  "My Hero Academia": "My Hero Academia",
  "One Punch Man": "One-Punch Man: Homem de Um Soco Só",
  "Nanatsu no Taizai": "Os Sete Pecados Capitais",
  "The Seven Deadly Sins": "Os Sete Pecados Capitais",
  "Tensei shitara Slime Datta Ken": "Aquela Vez que Reencarnei como um Slime",
  "That Time I Got Reincarnated as a Slime": "Aquela Vez que Reencarnei como um Slime",
  "Kanojo, Okarishimasu": "Alugue uma Namorada",
  "Rent-a-Girlfriend": "Alugue uma Namorada",
  "Tate no Yuusha no Nariagari": "A Ascensão do Herói do Escudo",
  "The Rising of the Shield Hero": "A Ascensão do Herói do Escudo",
  "Enen no Shouboutai": "Fire Force",
  "Fire Force": "Fire Force",
  "Yakusoku no Neverland": "O Prometido Neverland",
  "The Promised Neverland": "O Prometido Neverland",
  "Kiseijuu: Sei no Kakuritsu": "Parasyte",
  "Parasyte -the maxim-": "Parasyte",
  "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen": "Kaguya-sama: Love Is War",
  "Kaguya-sama: Love is War": "Kaguya-sama: Love Is War",
  "Sousou no Frieren": "Frieren e a Jornada para o Além",
  "Frieren: Beyond Journey's End": "Frieren e a Jornada para o Além",
  "Kusuriya no Hitorigoto": "Diários de uma Apotecária",
  "The Apothecary Diaries": "Diários de uma Apotecária",
  "Jujutsu Kaisen": "Jujutsu Kaisen: Batalha de Feiticeiros",
  "Death Note": "Death Note: Caderno da Morte",
  "Hunter x Hunter": "Hunter x Hunter: Caçador vs Caçador",
  "Fullmetal Alchemist: Brotherhood": "Fullmetal Alchemist: O Alquimista de Aço",
  "Haikyuu!!": "Haikyu!! Os Ases do Vôlei",
  "Chainsaw Man": "Homem Motosserra",
  "Black Clover": "Trevo Negro",
  "Tokyo Revengers": "Vingadores de Tóquio",
  "Mushoku Tensei: Isekai Ittara Honki Dasu": "Mushoku Tensei: Reencarnação no Outro Mundo",
  "Dr. STONE": "Dr. Stone",
  "Vinland Saga": "Saga de Vinland",
  "Solo Leveling": "Solo Leveling: Subindo de Nível Sozinho",
  "Ore dake Level Up na Ken": "Solo Leveling: Subindo de Nível Sozinho",
  "Kaiju No. 8": "Kaiju Número 8",
  "SPY x FAMILY": "Spy x Family: Família de Espiões",
  "Bleach": "Bleach: Sociedade das Almas",
  "Naruto": "Naruto",
  "Naruto: Shippuuden": "Naruto Shippuden",
  "One Piece": "One Piece",
  "Dragon Ball Z": "Dragon Ball Z",
  "JoJo no Kimyou na Bouken": "As Aventuras Bizarras de JoJo",
  "JoJo's Bizarre Adventure": "As Aventuras Bizarras de JoJo",
};

export function normalizeCatalogWork(record: any): UnifiedCatalogWork {
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

  const toNames = (list: any[]): string[] =>
    list
      .map((item) => (typeof item === "string" ? item : item && typeof item.name === "string" ? item.name : ""))
      .filter(Boolean);

  let genres: string[] = [];
  if (Array.isArray(record.genres)) {
    genres = toNames(record.genres);
  } else if (typeof record.genres_json === "string") {
    try { genres = toNames(JSON.parse(record.genres_json)); } catch {}
  }

  let studios: string[] = [];
  if (Array.isArray(record.studios)) {
    studios = toNames(record.studios);
  } else if (typeof record.studios_json === "string") {
    try { studios = toNames(JSON.parse(record.studios_json)); } catch {}
  }

  const identity = catalogIdentity(record);
  const mal_id = identity.mal_id;
  const rawTitle = String(record.title || "");
  const rawEng = record.title_english ? String(record.title_english) : undefined;
  const mappedPt = PORTUGUESE_TITLE_MAP[rawTitle] || (rawEng ? PORTUGUESE_TITLE_MAP[rawEng] : undefined);

  return {
    ...identity,
    account_reference: record.account_reference,
    catalog_visibility: record.catalog_visibility,
    provider_health_json: record.provider_health_json,
    aliases_json: record.aliases_json,
    capabilities_json: record.capabilities_json,
    chapters_count: record.chapters_count,
    volumes_count: record.volumes_count,
    universe_v2_id: record.universe_v2_id,
    universe_ids_json: record.universe_ids_json,
    universe_identity_version: record.universe_identity_version,
    universe_reconciliation_pending: record.universe_reconciliation_pending,
    continuity_root_work_id: record.continuity_root_work_id,
    ...catalogMetadata(record, identity),
    release: readCatalogRelease(record.release, identity.work_id),
    metadata_source: typeof record.metadata_source === "string" ? record.metadata_source : undefined,
    episodes_metadata_url: typeof record.episodes_metadata_url === "string" ? record.episodes_metadata_url : undefined,
    episodes_checked_at: typeof record.episodes_checked_at === "string" ? record.episodes_checked_at : undefined,
    title: rawTitle,
    title_english: rawEng,
    title_japanese: record.title_japanese ? String(record.title_japanese) : undefined,
    title_portuguese: record.title_portuguese ? String(record.title_portuguese) : mappedPt,
    title_spanish: record.title_spanish ? String(record.title_spanish) : undefined,
    title_french: record.title_french ? String(record.title_french) : undefined,
    title_german: record.title_german ? String(record.title_german) : undefined,
    synopsis: record.synopsis ? String(record.synopsis) : "",
    synopses: record.synopses || (typeof record.synopses_json === "string" ? (() => { try { return JSON.parse(record.synopses_json); } catch { return undefined; } })() : undefined),
    score: record.score != null ? Number(record.score) : undefined,
    popularity: record.popularity != null ? Number(record.popularity) : undefined,
    category: record.category ? String(record.category) : "all",
    genres,
    studios: identity.entity_type !== "WORK" ? [] : studios,
    year: record.year != null ? Number(record.year) : undefined,
    universe_id: record.universe_id ? String(record.universe_id) : identity.catalog_key,
    universe_source: record.universe_source === "relations" ? "relations" : "unverified",
    relations_json: typeof record.relations_json === "string" ? record.relations_json : null,
    arcs_json: typeof record.arcs_json === "string" ? record.arcs_json : null,
    cover_image,
    banner_image,
    updated_at: record.updated_at ? Number(record.updated_at) : undefined,
    airing_day: record.airing_day ? String(record.airing_day) : undefined,
    airing_time: record.airing_time ? String(record.airing_time) : undefined,
    airing_timezone: record.airing_timezone === "UTC" ? "UTC" : undefined,
    official_site_url: record.official_site_url ? String(record.official_site_url) : undefined,
    streaming_links: Array.isArray(record.streaming_links)
      ? record.streaming_links
      : typeof record.streaming_links_json === "string"
      ? (() => {
          try {
            return JSON.parse(record.streaming_links_json);
          } catch {
            return undefined;
          }
        })()
      : undefined,
    filler_episodes_json: typeof record.filler_episodes_json === "string" ? record.filler_episodes_json : null,
  };
}

function normalizeAnime(record: any): ParquetAnime {
  const work = normalizeCatalogWork(record);
  if (typeof work.id !== "number" || !work.mal_id || work.entity_type === "NOVEL") throw new Error("Legacy catalog contains an unsupported identity");
  return work as ParquetAnime;
}

const generationClient = createCatalogGenerationClient({ request: catalogFetch, normalize: normalizeCatalogWork,
  onChange: () => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("anirium_generation_updated")); },
  resolveReference: async (reference: string) => {
    const response = await catalogFetch(`/api/catalog/work/${encodeURIComponent(reference)}`, { signal: AbortSignal.timeout(20000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Work lookup HTTP ${response.status}`);
    return response.json();
  }, decode: (file: ArrayBuffer) =>
  new Promise((resolve, reject) => { parquetRead({ file, compressors, rowFormat: "object", onComplete: resolve }).catch(reject); }) });

export async function resolveUnifiedWork(reference: string): Promise<UnifiedCatalogWork | null> {
  return generationClient.resolve(reference);
}

export async function refreshUnifiedCatalog(options: { signal?: AbortSignal } = {}): Promise<void> {
  await generationClient.refresh(options);
}

/**
 * Carrega a Base Única Canônica do arquivo catalog.parquet.
 * Zero fatiamento, zero duplicidades, tabela relacional única em memória.
 */
const catalogCache = createCatalogSnapshotCache(async () => {
  const response = await fetch("/data/catalog.parquet", { cache: "no-cache" });
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const items: ParquetAnime[] = [];
  await parquetRead({ file: arrayBuffer, compressors, rowFormat: "object", onComplete: rows => {
    for (const record of rows) items.push(normalizeAnime(record));
  } });
  if (new Set(items.map(item => item.catalog_key)).size !== items.length) throw new Error("Duplicate catalog identity");
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const revision = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  return { items, revision };
}, {
  onChange: (items: ParquetAnime[]) => {
    if (typeof window !== "undefined" && !catalogPreviewSelected()) window.dispatchEvent(new CustomEvent("anirium_catalog_expanded", { detail: items }));
  },
  onError: (error: Error) => console.error("[Universal Catalog]", error),
});

export async function getUniversalCatalog(force = false): Promise<ParquetAnime[]> {
  if (catalogPreviewSelected()) return [];
  return (await catalogCache.load(force)).items;
}

export function getCatalogRevision(): string | null { return catalogCache.revision(); }
const ADULT_RESTRICTED_GENRES = new Set(["hentai", "erotica", "rx"]);

/**
 * Identifica obras classificadas como Hentai / Erotica (+24 anos).
 * No modo sem conta (visitante / guest), nunca podem ser listadas nem acessadas,
 * pois não há como comprovar maioridade de +24 anos sem autenticação.
 */
export function isHentaiOrAdultAnime(anime: Pick<ParquetAnime, "genres" | "category"> | null | undefined): boolean {
  if (!anime) return false;
  if (anime.category && ADULT_RESTRICTED_GENRES.has(anime.category.toLowerCase().trim())) {
    return true;
  }
  return (anime.genres || []).some((g) => ADULT_RESTRICTED_GENRES.has(String(g).toLowerCase().trim()));
}

/**
 * Filtros puros aplicados sobre o catálogo universal único
 */
export function filterCatalog<T extends UnifiedCatalogWork>(
  catalog: T[],
  filterType: "all" | "popular" | "releasing" | "upcoming" | "calendar" | "franchises",
  searchQuery?: string,
  allowAdult = false
): T[] {
  // 0. Trava de Segurança Etária (+24): se allowAdult for false (modo sem conta ou filtro +24 desativado), remove 100% dos Hentais/Erotica
  let filtered = allowAdult ? catalog : catalog.filter((a) => !isHentaiOrAdultAnime(a));

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
      // Anirium exibe apenas animações com episódios lançados até o exato segundo presente (release_at <= now())
      const now = Date.now();
      const sortedReleasing = [...filtered]
        .filter(
          (a) =>
            (a.status === "RELEASING" || a.status === "AIRING" || a.status === "CURRENT") &&
            a.format !== "MANGA" &&
            a.format !== "NOVEL" &&
            a.format !== "ONE_SHOT" &&
            a.format !== "DOUJINSHI" &&
            a.format !== "MANHWA" &&
            a.format !== "MANHUA" &&
            (Number(a.updated_at) || 0) <= now
        )
        .sort((a, b) => (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0) || (b.year || 0) - (a.year || 0));

      return sortedReleasing;

    case "upcoming":
      return filtered.filter(
        (a) =>
          (a.status === "UPCOMING" ||
            a.status === "NOT_YET_AIRED" ||
            a.status === "NOT_YET_RELEASED") &&
          a.format !== "MANGA" &&
          a.format !== "NOVEL" &&
          a.format !== "ONE_SHOT"
      );

    case "calendar":
      // Todas as obras de animação ativas no ciclo de transmissão semanal
      return [...filtered].filter(
        (a) =>
          (a.status === "RELEASING" || a.status === "AIRING" || a.status === "CURRENT") &&
          a.format !== "MANGA" &&
          a.format !== "NOVEL" &&
          a.format !== "ONE_SHOT" &&
          a.format !== "DOUJINSHI" &&
          a.format !== "MANHWA" &&
          a.format !== "MANHUA"
      );

    case "franchises":
      // Obras que possuem identificador de universo ou sequências
      return filtered.filter((a) => a.universe_source === "relations" && a.universe_id);

    case "all":
    default:
      return filtered;
  }
}
