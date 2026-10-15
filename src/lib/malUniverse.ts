import { logServerFailure } from "./serverLog";
import { centralizedFetch } from "./requestCentralizer";
import { query, queryOne, ensurePostgresSchema } from "./postgres";
import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";

export interface MalAnimeRelation {
  relation: string; // e.g., "Sequel", "Prequel", "Side story", "Parent story", "Alternative version", "Spin-off"
  entry: Array<{
    mal_id: number;
    type: string; // "anime" or "manga"
    name: string;
    url: string;
  }>;
}

// In-memory cache for fast lookups during clustering
const malRelationsCache = new Map<number, MalAnimeRelation[]>();
const jevDecisionCache = new Map<string, boolean>();

// TypeSafe Jev Client initialization (falls back gracefully if TYPESAFE_API_KEY is omitted)
let jevClient: TypeSafeClient | null = null;
function getJevClient(): TypeSafeClient | null {
  if (jevClient) return jevClient;
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  try {
    jevClient = new TypeSafeClient({ apiKey });
    return jevClient;
  } catch (err) {
    logServerFailure("catalog", err, "relation-client-init");
    return null;
  }
}

/**
 * Fetches canonical franchise relations directly from MyAnimeList (via Jikan / local Postgres cache).
 * MyAnimeList maintains the definitive graph of anime universe relations (Prequel, Sequel, Side Story, Spin-off, etc.).
 */
export async function getMalAnimeRelations(malId: number): Promise<MalAnimeRelation[]> {
  if (!malId || malId <= 0) return [];
  if (malRelationsCache.has(malId)) {
    return malRelationsCache.get(malId)!;
  }

  await ensurePostgresSchema();

  // 1. Check local Postgres table mal_relations_cache
  try {
    const cachedRow = await queryOne<{ relations_json: any }>(
      "SELECT relations_json FROM mal_relations_cache WHERE mal_id = $1",
      [malId]
    );
    if (cachedRow && cachedRow.relations_json) {
      const rels: MalAnimeRelation[] = typeof cachedRow.relations_json === "string"
        ? JSON.parse(cachedRow.relations_json)
        : cachedRow.relations_json;
      malRelationsCache.set(malId, rels);
      return rels;
    }
  } catch {
    // Table might not exist yet, we create it below
  }

  // 2. Fetch from Jikan API v4 (official MyAnimeList mirror)
  try {
    const url = `https://api.jikan.moe/v4/anime/${malId}/relations`;
    const res = await centralizedFetch<{ data?: MalAnimeRelation[] }>(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      { ttlSeconds: 86400 * 7 } // 7 days cache
    );

    const relations = res?.data || [];
    malRelationsCache.set(malId, relations);

    // Save to PostgreSQL asynchronously
    (async () => {
      try {
        await query(
          `CREATE TABLE IF NOT EXISTS mal_relations_cache (
            mal_id INT PRIMARY KEY,
            relations_json JSONB NOT NULL,
            updated_at BIGINT NOT NULL
          )`
        );
        await query(
          `INSERT INTO mal_relations_cache (mal_id, relations_json, updated_at)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (mal_id) DO UPDATE SET
             relations_json = EXCLUDED.relations_json,
             updated_at = EXCLUDED.updated_at`,
          [malId, JSON.stringify(relations), Date.now()]
        );
      } catch (saveErr) {
        logServerFailure("catalog", saveErr, "mal-cache-write");
      }
    })();

    return relations;
  } catch (err) {
    // If rate limited or unavailable, return empty gracefully
    return [];
  }
}

/**
 * Checks if anime A and anime B are related in the official MyAnimeList graph.
 */
export async function areMalConnected(malIdA: number, malIdB: number): Promise<boolean> {
  if (!malIdA || !malIdB) return false;
  if (malIdA === malIdB) return true;

  const [relsA, relsB] = await Promise.all([
    getMalAnimeRelations(malIdA),
    getMalAnimeRelations(malIdB),
  ]);

  // Check if B appears in A's relations
  for (const rel of relsA) {
    if (rel.entry && Array.isArray(rel.entry)) {
      if (rel.entry.some((e) => e.type === "anime" && e.mal_id === malIdB)) {
        return true;
      }
    }
  }

  // Check if A appears in B's relations
  for (const rel of relsB) {
    if (rel.entry && Array.isArray(rel.entry)) {
      if (rel.entry.some((e) => e.type === "anime" && e.mal_id === malIdA)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Uses TypeSafe Jev (System One AI model) to make a calibrated, typed judgment
 * on whether two anime titles belong to the same franchise / universe.
 * If Jev is not configured or fails, falls back to deterministic NLP analysis.
 */
export async function judgeFranchiseRelationWithJev(
  parentTitle: string,
  animeTitle: string,
  extraContext?: {
    parentEnglish?: string;
    animeEnglish?: string;
    parentMalId?: number;
    animeMalId?: number;
  }
): Promise<boolean> {
  const cacheKey = `${parentTitle.trim().toLowerCase()} <=> ${animeTitle.trim().toLowerCase()}`;
  if (jevDecisionCache.has(cacheKey)) {
    return jevDecisionCache.get(cacheKey)!;
  }

  // 1. If we have MAL IDs and they are connected in MAL's official universe graph, it's 100% true!
  if (extraContext?.parentMalId && extraContext?.animeMalId) {
    const isConnected = await areMalConnected(extraContext.parentMalId, extraContext.animeMalId);
    if (isConnected) {
      jevDecisionCache.set(cacheKey, true);
      return true;
    }
  }

  const client = getJevClient();
  if (client) {
    try {
      const response = await client.systemOne({
        state: {
          instruction: "Determine if these two anime titles belong to the exact same anime franchise, universe, or story continuity (e.g. sequels, prequels, spin-offs, movies, alternative versions, specials, OVAs). Different franchises must NOT be merged.",
          parent_title_romaji: parentTitle,
          parent_title_english: extraContext?.parentEnglish || "",
          parent_mal_id: extraContext?.parentMalId || 0,
          candidate_title_romaji: animeTitle,
          candidate_title_english: extraContext?.animeEnglish || "",
          candidate_mal_id: extraContext?.animeMalId || 0,
        },
        questions: {
          sameFranchise: noul(
            "Do these two anime titles belong to the exact same franchise/universe?",
            {
              true: "They share the same story world, characters, or are seasons/movies/spin-offs of the same work (e.g. Naruto and Boruto, Re:Zero and Re:Zero S3, Fate/stay night and Fate/Zero)",
              false: "They are unrelated anime series.",
            }
          ),
        },
      });

      const pYes = response.answers.sameFranchise.noul;
      const isSame = pYes >= 0.65;
      jevDecisionCache.set(cacheKey, isSame);
      return isSame;
    } catch (jevErr) {
      logServerFailure("catalog", jevErr, "relation-judge");
    }
  }

  // Fallback: Deterministic token & universe similarity check
  const cleanA = parentTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanB = animeTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
  const isMatch = cleanA.includes(cleanB) || cleanB.includes(cleanA);
  jevDecisionCache.set(cacheKey, isMatch);
  return isMatch;
}
