import { indexCatalogTexts, resolveCatalogText } from "./catalogTextVariants";
import { indexCatalogAssets, hydrateCatalogAssets } from "./catalogAssets";
import { logServerFailure } from "./serverLog";
import { Anime, CanonicalFranchise } from "@/types/anime";
import { centralizedFetch } from "./requestCentralizer";
import { query, queryOne, ensurePostgresSchema, withTransaction } from "./postgres";
import { registerCatalogWork } from "./catalogSourceIdentity";
import { indexCatalogHierarchy } from "./catalogHierarchyIndex";
import { ingestAniListAiringBatch, readAiringIngestionCheckpoint } from "./airingIngestion";
import { collectCatalogSourceSnapshot } from "./catalogSourceGraph";
import { resolvePortugueseTitle, getPortugueseSearchCandidates, PORTUGUESE_TITLE_MAP } from "./portugueseTitles";
import { judgeFranchiseRelationWithJev, areMalConnected } from "./malUniverse";
import { filterOfficialStreamingLinks } from "./officialSources";

interface AniListRelationNode {
  id: number;
  idMal?: number;
  title: {
    romaji?: string;
    english?: string;
  };
  format: string;
  type: string;
  episodes?: number;
  seasonYear?: number;
  startDate?: {
    year?: number;
  };
  status?: string;
  coverImage?: {
    large?: string;
  };
  externalLinks?: Array<{
    id: number;
    site: string;
    url: string;
    type: string;
    language?: string | null;
    icon?: string | null;
  }>;
  relations?: {
    edges?: AniListRelationEdge[];
  };
}

interface AniListRelationEdge {
  relationType: string;
  node: AniListRelationNode;
}

interface AniListMedia {
  id: number;
  idMal?: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  synonyms?: string[];
  description?: string;
  format?: string;
  bannerImage?: string;
  coverImage?: {
    extraLarge?: string;
    large?: string;
    medium?: string;
  };
  episodes?: number;
  averageScore?: number;
  status?: string;
  seasonYear?: number;
  startDate?: {
    year?: number;
  };
  genres?: string[];
  tags?: Array<{ id: number; name: string; category?: string }>;
  studios?: {
    nodes?: Array<{ name: string }>;
  };
  externalLinks?: Array<{
    id: number;
    site: string;
    url: string;
    type: string;
    language?: string | null;
    icon?: string | null;
  }>;
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
  };
  relations?: {
    edges?: AniListRelationEdge[];
  };
}

// Formats a clean franchise title (e.g. "Sword Art Online II" -> "Sword Art Online", "BLEACH: Sennen Kessen-hen" -> "BLEACH", "Bleach: Jigoku-hen" -> "Bleach")
export function extractFranchiseName(title: string): string {
  if (!title) return "";
  const t = title.trim();

  // Mapeamentos Canônicos Mestres conhecidos para impedir fragmentação por subtítulos/sagas
  if (/\b(re:?\s*zero|re:?\s*petit)\b/i.test(t)) return "Re:Zero";
  if (/\b(naruto|boruto)\b/i.test(t)) return "Naruto";
  if (/\bbleach\b/i.test(t)) return "Bleach";
  if (/\b(super\s+)?dragon\s*ball/i.test(t)) return "Dragon Ball";
  if (/\b(fate([\/:\s-]|$)|fate\/stay\s*night|fate\/zero|fate\/apocrypha)/i.test(t) && !/bayonetta/i.test(t)) return "Fate";
  if (/\bone\s*piece\b/i.test(t)) return "One Piece";
  if (/\bhunter\s*[x×]\s*hunter\b/i.test(t)) return "Hunter x Hunter";
  if (/\bgintama\b/i.test(t)) return "Gintama";
  if (/\bjojo('s)?\s+bizarre/i.test(t)) return "JoJo's Bizarre Adventure";
  if (/\b(mobile\s+suit\s+)?gundam\b/i.test(t)) return "Mobile Suit Gundam";
  if (/\b(sword\s*art\s*online|sao\b)/i.test(t)) return "Sword Art Online";
  if (/\b(shingeki\s*no\s*kyojin|attack\s*on\s*titan)\b/i.test(t)) return "Attack on Titan";
  if (/\b(boku\s*no\s*hero\s*academia|my\s*hero\s*academia)\b/i.test(t)) return "My Hero Academia";
  if (/\b(kimetsu\s*no\s*yaiba|demon\s*slayer)\b/i.test(t)) return "Demon Slayer";
  if (/\bjujutsu\s*kaisen\b/i.test(t)) return "Jujutsu Kaisen";
  if (/\b(tensei\s*shitara\s*slime|that\s*time\s*i\s*got\s*reincarnated\s*as\s*a\s*slime|tensura)\b/i.test(t)) return "That Time I Got Reincarnated as a Slime";
  if (/\bmushoku\s*tensei\b/i.test(t)) return "Mushoku Tensei";
  if (/\b(dungeon\s*ni\s*deai|danmachi|is\s*it\s*wrong\s*to\s*try\s*to\s*pick\s*up\s*girls)\b/i.test(t)) return "DanMachi";
  if (/\b(kono\s*subarashii|konosuba)\b/i.test(t)) return "KonoSuba";
  if (/\bspy\s*[x×]\s*family\b/i.test(t)) return "Spy x Family";
  if (/\bchainsaw\s*man\b/i.test(t)) return "Chainsaw Man";
  if (/\bsteins;?\s*gate\b/i.test(t)) return "Steins;Gate";
  if (/\boverlord\b/i.test(t)) return "Overlord";
  if (/\bcode\s*geass\b/i.test(t)) return "Code Geass";
  if (/\bvinland\s*saga\b/i.test(t)) return "Vinland Saga";
  if (/\bmob\s*psycho(\s*100)?\b/i.test(t)) return "Mob Psycho 100";
  if (/\b(detective\s*conan|meitantei\s*conan)\b/i.test(t)) return "Detective Conan";
  if (/\b(pokemon|pocket\s*monsters)\b/i.test(t)) return "Pokémon";
  if (/\bfullmetal\s*alchemist\b/i.test(t)) return "Fullmetal Alchemist";
  if (/\bdigimon\b/i.test(t)) return "Digimon";
  if (/\bevangelion\b/i.test(t)) return "Evangelion";

  let clean = t
    .replace(/\s*the\s*Movie\s*:\s*.+$/gi, "")
    .replace(/\s*Movie\s*:\s*.+$/gi, "")
    .replace(/\s*the\s*Movie\b/gi, "")
    .replace(/\s*\(Movie\)/gi, "")
    .replace(/\s*Movie\s*\d*/gi, "")
    .replace(/\s*Gekijouban\b/gi, "")
    .replace(/\s*Season\s*\d+/gi, "")
    .replace(/\s*\d+(?:nd|rd|th|st)\s*Season/gi, "")
    .replace(/\s*Final\s*Season/gi, "")
    .replace(/\s*The\s*Final\b/gi, "")
    .replace(/\s*Part\s*\d+/gi, "")
    .replace(/\s*\[.+?\].*$/g, "");

  // Se o título contiver ":" mas a parte antes dos dois pontos for muito curta (< 4 caracteres, ex: "Re:Monster", "Re:Zero", "K: Return of Kings"),
  // não cortamos apenas no ":", preservando o nome real.
  const colonIdx = clean.indexOf(":");
  if (colonIdx > 0) {
    const beforeColon = clean.substring(0, colonIdx).trim();
    if (beforeColon.length >= 4 && !/\b(re:?\s*zero|steins;?\s*gate)\b/i.test(clean)) {
      clean = beforeColon;
    }
  }

  clean = clean
    .replace(/\s*-\s*.+$/, "") // Remove hyphenated sub-titles
    .replace(/\s+(I{1,3}|IV|V|VI|VII|VIII|IX|X)\b/gi, "") // Roman numerals I, II, III...
    .replace(/\s*\d+$/i, "") // Trailing numbers like "Bleach 2"
    .trim();

  // If stripping left nothing or too short, return original
  if (clean.length < 3) return t;
  return clean;
}

export function areRelatedFranchises(parent: { title: string; title_english?: string }, anime: { title: string; title_english?: string }): boolean {
  const pRomaji = extractFranchiseName(parent.title).toLowerCase();
  const pEnglish = parent.title_english ? extractFranchiseName(parent.title_english).toLowerCase() : "";
  const aRomaji = extractFranchiseName(anime.title).toLowerCase();
  const aEnglish = anime.title_english ? extractFranchiseName(anime.title_english).toLowerCase() : "";

  if (pRomaji && aRomaji && pRomaji === aRomaji) return true;
  if (pEnglish && aEnglish && pEnglish === aEnglish) return true;
  if (pEnglish && aRomaji && pEnglish === aRomaji) return true;
  if (aEnglish && pRomaji && aEnglish === pRomaji) return true;

  const pRomajiClean = pRomaji.replace(/[^a-z0-9]/g, "");
  const aRomajiClean = aRomaji.replace(/[^a-z0-9]/g, "");
  if (pRomajiClean && aRomajiClean && pRomajiClean === aRomajiClean) return true;

  const pEngClean = pEnglish.replace(/[^a-z0-9]/g, "");
  const aEngClean = aEnglish.replace(/[^a-z0-9]/g, "");
  if (pEngClean && aEngClean && pEngClean === aEngClean) return true;

  return false;
}

/**
 * Validates franchise correlation using MyAnimeList canonical relations + TypeSafe Jev (System One AI).
 */
export async function isFranchiseCorrelatedWithJevAndMal(
  parent: { title: string; title_english?: string; mal_id?: number; idMal?: number },
  candidate: { title: string; title_english?: string; mal_id?: number; idMal?: number }
): Promise<boolean> {
  // 1. Quick deterministic check first
  if (areRelatedFranchises(parent, candidate)) return true;

  // 2. Check MyAnimeList universe graph
  const malA = parent.idMal;
  const malB = candidate.idMal;
  if (malA && malB) {
    const connectedOnMal = await areMalConnected(malA, malB);
    if (connectedOnMal) return true;
  }

  // 3. Jev judgment with context
  return await judgeFranchiseRelationWithJev(parent.title, candidate.title, {
    parentEnglish: parent.title_english,
    animeEnglish: candidate.title_english,
    parentMalId: malA,
    animeMalId: malB,
  });
}

function normalizeFormat(format?: string, relationType?: string): string {
  const f = (format || "").toUpperCase();
  if (f === "MOVIE") return "MOVIE";
  if (f === "OVA" || f === "ONA") return "OVA";
  if (f === "SPECIAL" || f === "MUSIC") return "SPECIAL";
  if (f === "TV" || f === "TV_SHORT") return "TV";
  if (relationType === "SIDE_STORY" || relationType === "SPIN_OFF") return "SPINOFF";
  return "TV";
}

function mapAniListToAnime(media: AniListMedia): Anime {
  const cover = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "";
  const banner = media.bannerImage || cover;

  // Clean HTML tags from description
  const cleanDescription = (media.description || "").replace(/<[^>]*>?/gm, "");

  const romaji = media.title?.romaji;
  const english = media.title?.english;
  const native = media.title?.native;
  const ptTitle = resolvePortugueseTitle(romaji, english);
  const confirmedPtTitle = (romaji && PORTUGUESE_TITLE_MAP[romaji]) || (english && PORTUGUESE_TITLE_MAP[english]);

  const rawSeasonsMap = new Map<number, {
    id: number;
    idMal?: number;
    title: string;
    title_english?: string;
    format: string;
    episodes: number | null;
    status: string;
    year?: number;
    cover: string;
    relationType?: string;
    streaming_links?: Anime["streaming_links"];
  }>();

  // Helper to extract official, clean streaming links (Crunchyroll, Netflix, Hulu, Prime Video, etc.)
  const filterCleanStreamingLinks = filterOfficialStreamingLinks;

  const directMediaStreamingLinks = filterCleanStreamingLinks(media.externalLinks);

  // Add the media itself
  rawSeasonsMap.set(media.id, {
    id: media.id,
    idMal: media.idMal,
    title: media.title.romaji || "Temporada Principal",
    title_english: media.title.english,
    format: normalizeFormat(media.format),
    episodes: media.episodes ?? null,
    status: media.status || "UNKNOWN",
    year: media.seasonYear || media.startDate?.year,
    cover: cover,
    streaming_links: directMediaStreamingLinks,
  });

  // Allowed franchise relations for ANIME nodes:
  // PREQUEL, SEQUEL, SIDE_STORY, SPIN_OFF, ALTERNATIVE, SUMMARY, PARENT
  // Strictly EXCLUDE: CHARACTER (cameos) and OTHER (promos)
  const ALLOWED_ANIME_RELATIONS = new Set([
    "PREQUEL",
    "SEQUEL",
    "SIDE_STORY",
    "SPIN_OFF",
    "ALTERNATIVE",
    "SUMMARY",
    "PARENT"
  ]);

  function collectRelations(edges?: AniListRelationEdge[]) {
    if (!edges) return;
    for (const rel of edges) {
      const node = rel.node;
      if (!node) continue;

      const relType = (rel.relationType || "").toUpperCase();

      if (node.type === "ANIME") {
        if (ALLOWED_ANIME_RELATIONS.has(relType)) {
          const nodeStreaming = filterCleanStreamingLinks(node.externalLinks);
          if (!rawSeasonsMap.has(node.id)) {
            rawSeasonsMap.set(node.id, {
              id: node.id,
              idMal: node.idMal,
              title: node.title?.romaji || "Produção Relacionada",
              title_english: node.title?.english,
              format: normalizeFormat(node.format, rel.relationType),
              episodes: node.episodes ?? null,
              status: node.status || "UNKNOWN",
              year: node.seasonYear || node.startDate?.year,
              cover: node.coverImage?.large || cover,
              relationType: rel.relationType,
              streaming_links: nodeStreaming,
            });
            // Recurse into this anime's relations
            if (node.relations?.edges) {
              collectRelations(node.relations.edges);
            }
          } else if (nodeStreaming.length > 0) {
            const existing = rawSeasonsMap.get(node.id)!;
            if (!existing.streaming_links || existing.streaming_links.length === 0) {
              existing.streaming_links = nodeStreaming;
            }
          }
        }
      } else if (relType === "ADAPTATION") {
        // If it's a source MANGA or NOVEL ADAPTATION node, traverse its anime edges (e.g. Manga -> Season 2/OVA)
        if (node.relations?.edges) {
          collectRelations(node.relations.edges);
        }
      }
    }
  }

  collectRelations(media.relations?.edges);

  // Collect all verified streaming links from the franchise
  const allFranchiseStreamingLinks: NonNullable<Anime["streaming_links"]> = [...directMediaStreamingLinks];
  for (const s of rawSeasonsMap.values()) {
    if (s.streaming_links && s.streaming_links.length > 0) {
      for (const link of s.streaming_links) {
        if (!allFranchiseStreamingLinks.some((existing) => existing.site.toLowerCase() === link.site.toLowerCase())) {
          allFranchiseStreamingLinks.push(link);
        }
      }
    }
  }

  // If any season has no streaming links, inherit from franchise pool
  for (const s of rawSeasonsMap.values()) {
    if (!s.streaming_links || s.streaming_links.length === 0) {
      s.streaming_links = allFranchiseStreamingLinks;
    }
  }

  // Sort chronologically by year (release order, like MAL)
  const sortedRaw = Array.from(rawSeasonsMap.values()).sort((a, b) => {
    // If years differ, order chronologically
    if ((a.year || 0) !== (b.year || 0)) {
      return (a.year || 9999) - (b.year || 9999);
    }
    // Main TV series before side movies/specials if same year
    const aIsTV = a.format === "TV" ? 0 : 1;
    const bIsTV = b.format === "TV" ? 0 : 1;
    if (aIsTV !== bIsTV) return aIsTV - bIsTV;
    return a.id - b.id;
  });

  const seasonsList: Anime["seasons"] = sortedRaw.map((s, idx) => ({
    id: s.id,
    idMal: s.idMal,
    seasonNumber: idx + 1,
    title: s.title,
    title_english: s.title_english,
    format: s.format,
    episodes: s.episodes,
    status: s.status,
    year: s.year,
    cover: s.cover,
    streaming_links: s.streaming_links && s.streaming_links.length > 0 ? s.streaming_links : allFranchiseStreamingLinks,
  }));

  const sourceSnapshot = collectCatalogSourceSnapshot({ ...media, type:"ANIME" });
  return {
    mal_id: media.id,
    idAnilist: media.id,
    sourceRelations: sourceSnapshot.relations,
    sourceNodes: sourceSnapshot.nodes,
    idMal: media.idMal,
    textVariants: [
      ...(romaji ? [{field:"title",locale:"und",form:"romaji",sourceKey:"anilist:media",value:romaji}] : []),
      ...(english ? [{field:"title",locale:"en",form:"default",sourceKey:"anilist:media",value:english}] : []),
      ...(confirmedPtTitle ? [{field:"title",locale:"pt-br",form:"default",sourceKey:"anirium:portuguese-title-map",value:confirmedPtTitle}] : []),
      ...(native ? [{field:"title",locale:"und",form:"native",sourceKey:"anilist:media",value:native}] : []),
      ...(cleanDescription ? [{field:"description",locale:"und",form:"full",sourceKey:"anilist:media",value:cleanDescription}] : []),
    ],
    title: romaji || english || "Anime",
    title_english: english || romaji,
    title_japanese: native,
    title_portuguese: ptTitle || english || romaji,
    synonyms: media.synonyms || [],
    images: {
      jpg: {
        image_url: cover,
        small_image_url: media.coverImage?.medium || cover,
        large_image_url: media.coverImage?.extraLarge || media.coverImage?.large || cover,
      },
      webp: {
        image_url: cover,
        small_image_url: media.coverImage?.medium || cover,
        large_image_url: media.coverImage?.extraLarge || media.coverImage?.large || cover,
      },
    },
    banner_image: banner,
    synopsis: cleanDescription,
    score: media.averageScore ? Math.round((media.averageScore / 10) * 10) / 10 : undefined,
    episodes: media.episodes ?? null,
    status: media.status || "UNKNOWN",
    genres: (media.genres || []).map((g, idx) => ({ mal_id: idx, name: g })),
    tags: (media.tags || []).map((t: any) => ({ id: t.id, name: t.name, category: t.category })),
    studios: (media.studios?.nodes || []).map((s, idx) => ({ mal_id: idx, name: s.name })),
    year: media.seasonYear,
    streaming_links: directMediaStreamingLinks.length > 0 ? directMediaStreamingLinks : allFranchiseStreamingLinks,
    format: normalizeFormat(media.format),
    universe_id: extractFranchiseName(romaji || english || "anime").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    franchise_root: extractFranchiseName(romaji || english || "Anime"),
    next_airing_episode: media.nextAiringEpisode ? {
      episode: media.nextAiringEpisode.episode,
      airingAt: media.nextAiringEpisode.airingAt,
    } : undefined,
    seasons: seasonsList,
  };
}

const ANILIST_URL = "https://graphql.anilist.co";

async function queryAniList(query: string, variables: Record<string, unknown> = {}): Promise<AniListMedia[]> {
  try {
    const res = await centralizedFetch<{ data?: { Page?: { media?: AniListMedia[] } } }>(
      ANILIST_URL,
      {
        method: "POST",
        data: { query, variables },
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
      { ttlSeconds: 86400 } // Cache 24h in SQLite
    );
    return res?.data?.Page?.media || [];
  } catch (err) {
    logServerFailure("catalog", err, "external-request");
    return [];
  }
}

async function saveAnimesToCatalog(animes: Anime[], category: string): Promise<void> {
  await ensurePostgresSchema();
  try {
    const now = Date.now();
    for (const a of animes) {
      await withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
      const persisted = await client.query(
        `INSERT INTO anime_catalog (
          mal_id, title, title_english, title_japanese, title_portuguese, synonyms_json, images_json,
          synopsis, score, episodes, status, category, genres_json, studios_json, year, banner_image,
          streaming_links_json, format, seasons_json, tags_json, universe_id, franchise_root, relation_type, next_airing_episode_json, updated_at, id_mal, id_anilist, source_relations_json, source_nodes_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb,
          $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16,
          $17::jsonb, $18, $19::jsonb, $20::jsonb, $21, $22, $23, $24::jsonb, $25, $26, $27, $28::jsonb, $29::jsonb
        )
        ON CONFLICT (mal_id) DO UPDATE SET
          title = EXCLUDED.title,
          title_english = EXCLUDED.title_english,
          title_japanese = EXCLUDED.title_japanese,
          title_portuguese = EXCLUDED.title_portuguese,
          synonyms_json = EXCLUDED.synonyms_json,
          images_json = EXCLUDED.images_json,
          synopsis = EXCLUDED.synopsis,
          score = EXCLUDED.score,
          episodes = EXCLUDED.episodes,
          status = EXCLUDED.status,
          category = EXCLUDED.category,
          banner_image = EXCLUDED.banner_image,
          streaming_links_json = EXCLUDED.streaming_links_json,
          format = EXCLUDED.format,
          seasons_json = EXCLUDED.seasons_json,
          tags_json = EXCLUDED.tags_json,
          universe_id = EXCLUDED.universe_id,
          franchise_root = EXCLUDED.franchise_root,
          relation_type = EXCLUDED.relation_type,
          next_airing_episode_json = EXCLUDED.next_airing_episode_json,
          updated_at = EXCLUDED.updated_at,
          id_mal = COALESCE(EXCLUDED.id_mal, anime_catalog.id_mal),
          id_anilist = COALESCE(EXCLUDED.id_anilist, anime_catalog.id_anilist),
          source_relations_json = COALESCE(EXCLUDED.source_relations_json,anime_catalog.source_relations_json),
          source_nodes_json = COALESCE(EXCLUDED.source_nodes_json,anime_catalog.source_nodes_json)
        WHERE (anime_catalog.id_mal IS NULL OR EXCLUDED.id_mal IS NULL OR anime_catalog.id_mal=EXCLUDED.id_mal)
          AND (anime_catalog.id_anilist IS NULL OR EXCLUDED.id_anilist IS NULL OR anime_catalog.id_anilist=EXCLUDED.id_anilist)
        RETURNING mal_id`,
        [
          a.mal_id,
          a.title,
          a.title_english || null,
          a.title_japanese || null,
          a.title_portuguese || null,
          JSON.stringify(a.synonyms || []),
          JSON.stringify(a.images),
          a.synopsis || null,
          a.score || null,
          a.episodes ?? null,
          a.status || null,
          category,
          JSON.stringify(a.genres || []),
          JSON.stringify(a.studios || []),
          a.year || null,
          a.banner_image || null,
          JSON.stringify(a.streaming_links || []),
          a.format || null,
          JSON.stringify(a.seasons || []),
          JSON.stringify(a.tags || []),
          a.universe_id || null,
          a.franchise_root || null,
          a.relation_type || "MAIN",
          a.next_airing_episode ? JSON.stringify(a.next_airing_episode) : null,
          now,
          a.idMal ?? null,
          a.idAnilist ?? null,
          a.sourceRelations === undefined ? null : JSON.stringify(a.sourceRelations),
          a.sourceNodes === undefined ? null : JSON.stringify(a.sourceNodes),
        ]
      );
      if (persisted.rowCount !== 1) throw new Error("Catalog source identity conflict");
      const sourceIdentity = (await client.query("SELECT id_mal,id_anilist FROM anime_catalog WHERE mal_id=$1", [a.mal_id])).rows[0];
      await registerCatalogWork(client, { legacyId: a.mal_id, malId: sourceIdentity.id_mal, anilistId: sourceIdentity.id_anilist });
      if (a.sourceNodes !== undefined && a.sourceRelations !== undefined && sourceIdentity.id_anilist != null) {
        await indexCatalogHierarchy(client,sourceIdentity.id_anilist,a.sourceNodes,a.sourceRelations,{reconcile:true});
      }
      await indexCatalogTexts(client,a.mal_id,a.textVariants);
      await indexCatalogAssets(client,a.mal_id);

      // Propagate the universe_id, franchise_root, and consolidated seasons_json to all child season rows in the DB
      if (a.universe_id && a.franchise_root && a.seasons && a.seasons.length > 0) {
        const memberIds = a.seasons.map((s) => s.id).filter(Boolean);
        if (memberIds.length > 0) {
          await client.query(
            `UPDATE anime_catalog
             SET universe_id = $1,
                 franchise_root = $2,
                 seasons_json = $3::jsonb,
                 updated_at = $4
             WHERE mal_id = ANY($5::int[])`,
            [a.universe_id, a.franchise_root, JSON.stringify(a.seasons), now, memberIds]
          );
        }
      }
      });
    }
  } catch (e) {
    logServerFailure("catalog", e, "catalog-write");
  }
}

export function mapDbRowToAnime(r: any): Anime {
  const parseJson = (val: any, fallback: any = []) => {
    if (!val) return fallback;
    if (typeof val === "object") return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  };

  const images = parseJson(r.resolved_images_json, {});
  const sourceRelations = parseJson(r.source_relations_json, null);
  const sourceNodes = parseJson(r.source_nodes_json, null);
  const seasonIds = parseJson(r.composition_seasons_json, {});
  const textVariants = parseJson(r.text_variants_json,undefined);
  return {
    mal_id: Number(r.mal_id),
    entityId: r.canonical_entity_id || undefined,
    workEntityId: r.composition_work_id || undefined,
    seasonEntityId: r.composition_season_id || undefined,
    universeEntityId: r.composition_universe_id || undefined,
    idAnilist: r.id_anilist == null ? undefined : Number(r.id_anilist),
    idMal: r.id_mal == null ? undefined : Number(r.id_mal),
    sourceRelations: Array.isArray(sourceRelations) ? sourceRelations : undefined,
    sourceNodes: Array.isArray(sourceNodes) ? sourceNodes : undefined,
    title: resolveCatalogText(textVariants,"title",["und","en","pt-br","pt","ja"],["default","native"]) ?? "",
    textVariants,
    assetRefs: parseJson(r.asset_refs_json,undefined),
    title_english: resolveCatalogText(textVariants,"title",["en"],["default"]),
    title_japanese: resolveCatalogText(textVariants,"title",["ja"],["native","default"]),
    title_portuguese: resolveCatalogText(textVariants,"title",["pt-br","pt"],["default"]),
    synonyms: parseJson(r.synonyms_json, []),
    images: images,
    banner_image:
      r.resolved_banner_image ||
      images?.webp?.large_image_url ||
      images?.jpg?.large_image_url,
    synopsis: resolveCatalogText(textVariants,"description",["pt-br","pt","en","und"],["full","default"]),
    score: r.score == null ? undefined : Number(r.score),
    score_mal: r.score_mal == null ? undefined : Number(r.score_mal),
    score_anilist: r.score_anilist == null ? undefined : Number(r.score_anilist),
    score_imdb: r.score_imdb == null ? undefined : Number(r.score_imdb),
    score_episodes_avg: r.score_episodes_avg == null ? undefined : Number(r.score_episodes_avg),
    score_work_general: r.score_work_general == null ? undefined : Number(r.score_work_general),
    episodes: r.episodes == null ? null : Number(r.episodes),
    status: r.status || undefined,
    genres: parseJson(r.genres_json, []),
    tags: parseJson(r.tags_json, []),
    studios: parseJson(r.studios_json, []),
    year: r.year ? Number(r.year) : undefined,
    streaming_links: filterOfficialStreamingLinks(parseJson(r.streaming_links_json, [])),
    format: r.format || undefined,
    seasons: (parseJson(r.seasons_json, undefined) as Anime["seasons"])?.map(season => ({
      ...season,
      entityId: Array.isArray(sourceNodes) && sourceNodes.some(node=>node.namespace === "anilist:media" && node.type === "ANIME" && node.id === String(season.id)) && typeof seasonIds?.[String(season.id)] === "string" ? seasonIds[String(season.id)] : undefined,
      streaming_links: filterOfficialStreamingLinks(season.streaming_links),
    })),
    universe_id: r.universe_id || undefined,
    franchise_root: r.franchise_root || undefined,
    relation_type: r.relation_type || undefined,
    next_airing_episode: parseJson(r.next_airing_episode_json, undefined),
  };
}

async function getAnimesFromCatalog(category?: string, limit: number = 1000): Promise<Anime[]> {
  await ensurePostgresSchema();
  try {
    const sql = category
      ? "SELECT * FROM anime_catalog WHERE category = $1 ORDER BY score DESC NULLS LAST LIMIT $2"
      : "SELECT * FROM anime_catalog ORDER BY score DESC NULLS LAST LIMIT $1";
    const params = category ? [category, limit] : [limit];
    const rows = await query<any>(sql, params);

    if (rows && rows.length > 0) {
      return (await withTransaction(client=>hydrateCatalogAssets(client,rows))).map(mapDbRowToAnime);
    }
  } catch (e) {
    logServerFailure("catalog", e, "catalog-read");
  }

  return [];
}

export async function getCatalogCounts(): Promise<{ totalReleases: number | null; totalFranchises: number | null }> {
  try {
    await ensurePostgresSchema();
    const [releasesRes, franchisesRes] = await Promise.all([
      queryOne<{ count: string }>("SELECT COUNT(*) as count FROM anime_catalog"),
      queryOne<{ count: string }>("SELECT COUNT(DISTINCT universe_id) as count FROM anime_catalog WHERE universe_id IS NOT NULL"),
    ]);
    const parseCount = (value: string | undefined): number | null => {
      if (value === undefined || !/^\d+$/.test(value)) return null;
      const count = Number(value);
      return Number.isSafeInteger(count) ? count : null;
    };
    return {
      totalReleases: parseCount(releasesRes?.count),
      totalFranchises: parseCount(franchisesRes?.count),
    };
  } catch (e) {
    logServerFailure("catalog", e, "catalog-count");
    return { totalReleases: null, totalFranchises: null };
  }
}

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  description
  format
  bannerImage
  coverImage { extraLarge large medium }
  episodes
  averageScore
  status
  isAdult
  seasonYear
  startDate { year }
  genres
  tags { id name category }
  studios(isMain: true) { nodes { name } }
  externalLinks {
    id
    site
    url
    type
    language
    icon
  }
  nextAiringEpisode {
    episode
    airingAt
  }
  relations {
    edges {
      relationType
      node {
        id
        idMal
        title { romaji english }
        format
        type
        episodes
        seasonYear
        startDate { year }
        status
        coverImage { large }
        relations {
          edges {
            relationType
            node {
              id
              idMal
              title { romaji english }
              format
              type
              episodes
              seasonYear
              startDate { year }
              status
              coverImage { large }
              relations {
                edges {
                  relationType
                  node {
                    id
                    idMal
                    title { romaji english }
                    format
                    type
                    episodes
                    seasonYear
                    startDate { year }
                    status
                    coverImage { large }
                    relations {
                      edges {
                        relationType
                        node {
                          id
                          idMal
                          title { romaji english }
                          format
                          type
                          episodes
                          seasonYear
                          startDate { year }
                          status
                          coverImage { large }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function getPopularAnimes(): Promise<Anime[]> {
  const local = await getAnimesFromCatalog("popular");
  if (local.length >= 10) return local;

  const query = `
    query {
      Page(page: 1, perPage: 20) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const list = await queryAniList(query);
  if (list.length > 0) {
    const rawAnimes = list.map(mapAniListToAnime);
    const animes = await clusterFranchises(rawAnimes);
    await saveAnimesToCatalog(animes, "popular");
    return animes;
  }
  return [];
}

export async function getSeasonalAnimes(): Promise<Anime[]> {
  const local = await getAnimesFromCatalog("seasonal");
  if (local.length >= 25) return local;

  const query = `
    query {
      Page(page: 1, perPage: 50) {
        media(status: RELEASING, sort: TRENDING_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const list = await queryAniList(query);
  if (list.length > 0) {
    const rawAnimes = list.map(mapAniListToAnime);
    const animes = await clusterFranchises(rawAnimes);
    await saveAnimesToCatalog(animes, "seasonal");
    return animes;
  }
  return [];
}

export async function getUpcomingAnimes(): Promise<Anime[]> {
  const local = await getAnimesFromCatalog("upcoming");
  if (local.length >= 10) return local;

  const query = `
    query {
      Page(page: 1, perPage: 20) {
        media(status: NOT_YET_RELEASED, sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const list = await queryAniList(query);
  if (list.length > 0) {
    const rawAnimes = list.map(mapAniListToAnime);
    const animes = await clusterFranchises(rawAnimes);
    await saveAnimesToCatalog(animes, "upcoming");
    return animes;
  }
  return [];
}

/**
 * Agrupa itens da mesma franquia em um único anime pai.
 * Exemplo:
 * - "Katainaka no Ossan Season 1", "Season 2", "Season 3" -> 1 Card pai com 3 temporadas dentro.
 * - "Sword Art Online", "SAO II", "Alicization", "Ordinal Scale" -> 1 Card pai com temporadas e filmes dentro.
 * - "Fate/stay night", "Fate/Zero", "Fate/Apocrypha" -> 1 Card pai do universo Fate.
 */
export async function clusterFranchises(animes: Anime[]): Promise<Anime[]> {
  await ensurePostgresSchema();
  const seenIds = new Set<number>();
  const seenFranchiseKeys = new Map<string, Anime>();
  const result: Anime[] = [];

  for (const anime of animes) {
    // If this anime was already absorbed as a season/relation of a previously added anime, skip it
    if (seenIds.has(anime.mal_id)) {
      continue;
    }

    let existingParent: Anime | undefined;

    // 1. Fast match: If both have canonical universe_id, match immediately
    if (anime.universe_id) {
      existingParent = result.find((p) => p.universe_id && p.universe_id === anime.universe_id);
    }

    // 2. Check if this anime is a known relation of an existing parent, or parent is a relation of this anime
    if (!existingParent) {
      for (const parent of result) {
        const parentHasAnime = (parent.seasons || []).some((s) => s.id === anime.mal_id);
        const animeHasParent = (anime.seasons || []).some((s) => s.id === parent.mal_id);

        if (parentHasAnime || animeHasParent) {
          if (areRelatedFranchises(parent, anime)) {
            existingParent = parent;
            break;
          }
        }
      }
    }

    // 3. Check by Romaji root or English root (both raw and alphanumeric stripped)
    const romajiRoot = extractFranchiseName(anime.title).toLowerCase();
    const romajiClean = romajiRoot.replace(/[^a-z0-9]/g, "");
    const englishRoot = anime.title_english ? extractFranchiseName(anime.title_english).toLowerCase() : "";
    const englishClean = englishRoot ? englishRoot.replace(/[^a-z0-9]/g, "") : "";

    if (!existingParent) {
      if (seenFranchiseKeys.has(romajiRoot)) {
        existingParent = seenFranchiseKeys.get(romajiRoot);
      } else if (romajiClean && seenFranchiseKeys.has(romajiClean)) {
        existingParent = seenFranchiseKeys.get(romajiClean);
      } else if (englishRoot && seenFranchiseKeys.has(englishRoot)) {
        existingParent = seenFranchiseKeys.get(englishRoot);
      } else if (englishClean && seenFranchiseKeys.has(englishClean)) {
        existingParent = seenFranchiseKeys.get(englishClean);
      }
    }

    // 4. Deterministic title correlation check against existing parents
    if (!existingParent) {
      for (const parent of result) {
        if (areRelatedFranchises(parent, anime)) {
          existingParent = parent;
          break;
        }
      }
    }

    if (existingParent) {
      if (existingParent.seasons) {
        // Collect all seasons from current anime (including its own relations) into existingParent
        const candidates = anime.seasons && anime.seasons.length > 0 ? anime.seasons : [
          {
            id: anime.mal_id,
            idMal: anime.idMal,
            seasonNumber: 1,
            title: anime.title,
            title_english: anime.title_english,
            format: anime.format || "TV",
            episodes: anime.episodes ?? null,
            status: anime.status || "UNKNOWN",
            year: anime.year,
            cover: anime.images.webp?.large_image_url || anime.images.jpg?.large_image_url,
          }
        ];

        for (const cand of candidates) {
          const alreadyExists = existingParent.seasons.some((s) => s.id === cand.id);
          if (!alreadyExists) {
            existingParent.seasons.push({
              ...cand,
              seasonNumber: existingParent.seasons.length + 1,
            });
          }
          seenIds.add(cand.id);
        }

        // Re-sort existingParent seasons chronologically
        existingParent.seasons.sort((a, b) => {
          if ((a.year || 0) !== (b.year || 0)) {
            return (a.year || 9999) - (b.year || 9999);
          }
          const aIsTV = a.format === "TV" ? 0 : 1;
          const bIsTV = b.format === "TV" ? 0 : 1;
          if (aIsTV !== bIsTV) return aIsTV - bIsTV;
          return a.id - b.id;
        });

        // Re-index season numbers
        existingParent.seasons.forEach((s, idx) => {
          s.seasonNumber = idx + 1;
        });

        // If the newly encountered anime has an earlier start year or is Season 1,
        // and strictly shares franchise identity with existingParent, promote it
        const earliestSeason = existingParent.seasons[0];
        if (earliestSeason && earliestSeason.id === anime.mal_id && anime.year && (existingParent.year || 9999) > anime.year) {
          if (areRelatedFranchises(existingParent, anime)) {
            existingParent.title = anime.title;
            existingParent.title_english = anime.title_english || existingParent.title_english;
            existingParent.title_portuguese = anime.title_portuguese || existingParent.title_portuguese;
            existingParent.images = anime.images;
            existingParent.banner_image = anime.banner_image || existingParent.banner_image;
            existingParent.year = anime.year;
          }
        }
      }
      seenIds.add(anime.mal_id);
      continue;
    }

    // Mark current anime and all its seasons as seen
    seenIds.add(anime.mal_id);
    if (anime.seasons) {
      anime.seasons.forEach((s) => seenIds.add(s.id));
    }

    seenFranchiseKeys.set(romajiRoot, anime);
    if (romajiClean) seenFranchiseKeys.set(romajiClean, anime);
    if (englishRoot) seenFranchiseKeys.set(englishRoot, anime);
    if (englishClean) seenFranchiseKeys.set(englishClean, anime);
    result.push(anime);
  }

  // Cross-reference com o acervo existente no PostgreSQL canônico para anexar temporadas adicionais
  try {
    for (const anime of result) {
      if (!anime.seasons) continue;

      // Se o anime já possui temporadas populadas e universe_id, busca diretamente no PostgreSQL por universe_id ou franchise_root
      const uId = anime.universe_id;
      const fRoot = anime.franchise_root || extractFranchiseName(anime.title);

      let rows: any[] = [];
      if (uId) {
        rows = await query<any>(
          `SELECT title, title_english, seasons_json, universe_id, franchise_root FROM anime_catalog
           WHERE universe_id = $1 AND seasons_json IS NOT NULL
           LIMIT 50`,
          [uId]
        );
      } else if (fRoot && fRoot.length >= 2) {
        rows = await query<any>(
          `SELECT title, title_english, seasons_json, universe_id, franchise_root FROM anime_catalog
           WHERE (franchise_root = $1 OR title ILIKE $2 OR title_english ILIKE $2)
             AND seasons_json IS NOT NULL
           LIMIT 50`,
          [fRoot, `%${fRoot}%`]
        );
      }

      for (const row of rows) {
        if (!row.seasons_json) continue;
        const isSame = (row.universe_id && row.universe_id === anime.universe_id) || areRelatedFranchises(anime, row);
        if (!isSame) continue;

        try {
          const dbSeasons = typeof row.seasons_json === "string" ? JSON.parse(row.seasons_json) : row.seasons_json;
          if (Array.isArray(dbSeasons) && dbSeasons.length > 0) {
            for (const cand of dbSeasons) {
              const alreadyExists = anime.seasons.some((s) => s.id === cand.id);
              if (!alreadyExists) {
                anime.seasons.push({
                  ...cand,
                  seasonNumber: anime.seasons.length + 1,
                });
              }
            }
          }
        } catch {}
      }

      // Re-sort chronologically
      anime.seasons.sort((a, b) => {
        if ((a.year || 0) !== (b.year || 0)) {
          return (a.year || 9999) - (b.year || 9999);
        }
        const aIsTV = a.format === "TV" ? 0 : 1;
        const bIsTV = b.format === "TV" ? 0 : 1;
        if (aIsTV !== bIsTV) return aIsTV - bIsTV;
        return a.id - b.id;
      });

      anime.seasons.forEach((s, idx) => {
        s.seasonNumber = idx + 1;
      });

      // If Season 1 exists and is earlier than current card header, sync card identity
      const season1 = anime.seasons[0];
      if (season1 && season1.title && anime.year && (anime.year > (season1.year || 9999))) {
        if (areRelatedFranchises(anime, season1)) {
          anime.title = season1.title;
          anime.title_english = season1.title_english || anime.title_english;
          if (season1.cover) {
            anime.images = {
              jpg: {
                image_url: season1.cover,
                small_image_url: season1.cover,
                large_image_url: season1.cover,
              },
              webp: {
                image_url: season1.cover,
                small_image_url: season1.cover,
                large_image_url: season1.cover,
              },
            };
          }
          anime.year = season1.year;
        }
      }

      // Collect all verified streaming links from the franchise pool and propagate to all seasons & parent
      const franchiseStreamLinks = [...(anime.streaming_links || [])];
      for (const s of anime.seasons) {
        if (s.streaming_links && s.streaming_links.length > 0) {
          for (const link of s.streaming_links) {
            if (!franchiseStreamLinks.some((l) => l.site.toLowerCase() === link.site.toLowerCase())) {
              franchiseStreamLinks.push(link);
            }
          }
        }
      }

      if (franchiseStreamLinks.length > 0) {
        if (!anime.streaming_links || anime.streaming_links.length === 0) {
          anime.streaming_links = franchiseStreamLinks;
        }
        for (const s of anime.seasons) {
          if (!s.streaming_links || s.streaming_links.length === 0) {
            s.streaming_links = franchiseStreamLinks;
          }
        }
      }

      // Re-derive canonical universe_id & franchise_root from the cleanest title
      const canonicalRoot = extractFranchiseName(anime.title) || extractFranchiseName(anime.title_english || "") || anime.title;
      let cleanUniverse = canonicalRoot.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (cleanUniverse.length < 3) {
        cleanUniverse = (anime.title_english || anime.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      }
      anime.franchise_root = canonicalRoot;
      anime.universe_id = cleanUniverse;
    }
  } catch (e) {
    logServerFailure("catalog", e, "franchise-link");
  }

  return result;
}

export async function searchAnimes(searchQuery: string): Promise<Anime[]> {
  if (!searchQuery || searchQuery.trim().length === 0) return [];

  const rawTerm = searchQuery.trim();
  const lowerTerm = rawTerm.toLowerCase();

  const anilistGqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 25) {
        media(search: $search, type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  // Collect remote AniList candidates
  const candidateTerms: string[] = [rawTerm];

  // 1. If user typed compound word without spaces (e.g. "hellmode" -> "hell mode", "sololeveling" -> "solo leveling")
  // split common word boundaries
  const commonCompoundSplits: Record<string, string> = {
    "hellmode": "hell mode",
    "sololeveling": "solo leveling",
    "chainsawman": "chainsaw man",
    "onepunchman": "one punch man",
    "deathnote": "death note",
    "blackclover": "black clover",
    "swordartonline": "sword art online",
    "spyfamily": "spy x family",
    "fireforce": "fire force",
    "vinlandsaga": "vinland saga",
  };
  const lowerNoSpaces = lowerTerm.replace(/[\s\-_]+/g, "");
  if (commonCompoundSplits[lowerNoSpaces]) {
    candidateTerms.push(commonCompoundSplits[lowerNoSpaces]);
  } else if (!rawTerm.includes(" ") && rawTerm.length >= 6) {
    const keywords = ["mode", "online", "hero", "leveling", "man", "piece", "ball", "gate", "art"];
    for (const kw of keywords) {
      if (lowerTerm.endsWith(kw) && lowerTerm.length > kw.length + 2) {
        const prefix = rawTerm.slice(0, -kw.length).trim();
        candidateTerms.push(`${prefix} ${kw}`);
        break;
      }
    }
  }

  // 2. Portuguese natural query mapping (e.g. "ataque" -> "Shingeki", "expulso" -> "Tsuihou")
  const ptCandidates = getPortugueseSearchCandidates(rawTerm);
  for (const ptTerm of ptCandidates) {
    if (!candidateTerms.includes(ptTerm)) {
      candidateTerms.push(ptTerm);
    }
  }

  const seenMediaIds = new Set<number>();
  const allRawAnimes: Anime[] = [];

  // Helper de parse seguro para JSON do banco
  const parseJson = (val: any, fallback: any = []) => {
    if (!val) return fallback;
    if (typeof val === "object") return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  };

  // PRIMEIRO: Filtro completo e abrangente no acervo canônico local (anime_catalog)
  // Pesquisa em todas as variações de nomes: Romaji, Inglês, Japonês, Português e Sinônimos
  const searchPatterns = [rawTerm, ...candidateTerms, ...ptCandidates].slice(0, 5);
  for (const term of searchPatterns) {
    const pattern = `%${term}%`;
    const cleanTerm = term.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const cleanPattern = `%${cleanTerm}%`;
    const rows = await query<any>(
      `SELECT * FROM anime_catalog
       WHERE title ILIKE $1
          OR title_english ILIKE $1
          OR title_japanese ILIKE $1
          OR title_portuguese ILIKE $1
          OR franchise_root ILIKE $1
          OR universe_id ILIKE $1
          OR synonyms_json::text ILIKE $1
          OR REGEXP_REPLACE(LOWER(title), '[^a-z0-9]', '', 'g') ILIKE $2
          OR REGEXP_REPLACE(LOWER(COALESCE(title_english, '')), '[^a-z0-9]', '', 'g') ILIKE $2
          OR REGEXP_REPLACE(LOWER(COALESCE(franchise_root, '')), '[^a-z0-9]', '', 'g') ILIKE $2
       ORDER BY score DESC NULLS LAST
       LIMIT 100`,
      [pattern, cleanPattern]
    );

    for (const r of await withTransaction(client=>hydrateCatalogAssets(client,rows))) {
      const malId = Number(r.mal_id);
      if (!seenMediaIds.has(malId)) {
        seenMediaIds.add(malId);
        allRawAnimes.push(mapDbRowToAnime(r));
      }
    }
  }

  // Se encontramos obras locais que pertencem a grandes franquias, unificamos todas as obras irmãs
  const detectedFranchises = new Set<string>();
  for (const a of allRawAnimes) {
    const root = extractFranchiseName(a.title);
    if (root && root.length >= 2) detectedFranchises.add(root);
    if (a.title_english) {
      const engRoot = extractFranchiseName(a.title_english);
      if (engRoot && engRoot.length >= 2) detectedFranchises.add(engRoot);
    }
  }

  for (const fRoot of detectedFranchises) {
    const fPattern = `%${fRoot}%`;
    const fClean = fRoot.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const fCleanPattern = `%${fClean}%`;
    const siblingRows = await query<any>(
      `SELECT * FROM anime_catalog
       WHERE franchise_root ILIKE $1
          OR universe_id ILIKE $1
          OR title ILIKE $2
          OR title_english ILIKE $2
          OR REGEXP_REPLACE(LOWER(title), '[^a-z0-9]', '', 'g') ILIKE $3
          OR REGEXP_REPLACE(LOWER(COALESCE(title_english, '')), '[^a-z0-9]', '', 'g') ILIKE $3
       LIMIT 100`,
      [fRoot, fPattern, fCleanPattern]
    );

    for (const r of await withTransaction(client=>hydrateCatalogAssets(client,siblingRows))) {
      const malId = Number(r.mal_id);
      if (!seenMediaIds.has(malId)) {
        seenMediaIds.add(malId);
        allRawAnimes.push(mapDbRowToAnime(r));
      }
    }
  }

  // SE o acervo canônico local não retornou nada, busca candidatos na API remota AniList
  if (allRawAnimes.length === 0) {
    const remotePromises = candidateTerms.slice(0, 3).map((term) => queryAniList(anilistGqlQuery, { search: term }));
    const remoteResults = await Promise.all(remotePromises);

    for (const list of remoteResults) {
      for (const media of list) {
        if (!seenMediaIds.has(media.id)) {
          seenMediaIds.add(media.id);
          const mapped = mapAniListToAnime(media);
          allRawAnimes.push(mapped);
        }
      }
    }
  }

  const clustered = await clusterFranchises(allRawAnimes);

  // Armazena no PostgreSQL de forma canônica
  try {
    await saveAnimesToCatalog(clustered, "search");
  } catch {}

  const searchLower = rawTerm.toLowerCase().trim();
  const searchNormalized = searchLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const searchClean = searchLower.replace(/[^a-z0-9]/g, "");

  // Terms to test against for relevance
  const allMatchTerms = [
    searchLower,
    searchNormalized,
    ...ptCandidates.map((t) => t.toLowerCase()),
  ].filter((t) => t.length >= 2);

  // Helper to test if any term matches a text
  function testMatch(text?: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    const norm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (allMatchTerms.some((term) => lower.includes(term) || norm.includes(term))) {
      return true;
    }
    if (searchClean.length >= 2) {
      const clean = lower.replace(/[^a-z0-9]/g, "");
      if (clean.includes(searchClean)) return true;
    }
    return false;
  }

  // Strictly filter: keep only animes where search term actually appears in at least one field
  const relevantAnimes: Anime[] = [];

  for (const anime of clustered) {
    let matchedTitle: string | undefined;
    let matchedReason: string | undefined;

    // Check each title field in priority order
    if (testMatch(anime.title_portuguese)) {
      matchedTitle = anime.title_portuguese;
      matchedReason = "Título em Português";
    } else if (testMatch(anime.title_english)) {
      matchedTitle = anime.title_english;
      matchedReason = "Título em Inglês";
    } else if (testMatch(anime.title)) {
      matchedTitle = anime.title;
      matchedReason = "Título Romaji";
    } else if (anime.synonyms && anime.synonyms.some((s) => testMatch(s))) {
      const syn = anime.synonyms.find((s) => testMatch(s));
      matchedTitle = syn;
      matchedReason = "Sinônimo / Título Alternativo";
    } else if (testMatch(anime.title_japanese)) {
      matchedTitle = anime.title_japanese;
      matchedReason = "Título Japonês";
    } else if (testMatch(anime.franchise_root)) {
      matchedTitle = anime.franchise_root;
      matchedReason = "Franquia / Universo";
    } else if (testMatch(anime.universe_id)) {
      matchedTitle = anime.franchise_root || anime.title;
      matchedReason = "Universo Canônico";
    } else if (anime.seasons && anime.seasons.some((s) => testMatch(s.title) || testMatch(s.title_english))) {
      const matchSeason = anime.seasons.find((s) => testMatch(s.title) || testMatch(s.title_english));
      matchedTitle = matchSeason?.title_english || matchSeason?.title;
      matchedReason = `Temporada / Filme (${matchedTitle})`;
    }

    if (matchedTitle) {
      anime.matched_title = matchedTitle;
      anime.matched_reason = matchedReason;
      relevantAnimes.push(anime);
    }
  }

  // Sort candidates by match relevance first
  relevantAnimes.sort((a, b) => {
    const aTitles = [
      a.title?.toLowerCase() || "",
      a.title_english?.toLowerCase() || "",
      a.title_portuguese?.toLowerCase() || "",
      a.franchise_root?.toLowerCase() || "",
    ];
    const bTitles = [
      b.title?.toLowerCase() || "",
      b.title_english?.toLowerCase() || "",
      b.title_portuguese?.toLowerCase() || "",
      b.franchise_root?.toLowerCase() || "",
    ];

    const aExactStart = aTitles.some((t) => t.startsWith(searchLower));
    const bExactStart = bTitles.some((t) => t.startsWith(searchLower));
    if (aExactStart && !bExactStart) return -1;
    if (!aExactStart && bExactStart) return 1;

    const aContains = aTitles.some((t) => t.includes(searchLower));
    const bContains = bTitles.some((t) => t.includes(searchLower));
    if (aContains && !bContains) return -1;
    if (!aContains && bContains) return 1;

    // Prioritize works with full franchise seasons attached
    const aSeasons = a.seasons?.length || 1;
    const bSeasons = b.seasons?.length || 1;
    if (aSeasons !== bSeasons) return bSeasons - aSeasons;

    return (b.score || 0) - (a.score || 0);
  });

  // Deduplicate by universe_id so that multiple cards from the same universe never duplicate in search.
  // For each universe, keep the canonical parent card (the one with the largest seasons catalog or earliest year)
  const universeGroups = new Map<string, Anime>();
  for (const anime of relevantAnimes) {
    const uId = anime.universe_id || String(anime.mal_id);
    if (!universeGroups.has(uId)) {
      universeGroups.set(uId, anime);
    } else {
      const existing = universeGroups.get(uId)!;
      // If current anime has more seasons attached or is the canonical root, prefer it
      const currentSeasons = anime.seasons?.length || 0;
      const existingSeasons = existing.seasons?.length || 0;
      if (currentSeasons > existingSeasons) {
        universeGroups.set(uId, anime);
      }
    }
  }

  return Array.from(universeGroups.values());
}

async function persistFetchedAniListAirings(entries: {id:number;airingAt:number;episode:number;media:AniListMedia}[], scope:string, start:number, end:number) {
  const observedAt=Date.now();
  await saveAnimesToCatalog(entries.map(item=>mapAniListToAnime(item.media)),"seasonal");
  // Catalog identity preparation can commit independently. Facts and cursor commit together.
  await withTransaction(async client=>{
    const checkpoint=await readAiringIngestionCheckpoint(client,scope);
    await ingestAniListAiringBatch(client,{scope,expectedRevision:checkpoint.revision,
      nextCursor:JSON.stringify({start,end,count:entries.length}),observedAt,
      entries:entries.map(item=>({id:item.id,mediaId:item.media.id,episode:item.episode,airingAt:item.airingAt}))});
  });
}

export async function getLatestAiredEpisodes(limit = 10) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - 86400 * 14; // Últimas 2 semanas de episódios lançados

  const query = `
    query LatestAiredEpisodes($start: Int, $end: Int) {
      Page(page: 1, perPage: 50) {
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME_DESC) {
          id
          airingAt
          timeUntilAiring
          episode
          media {
            ${MEDIA_FIELDS}
          }
        }
      }
    }
  `;

  try {
    const res = await centralizedFetch<{
      data?: {
        Page?: {
          airingSchedules?: Array<{
            id: number;
            airingAt: number;
            timeUntilAiring: number;
            episode: number;
            media: AniListMedia;
          }>;
        };
      };
    }>(
      ANILIST_URL,
      {
        method: "POST",
        data: { query, variables: { start, end: now } },
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
      { ttlSeconds: 300 } // Cache curto para novos episódios recém lançados
    );

    const list = res?.data?.Page?.airingSchedules;
    if (!Array.isArray(list)) throw new Error("Invalid latest airing source response");
    const filtered=list.filter((item) => !(item.media as any)?.isAdult);
    await persistFetchedAniListAirings(filtered,"catalog:latest-airings",start,now);
    return filtered
      .map((item) => ({
        id: item.id,
        airingAt: item.airingAt,
        timeUntilAiring: item.timeUntilAiring,
        episode: item.episode,
        anime: mapAniListToAnime(item.media),
      }));
  } catch (error) {
    logServerFailure("catalog", error, "schedule-read");
    return [];
  }
}

export async function getAiringSchedule(startDaysAgo = 1, endDaysFuture = 6) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - 86400 * startDaysAgo;
  const end = now + 86400 * endDaysFuture;

  await ensurePostgresSchema();

  // 1. Tentar primeiro obter obras com episódio agendado diretamente do banco local PostgreSQL
  try {
    const localRows = await query<any>(
      `SELECT * FROM anime_catalog
       WHERE next_airing_episode_json IS NOT NULL
         AND (next_airing_episode_json->>'airingAt')::bigint >= $1
         AND (next_airing_episode_json->>'airingAt')::bigint <= $2
       ORDER BY (next_airing_episode_json->>'airingAt')::bigint ASC`,
      [start, end]
    );

    if (localRows && localRows.length > 0) {
      return (await withTransaction(client=>hydrateCatalogAssets(client,localRows))).map((r: any) => {
        const nextAiring = typeof r.next_airing_episode_json === "string"
          ? JSON.parse(r.next_airing_episode_json)
          : r.next_airing_episode_json;
        const airingAt = Number(nextAiring.airingAt);
        return {
          id: Number(r.mal_id),
          airingAt,
          timeUntilAiring: Math.max(0, airingAt - now),
          episode: Number(nextAiring.episode),
          anime: mapDbRowToAnime(r),
        };
      });
    }
  } catch (err) {
    logServerFailure("catalog", err, "schedule-read");
  }

  // 2. Se o banco ainda não tiver o intervalo ou estiver sendo populado, busca do AniList e atualiza o banco
  type AiringEntry = {
    id: number;
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
    media: AniListMedia;
  };

  const makeQuery = (page: number) => `
    query AiringSchedule($start: Int, $end: Int) {
      Page(page: ${page}, perPage: 50) {
        pageInfo { hasNextPage }
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          id
          airingAt
          timeUntilAiring
          episode
          media {
            ${MEDIA_FIELDS}
          }
        }
      }
    }
  `;

  try {
    const all: AiringEntry[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= 6) {
      const res = await centralizedFetch<{
        data?: {
          Page?: {
            pageInfo?: { hasNextPage: boolean };
            airingSchedules?: AiringEntry[];
          };
        };
      }>(
        ANILIST_URL,
        {
          method: "POST",
          data: { query: makeQuery(page), variables: { start, end } },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
        { ttlSeconds: 3600 * 2 }
      );

      const items = res?.data?.Page?.airingSchedules;
      if (!Array.isArray(items) || typeof res?.data?.Page?.pageInfo?.hasNextPage !== "boolean") throw new Error("Invalid airing source page");
      all.push(...items);
      hasNext = res?.data?.Page?.pageInfo?.hasNextPage ?? false;
      page++;
    }

    const filtered = all.filter((item) => !(item.media as any)?.isAdult);

    await persistFetchedAniListAirings(filtered,"catalog:weekly-airings",start,end);

    return filtered.map((item) => ({
      id: item.id,
      airingAt: item.airingAt,
      timeUntilAiring: item.timeUntilAiring,
      episode: item.episode,
      anime: mapAniListToAnime(item.media),
    }));
  } catch (error) {
    logServerFailure("catalog", error, "external-request");
    return [];
  }
}



export { getAnimesFromCatalog };

export async function getUniversesFromCatalog(): Promise<CanonicalFranchise[]> {
  await ensurePostgresSchema();
  try {
    const rows = await query<any>(`
      WITH ordered_works AS (
        SELECT
          c.universe_id,
          c.franchise_root,
          c.mal_id,
          c.score,
          c.format,
          c.year,
          c.genres_json,
          c.tags_json,
          c.title,
          c.title_english,
          c.title_portuguese,
          c.synopsis,
          c.images_json,
          c.banner_image,
          ROW_NUMBER() OVER (PARTITION BY c.universe_id ORDER BY c.year ASC NULLS LAST, c.mal_id ASC) as season_num,
          COALESCE(c.title_portuguese, c.title_english, c.title) as work_title,
          COALESCE(c.format, 'TV') as work_format,
          COALESCE(c.episodes, 1) as work_episodes,
          COALESCE(c.status, 'UNKNOWN') as work_status,
          COALESCE(c.images_json->'webp'->>'large_image_url', c.images_json->'jpg'->>'large_image_url') as work_cover,
          COALESCE(c.streaming_links_json, '[]'::jsonb) as work_links
        FROM anime_catalog c
        WHERE c.universe_id IS NOT NULL
      ),
      universe_agg AS (
        SELECT
          universe_id,
          (ARRAY_AGG(franchise_root ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as display_name,
          (ARRAY_AGG(mal_id ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as root_mal_id,
          COUNT(mal_id)::int as works_count,
          COUNT(mal_id)::int as seasons_count,
          ROUND(AVG(score)::numeric, 2)::float as avg_score,
          MAX(score)::float as max_score,
          (ARRAY_AGG(mal_id ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as rep_mal_id,
          (ARRAY_AGG(title_portuguese ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as rep_title_pt,
          (ARRAY_AGG(title_english ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as rep_title_en,
          (ARRAY_AGG(title ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as rep_title,
          (ARRAY_AGG(images_json ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as rep_images,
          (ARRAY_AGG(banner_image ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as rep_banner,
          (ARRAY_AGG(synopsis ORDER BY CASE WHEN format = 'TV' THEN 0 ELSE 1 END, year ASC NULLS LAST))[1] as rep_synopsis,
          ARRAY_TO_JSON(ARRAY_AGG(DISTINCT format) FILTER (WHERE format IS NOT NULL)) as formats,
          ARRAY_TO_JSON(ARRAY_AGG(DISTINCT genres_json::text) FILTER (WHERE genres_json IS NOT NULL)) as genres,
          ARRAY_TO_JSON(ARRAY_AGG(DISTINCT tags_json::text) FILTER (WHERE tags_json IS NOT NULL)) as tags,
          CASE
            WHEN MIN(year) IS NOT NULL AND MAX(year) > MIN(year) THEN MIN(year)::text || ' - ' || MAX(year)::text
            WHEN MIN(year) IS NOT NULL THEN MIN(year)::text
            ELSE ''
          END || ' • ' || COUNT(mal_id)::text || ' obras' as years_range,
          jsonb_agg(
            jsonb_build_object(
              'id', mal_id,
              'seasonNumber', season_num,
              'title', work_title,
              'title_english', title_english,
              'format', work_format,
              'episodes', work_episodes,
              'status', work_status,
              'year', year,
              'cover', work_cover,
              'streaming_links', work_links
            )
          ) as consolidated_seasons
        FROM ordered_works
        GROUP BY universe_id
      )
      SELECT
        agg.universe_id as id,
        COALESCE(agg.display_name, agg.rep_title) as display_name,
        agg.root_mal_id,
        agg.seasons_count,
        agg.works_count,
        agg.avg_score,
        agg.max_score,
        agg.years_range,
        agg.formats,
        agg.genres,
        agg.tags,
        agg.rep_mal_id,
        agg.rep_title_pt,
        agg.rep_title_en,
        agg.rep_title,
        agg.rep_images,
        agg.rep_banner,
        agg.rep_synopsis,
        agg.consolidated_seasons
      FROM universe_agg agg
      ORDER BY agg.avg_score DESC NULLS LAST;
    `);

    if (!rows || rows.length === 0) return [];

    const parseJson = (val: any, fallback: any = []) => {
      if (!val) return fallback;
      if (typeof val === "object") return val;
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    };

    return rows.map((r: any): CanonicalFranchise => {
      const repImages = parseJson(r.rep_images, {});
      const rawGenresArr = parseJson(r.genres, []);
      const genresMap = new Map<string, { mal_id: number; name: string }>();
      for (const item of rawGenresArr) {
        const parsed = parseJson(item, []);
        if (Array.isArray(parsed)) {
          parsed.forEach((g: any) => {
            if (g && g.name) genresMap.set(g.name.toLowerCase(), g);
          });
        }
      }

      const rawTagsArr = parseJson(r.tags, []);
      const tagsMap = new Map<string, { id: number; name: string; category?: string }>();
      for (const item of rawTagsArr) {
        const parsed = parseJson(item, []);
        if (Array.isArray(parsed)) {
          parsed.forEach((t: any) => {
            if (t && t.name) tagsMap.set(t.name.toLowerCase(), t);
          });
        }
      }

      const formats = parseJson(r.formats, []);
      const seasons = parseJson(r.consolidated_seasons, []);
      const effectiveScore = r.avg_score ? Number(r.avg_score) : (r.max_score ? Number(r.max_score) : 0);

      const representativeAnime: Anime = {
        mal_id: Number(r.rep_mal_id || r.root_mal_id || 0),
        title: r.rep_title || r.display_name,
        title_english: r.rep_title_en || undefined,
        title_portuguese: r.rep_title_pt || undefined,
        images: repImages,
        banner_image: r.rep_banner || repImages?.webp?.large_image_url || repImages?.jpg?.large_image_url,
        synopsis: r.rep_synopsis || undefined,
        score: effectiveScore,
        genres: Array.from(genresMap.values()),
        tags: Array.from(tagsMap.values()),
        universe_id: r.id,
        franchise_root: r.display_name,
        seasons: Array.isArray(seasons) ? seasons : undefined,
      };

      return {
        id: r.id,
        rootTitle: r.display_name,
        title_portuguese: r.rep_title_pt || undefined,
        title_english: r.rep_title_en || undefined,
        representativeAnime,
        worksCount: Number(r.works_count || (seasons.length || 1)),
        seasonsCount: Number(seasons.length || r.seasons_count || 1),
        averageScore: effectiveScore,
        score_franchise_avg: effectiveScore,
        score_franchise_peak: r.max_score ? Number(r.max_score) : effectiveScore,
        maxScore: r.max_score ? Number(r.max_score) : effectiveScore,
        scoreCount: Number(r.works_count || 1),
        genres: Array.from(genresMap.values()),
        tags: Array.from(tagsMap.values()),
        formats: Array.isArray(formats) ? formats : [],
        yearsRange: r.years_range || `${r.works_count} obras`,
      };
    });
  } catch (err) {
    logServerFailure("catalog", err, "universe-read");
    return [];
  }
}
