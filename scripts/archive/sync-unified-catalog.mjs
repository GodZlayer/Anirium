#!/usr/bin/env node
/**
 * Catálogo unificado: descoberta e detalhes MAL, relações verificadas,
 * guias AnimeFillerList e metadados de episódios AniZip.
 * Publica somente após validar identidades e reler integralmente o Parquet.
 * Não infere conclusão por ano nem episódios por semelhança de títulos em RSS.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { createHash } from "node:crypto";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { parseAniListResponse, assertDiscoveryAvailable } from "./catalog/anilist-response.mjs";
import { aniListRelations, reconcileUniverses } from "./catalog/universe-graph.mjs";
import { findFillerWork, validFillerRanges } from "./catalog/filler-identity.mjs";
import { discoverJikanCatalog } from "./catalog/jikan-discovery.mjs";
import { jikanRecord } from "./catalog/jikan-record.mjs";
import { createMalClient } from "./catalog/mal-client.mjs";
import { discoverMalCatalog } from "./catalog/mal-discovery.mjs";
import { discoverSeasonalCatalog } from "./catalog/seasonal-discovery.mjs";
import { discoveryWithFallback } from "./catalog/discovery-with-fallback.mjs";
import { malRecord } from "./catalog/mal-record.mjs";
import { catalogKey, entityMapKey } from "./catalog/catalog-identity.mjs";
import { publishCatalog } from "./catalog/publish-catalog.mjs";
import { verifyCatalogAssets } from "./catalog/verify-catalog-assets.mjs";
import { loadFillerSnapshot } from "./catalog/filler-snapshot-source.mjs";
import { applyFillerSnapshot } from "./catalog/filler-snapshot.mjs";
import { refreshMalDetailStage } from "./catalog/mal-detail-stage.mjs";
import { writeJson } from "./catalog/mal-detail-cache.mjs";
import { parseFillerGuide } from "./catalog/filler-guide.mjs";
import { refreshAniZipBatch, applyAniZipEpisodes } from "./catalog/anizip-batch.mjs";

const PARQUET_PATH = path.resolve("public/data/catalog.parquet");
throw new Error("Legacy identity writer disabled; use php artisan catalog:sync for the canonical SQL pipeline");
const OUTPUT_PATH = path.resolve(process.env.CATALOG_OUTPUT_PATH || PARQUET_PATH);

const DAYS_UTC = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function httpGet(url, accept = "application/json") {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        family: 4,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AniriumCatalogEngine/3.0",
          Accept: accept,
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          return httpGet(nextUrl, accept).then(resolve).catch(reject);
        }
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout GET ${url}`));
    });
  });
}

async function fetchJson(url) {
  const { status, body } = await httpGet(url, "application/json");
  if (status < 200 || status >= 300) {
    throw Object.assign(new Error(`HTTP ${status} from ${url}`), { status });
  }
  return JSON.parse(body);
}

function fetchGraphQL(query, variables) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request(
      "https://graphql.anilist.co",
      {
        method: "POST",
        family: 4,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "AniriumCatalogEngine/3.0",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(parseAniListResponse(res.statusCode, data));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("AniList request timed out")));
    req.write(body);
    req.end();
  });
}

const ANILIST_QUERY = `
query ($page: Int, $status: MediaStatus) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, status: $status, sort: POPULARITY_DESC) {
      id
      idMal
      title { romaji english native }
      description(asHtml: false)
      averageScore
      popularity
      episodes
      status
      format
      seasonYear
      coverImage { large extraLarge }
      bannerImage
      genres
      studios(isMain: true) { nodes { name } }
      nextAiringEpisode { airingAt episode }
      externalLinks { site url type }
      relations {
        edges {
          relationType(version: 2)
          node { id idMal type }
        }
      }
    }
  }
}
`;

async function fetchAnilistPages(status, maxPages = 6) {
  const results = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetchGraphQL(ANILIST_QUERY, { page, status });
      const pageObj = res?.data?.Page;
      const media = pageObj?.media || [];
      if (!media.length) break;
      results.push(...media);
      if (!pageObj?.pageInfo?.hasNextPage) break;
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      console.warn(`[AniList] Aviso (${status} p.${page}): ${err.message}`);
      break;
    }
  }
  return results;
}

/**
 * 3. Coleta de Fillers Reais: AnimeFillerList.com + MyAnimeList Episode Guides
 * Retorna lista de objetos { title, slug, fillerRanges: ["33", "64-108", ...] }
 */
const PRIORITY_FILLER_SLUGS = [
  { slug: "bleach", mal_id: 269 },
  { slug: "bleach-thousand-year-blood-war", mal_id: 41467 },
  { slug: "naruto", mal_id: 20 },
  { slug: "naruto-shippuden", mal_id: 1735 },
  { slug: "boruto-naruto-next-generations", mal_id: 34566 },
  { slug: "one-piece", mal_id: 21 },
  { slug: "dragon-ball", mal_id: 223 },
  { slug: "dragon-ball-z", mal_id: 813 },
  { slug: "dragon-ball-super", mal_id: 30694 },
  { slug: "dragon-ball-gt", mal_id: 225 },
  { slug: "black-clover", mal_id: 34572 },
  { slug: "fairy-tail", mal_id: 6702 },
  { slug: "hunter-x-hunter", mal_id: 11061 },
  { slug: "hunter-x-hunter-1999", mal_id: 136 },
  { slug: "detective-conan", mal_id: 235 },
  { slug: "gintama", mal_id: 918 },
  { slug: "inuyasha", mal_id: 249 },
  { slug: "yu-yu-hakusho", mal_id: 392 },
  { slug: "rurouni-kenshin", mal_id: 45 },
  { slug: "fullmetal-alchemist", mal_id: 121 },
  { slug: "fullmetal-alchemist-brotherhood", mal_id: 5114 },
  { slug: "soul-eater", mal_id: 3588 },
  { slug: "blue-exorcist", mal_id: 9919 },
  { slug: "katekyo-hitman-reborn", mal_id: 1604 },
  { slug: "toriko", mal_id: 10033 },
  { slug: "d-gray-man", mal_id: 1482 },
  { slug: "saint-seiya", mal_id: 1254 },
  { slug: "sailor-moon", mal_id: 530 },
  { slug: "Tokyo-Ghoul", mal_id: 22319 },
  { slug: "akame-ga-kill", mal_id: 22199 },
  { slug: "my-hero-academia", mal_id: 31964 },
  { slug: "attack-titan", mal_id: 16498 },
  { slug: "demon-slayer-kimetsu-no-yaiba", mal_id: 38000 },
  { slug: "jujutsu-kaisen", mal_id: 40748 },
  { slug: "chainsaw-man", mal_id: 44511 },
  { slug: "spy-x-family", mal_id: 50265 },
  { slug: "solo-leveling", mal_id: 52299 },
  { slug: "one-punch-man", mal_id: 30276 },
  { slug: "seven-deadly-sins", mal_id: 23755 },
  { slug: "sword-art-online", mal_id: 11757 },
  { slug: "haikyuu", mal_id: 20583 },
  { slug: "kurokos-basketball", mal_id: 11771 },
  { slug: "world-trigger", mal_id: 24405 },
  { slug: "jojos-bizarre-adventure", mal_id: 14719 },
  { slug: "mob-psycho-100", mal_id: 32182 },
  { slug: "dr-stone", mal_id: 38691 },
  { slug: "fire-force", mal_id: 38671 },
  { slug: "tokyo-revengers", mal_id: 42249 },
  { slug: "vinland-saga", mal_id: 37521 },
];

function extractAflRanges(html, divClass) {
  const regex = new RegExp(`<div class="${divClass}">[\\s\\S]*?<span class="Episodes">([\\s\\S]*?)<\\/span><\\/div>`, "i");
  const match = regex.exec(html);
  if (!match) return [];
  const raw = match[1].replace(/<[^>]*>/g, "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+(?:-\d+)?$/.test(s));
}

async function fetchAnimeFillerLists(entities) {
  const fillerMapByMalId = new Map();

  // Também descobre dinamicamente novos shows atualizados recentemente na capa da AnimeFillerList
  const dynamicSlugs = [...PRIORITY_FILLER_SLUGS];
  try {
    const { status, body } = await httpGet("https://www.animefillerlist.com/shows", "text/html");
    if (status === 200 && body) {
      const linkRegex = /<a href="\/shows\/([a-z0-9-]+)"[^>]*>([^<]+)<\/a>/gi;
      let m;
      const allEntities = Array.from(entities.values());
      while ((m = linkRegex.exec(body)) !== null && dynamicSlugs.length < 75) {
        const slug = m[1];
        const label = m[2].trim();
        if (dynamicSlugs.some((d) => d.slug.toLowerCase() === slug.toLowerCase())) continue;
        const found = findFillerWork(entities, label);
        if (found) {
          dynamicSlugs.push({ slug, mal_id: found.mal_id });
        }
      }
    }
  } catch {}

  // Busca em lotes concorrentes de 6 para ser rápido e respeitoso
  const batchSize = 6;
  for (let i = 0; i < dynamicSlugs.length; i += batchSize) {
    const slice = dynamicSlugs.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async ({ slug, mal_id }) => {
        try {
          const { status, body } = await httpGet(`https://www.animefillerlist.com/shows/${slug}`, "text/html");
          if (status !== 200 || !body) return;
          const guide = parseFillerGuide(body);
          if (!entities.has(mal_id) || !validFillerRanges(entities.get(mal_id), ...Object.values(guide))) return;
          if (Object.values(guide).some(ranges => ranges.length > 0)) {
            fillerMapByMalId.set(mal_id, {
              ...guide,
              source: "animefillerlist",
              source_url: `https://www.animefillerlist.com/shows/${slug}`,
              checked_at: new Date().toISOString(),
              mal_id,
            });
          }
        } catch {}
      })
    );
  }

  return fillerMapByMalId;
}

function resolveFranchiseUniverseId(media, entities, fallbackMalId) {
  const edges = media?.relations?.edges || [];
  for (const edge of edges) {
    const relType = String(edge?.relationType || "").toUpperCase();
    if (["PREQUEL", "PARENT", "SEQUEL", "SIDE_STORY", "MAIN_STORY"].includes(relType)) {
      const relatedMalId = edge?.node?.type === "ANIME" ? Number(edge?.node?.idMal || 0) : 0;
      if (relatedMalId && entities.has(relatedMalId)) {
        const existingUniv = entities.get(relatedMalId).universe_id;
        if (existingUniv) return existingUniv;
      }
    }
  }
  return `univ-${fallbackMalId}`;
}

async function main() {
  console.log(`=== [Anirium Multi-Source Auto-Sync] Lendo ${PARQUET_PATH} ===`);
  const snapshot = await loadCatalog(PARQUET_PATH);
  const existingRows = snapshot.rows;
  if (snapshot.recovered) console.warn("[Catálogo] Principal inválido ou ausente; usando cópia anterior validada.");
  if (snapshot.bootstrap) console.log("[Catálogo] Primeira carga: aguardando dados reais das fontes.");

  const entities = new Map();
  for (const r of existingRows) {
    const mid = Number(r.mal_id || r.id || 0);
    if (!mid) continue;
    entities.set(entityMapKey(r), {
      ...r,
      id: Number(r.id || mid),
      entity_type: String(r.entity_type || "WORK"),
      parent_id: String(r.parent_id || r.universe_id || `univ-${mid}`),
      mal_id: mid,
      title: r.title != null ? String(r.title) : "",
      title_english: r.title_english != null ? String(r.title_english) : null,
      title_japanese: r.title_japanese != null ? String(r.title_japanese) : null,
      title_portuguese: r.title_portuguese != null ? String(r.title_portuguese) : null,
      images_json: r.images_json != null ? String(r.images_json) : "{}",
      synopsis: r.synopsis != null ? String(r.synopsis) : null,
      score: r.score != null ? Number(r.score) : null,
      popularity: r.popularity != null ? Number(r.popularity) : null,
      episodes: r.episodes != null ? Number(r.episodes) : null,
      status: r.status != null ? String(r.status) : "COMPLETED",
      category: r.category != null ? String(r.category) : "all",
      genres_json: r.genres_json != null ? String(r.genres_json) : "[]",
      studios_json: r.studios_json != null ? String(r.studios_json) : "[]",
      year: r.year != null ? Number(r.year) : null,
      format: r.format != null ? String(r.format) : "TV",
      universe_id: r.universe_id != null ? String(r.universe_id) : `univ-${mid}`,
      updated_at: r.updated_at != null ? Number(r.updated_at) : Date.now(),
      latest_episode_num: r.latest_episode_num != null ? Number(r.latest_episode_num) : null,
      airing_day: r.airing_day != null ? String(r.airing_day) : null,
      airing_time: r.airing_time != null ? String(r.airing_time) : null,
      official_site_url: r.official_site_url != null ? String(r.official_site_url) : null,
      streaming_links_json: r.streaming_links_json != null ? String(r.streaming_links_json) : null,
      filler_episodes_json: r.filler_episodes_json != null ? String(r.filler_episodes_json) : null,
      relations_json: r.relations_json != null ? String(r.relations_json) : null,
      arcs_json: r.arcs_json != null ? String(r.arcs_json) : null,
      universe_source: r.universe_source != null ? String(r.universe_source) : "unverified",
    });
  }

  console.log(`[Multi-Source Sync] Base atual carregada: ${entities.size} entidades únicas (Identidade: mídia + MAL ID).`);

  const nowMs = Date.now();
  const releasingIdsSeen = new Set();
  let insertedCount = 0;
  let updatedCount = 0;

  // ============================================================================
  // ETAPA 1: DESCOBERTA SAZONAL E PRÓXIMOS LANÇAMENTOS
  console.log("[Multi-Source Sync] 1/5 Descobrindo temporadas atuais e futuras via Jikan...");
  const seasonalDiscovery = await discoverSeasonalCatalog(fetchJson);
  // ============================================================================
  // ETAPA 2: ENRIQUECIMENTO DE GRAFO & HORÁRIOS — AniList GraphQL (via idMal)
  // ============================================================================
  const officialMal = Boolean(process.env.MAL_CLIENT_ID);
  const malClientOptions = { cooldownFile: path.resolve("storage/app/catalog/myanimelist/source-cooldown.json") };
  console.log(`[Multi-Source Sync] 2/5 Descoberta ${officialMal ? "MAL oficial" : "MAL/Jikan"} com retomada por página...`);
  const discovery = await discoveryWithFallback(() => officialMal
    ? discoverMalCatalog(createMalClient(process.env.MAL_CLIENT_ID, malClientOptions))
    : discoverJikanCatalog(fetchJson), [...existingRows, ...seasonalDiscovery.records]);
  if (discovery.stale) console.warn(`[Descoberta] Atualização falhou (${discovery.error?.status ?? "rede/cache"}); ${discovery.completedAt ? `usando descoberta de ${discovery.completedAt}` : "enriquecendo somente o catálogo existente"}.`);
  let detailCoverage = null;
  if (officialMal && discovery.records.length) {
    const batch = await refreshMalDetailStage(discovery.records.map(record => ({ ...record, source_checked_at: discovery.completedAt })), createMalClient(process.env.MAL_CLIENT_ID, malClientOptions), {
      requestBudget: [401, 403].includes(discovery.error?.status) ? 0 : Number(process.env.MAL_DETAIL_BUDGET ?? 1000),
    });
    discovery.records = batch.records;
    detailCoverage = batch.coverage;
    if (detailCoverage.sourceError) console.warn(`[MAL detalhes] Acesso recusado (${detailCoverage.sourceError.status}); preservando cache e continuando demais fontes.`);
    console.log(`[MAL detalhes] ${detailCoverage.fresh} atuais, ${detailCoverage.stale} antigos, ${detailCoverage.missing} ausentes; carga ${detailCoverage.complete ? "completa" : "parcial"}.`);
  }
  const aniListEnabled = process.env.ANIRIUM_ANILIST_AUTHORIZED === "1";
  const releasingMedia = aniListEnabled ? await fetchAnilistPages("RELEASING", 8) : [];
  const upcomingMedia = aniListEnabled ? await fetchAnilistPages("NOT_YET_RELEASED", 4) : [];
  const finishedMedia = aniListEnabled ? await fetchAnilistPages("FINISHED", 3) : [];
  assertDiscoveryAvailable(discovery.records, seasonalDiscovery.records, releasingMedia, upcomingMedia, finishedMedia, existingRows);

  const anilistBatches = [
    ...seasonalDiscovery.records.map(jikanRecord),
    ...discovery.records.map(officialMal ? malRecord : jikanRecord),
    ...releasingMedia.map((m) => ({ m, mappedStatus: "RELEASING", defaultCat: "seasonal" })),
    ...upcomingMedia.map((m) => ({ m, mappedStatus: "NOT_YET_RELEASED", defaultCat: "upcoming" })),
    ...finishedMedia.map((m) => ({ m, mappedStatus: "COMPLETED", defaultCat: "popular" })),
  ];

  for (const { m, mappedStatus, defaultCat } of anilistBatches) {
    const malId = Number(m.idMal || 0);
    if (!malId) continue;

    if (mappedStatus === "RELEASING") {
      releasingIdsSeen.add(malId);
    }

    let airingDay = null;
    let airingTime = null;
    let latestEp = null;

    if (m.nextAiringEpisode?.airingAt) {
      const dt = new Date(Number(m.nextAiringEpisode.airingAt) * 1000);
      airingDay = DAYS_UTC[dt.getUTCDay()];
      airingTime = `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`;
    }
    if (m.nextAiringEpisode?.episode && Number(m.nextAiringEpisode.episode) > 1) {
      latestEp = Number(m.nextAiringEpisode.episode) - 1;
    }

    let officialUrl = null;
    const streamLinks = [];
    for (const l of m.externalLinks || []) {
      if (!l?.url) continue;
      if (l.site === "Official Site" || l.type === "INFO") {
        officialUrl = officialUrl || l.url;
      }
      if (["Crunchyroll", "Netflix", "Hulu", "Prime Video", "Disney Plus", "HIDIVE", "Bilibili TV", "YouTube"].includes(l.site)) {
        streamLinks.push({ site: l.site, url: l.url });
      }
    }

    const resolvedUniverseId = resolveFranchiseUniverseId(m, entities, malId);
    const score = m.averageScore ? Math.round((Number(m.averageScore) / 10) * 10) / 10 : null;

    if (entities.has(malId)) {
      const rec = entities.get(malId);
      rec.status = mappedStatus;
      if (m.sourceCheckedAt) rec.metadata_checked_at = m.sourceCheckedAt;
      if (m.metadataSource) rec.metadata_source = m.metadataSource;
      if (m.detailsState) rec.details_state = m.detailsState;
      if (m.detailsCheckedAt) rec.relations_checked_at = m.detailsCheckedAt;
      if (Array.isArray(m.officialRelations)) rec.relations_json = JSON.stringify(m.officialRelations);
      if (Array.isArray(m.relations?.edges)) rec.relations_json = JSON.stringify(aniListRelations(m));
      if (score !== null) rec.score = score;
      if (m.episodes != null) rec.episodes = Number(m.episodes);
      if (m.title?.romaji) rec.title = m.title.romaji;
      if (m.title?.english) rec.title_english = m.title.english;
      if (m.title?.native) rec.title_japanese = m.title.native;
      if (m.description) rec.synopsis = m.description.replace(/<[^>]*>/g, "");
      if (m.seasonYear != null) rec.year = Number(m.seasonYear);
      if (m.format) rec.format = m.format;
      if (m.popularity != null) rec.popularity = Number(m.popularity);
      if (latestEp !== null) rec.latest_episode_num = latestEp;
      if (airingDay && airingTime) {
        rec.airing_day = airingDay;
        rec.airing_time = airingTime;
      } else if (mappedStatus !== "RELEASING") {
        rec.airing_day = null;
        rec.airing_time = null;
      }
      if (rec.universe_id === `univ-${malId}` && resolvedUniverseId !== `univ-${malId}`) {
        rec.universe_id = resolvedUniverseId;
        rec.parent_id = resolvedUniverseId;
      }
      if (officialUrl) rec.official_site_url = officialUrl;
      if (streamLinks.length > 0) rec.streaming_links_json = JSON.stringify(streamLinks);
      if (m.officialPatch) Object.assign(rec, m.officialPatch);
      updatedCount++;
    } else {
      const cover = m.coverImage?.extraLarge || m.coverImage?.large || "";
      const imagesJson = JSON.stringify({
        jpg: { image_url: cover, large_image_url: cover, small_image_url: cover },
        webp: { image_url: cover, large_image_url: cover, small_image_url: cover },
      });
      const genresList = (m.genres || []).map((g, idx) => ({ name: g, mal_id: idx }));
      const studiosList = (m.studios?.nodes || []).filter((s) => s?.name).map((s, idx) => ({ name: s.name, mal_id: idx }));

      entities.set(malId, {
        id: malId,
        entity_type: "WORK",
        parent_id: resolvedUniverseId,
        mal_id: malId,
        title: m.title?.romaji || m.title?.english || `Anime #${malId}`,
        title_english: m.title?.english || null,
        title_japanese: m.title?.native || null,
        title_portuguese: null,
        images_json: imagesJson,
        synopsis: (m.description || "").replace(/<[^>]*>/g, ""),
        score,
        popularity: Number(m.popularity || 9999),
        episodes: m.episodes ? Number(m.episodes) : null,
        status: mappedStatus,
        category: defaultCat,
        genres_json: JSON.stringify(genresList),
        studios_json: JSON.stringify(studiosList),
        year: m.seasonYear != null ? Number(m.seasonYear) : null,
        format: String(m.format || "TV").toUpperCase(),
        universe_id: resolvedUniverseId,
        updated_at: nowMs,
        latest_episode_num: latestEp,
        airing_day: airingDay,
        airing_time: airingTime,
        official_site_url: officialUrl,
        streaming_links_json: streamLinks.length > 0 ? JSON.stringify(streamLinks) : null,
        filler_episodes_json: null,
        relations_json: Array.isArray(m.officialRelations) ? JSON.stringify(m.officialRelations) : Array.isArray(m.relations?.edges) ? JSON.stringify(aniListRelations(m)) : null,
        metadata_checked_at: m.sourceCheckedAt || null,
        metadata_source: m.metadataSource || null,
        details_state: m.detailsState || null,
        relations_checked_at: m.detailsCheckedAt || null,
        ...m.officialPatch,
      });
      insertedCount++;
    }
  }

  // ============================================================================
  // ETAPA 3: CANONICIDADE E FILLERS REAIS — AnimeFillerList.com
  // ============================================================================
  console.log("[Multi-Source Sync] 3/5 Sincronizando índices oficiais de Fillers e Cânone (AnimeFillerList.com)...");
  const fillerSnapshot = await loadFillerSnapshot();
  const fillerSnapshotCoverage = fillerSnapshot.snapshot
    ? applyFillerSnapshot([...entities.values()], fillerSnapshot.snapshot, fillerSnapshot.provenance) : null;
  const fillerMap = await fetchAnimeFillerLists(entities);
  let fillerEnrichedCount = 0;
  for (const [malId, fillerObj] of fillerMap.entries()) {
    if (entities.has(malId)) {
      entities.get(malId).filler_episodes_json = JSON.stringify(fillerObj);
      fillerEnrichedCount++;
    }
  }
  console.log(`[Multi-Source Sync] -> ${fillerEnrichedCount} obras enriquecidas com lista exata de episódios Filler/Mixed.`);

  // ============================================================================
  // ETAPA 4: TÍTULOS PT-BR & CONTAGEM DE EPISÓDIOS — AniZip Mappings (api.ani.zip)
  // ============================================================================
  console.log("[Multi-Source Sync] 4/5 Enriquecendo títulos localizados (PT-BR) e episódios via AniZip (api.ani.zip)...");
  const episodeBatch = await refreshAniZipBatch([...entities.values()], async url => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return fetchJson(url);
  }, { requestBudget: Number(process.env.EPISODE_DETAIL_BUDGET ?? 200) });
  const episodeCoverage = applyAniZipEpisodes(entities, episodeBatch, path.join(path.dirname(OUTPUT_PATH), "episodes/anime"));
  const anizipEnriched = episodeCoverage.publishedWorks;
  console.log('[Multi-Source Sync] 5/5 Reconciliando relações e validando publicação...');
  reconcileUniverses(entities);
  const allRows = Array.from(entities.values());
  for (const row of allRows) row.catalog_key = catalogKey(row);
  const verifiedAssets = verifyCatalogAssets(allRows, path.dirname(OUTPUT_PATH));
  await publishCatalog(allRows, existingRows, OUTPUT_PATH, { preservePrevious: snapshot.recovered && OUTPUT_PATH === PARQUET_PATH });
  writeJson(OUTPUT_PATH + ".status.json", { publishedAt: new Date().toISOString(), works: allRows.length,
    snapshotSha256: createHash("sha256").update(fs.readFileSync(OUTPUT_PATH)).digest("hex"),
    discoveryCheckedAt: discovery.completedAt, discoveryStale: discovery.stale === true,
    discoveryError: discovery.error ?? null, seasons: seasonalDiscovery.sources, details: detailCoverage, episodes: episodeCoverage,
    verifiedAssets, classificationSnapshot: { coverage: fillerSnapshotCoverage, stale: fillerSnapshot.stale,
      error: fillerSnapshot.error ?? null, provenance: fillerSnapshot.provenance ?? null }, catalogComplete: false });
  const sizeMb = (fs.statSync(OUTPUT_PATH).size / (1024 * 1024)).toFixed(2);

  console.log(
    `=== [Anirium Multi-Source Auto-Sync] Concluído: ${allRows.length} entidades | +${insertedCount} novas (MAL) | ${updatedCount} sincronizadas | ${fillerEnrichedCount} guias de fillers | ${anizipEnriched} AniZip | ${sizeMb} MB ===`
  );
}

main().catch((err) => {
  console.error("[Multi-Source Sync] Erro fatal:", err);
  process.exit(1);
});
