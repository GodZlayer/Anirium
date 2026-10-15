import axios from "axios";
import { query, queryOne, ensurePostgresSchema } from "../src/lib/postgres";
import { resolvePortugueseTitle } from "../src/lib/portugueseTitles";

// Configurações
const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;
const ANILIST_URL = "https://graphql.anilist.co";
const JIKAN_BASE_URL = "https://api.jikan.moe/v4";

// Taxas de chamada respeitadas para evitar rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Interface para consulta ao TypeSafe Jev System One
async function callJevValidation(anime: {
  title: string;
  genres: string[];
  tags: string[];
  format: string;
  status: string;
  episodes: number;
}) {
  if (!TYPESAFE_API_KEY) return null;

  try {
    const res = await axios.post(
      "https://api.typesafe.ai/v1/systemone",
      {
        model: "jev-latest",
        state: {
          anime_title: anime.title,
          genres: anime.genres,
          tags: anime.tags.slice(0, 10),
          format: anime.format,
          status: anime.status,
          episodes: anime.episodes,
        },
        questions: [
          {
            name: "fidelity_score",
            question: "Quão fiel e canônica é a categorização desta obra perante o padrão enciclopédico de MyAnimeList?",
            type: "probability",
          },
          {
            name: "canonical_category",
            question: "Em qual sumário canônico esta obra se enquadra primariamente?",
            type: "choice",
            choices: ["popular", "seasonal", "upcoming", "catalog_archive"],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${TYPESAFE_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    return res.data;
  } catch (err: any) {
    // Falha silenciosa de enriquecimento sem travar a ingestão
    return null;
  }
}

// Extrator do nome da Franquia para agrupamento de universos
function extractFranchiseName(title: string): string {
  let clean = title
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
    .replace(/\s*\[.+?\].*$/g, "")
    .replace(/\s*:\s*.+$/, "")
    .replace(/\s*-\s*.+$/, "")
    .replace(/\s+(I{1,3}|IV|V|VI|VII|VIII|IX|X)\b/gi, "")
    .replace(/\s*\d+$/i, "")
    .trim();

  if (clean.length < 2) return title.trim();
  return clean;
}

function normalizeFormat(format?: string): string {
  const f = (format || "").toUpperCase();
  if (f === "MOVIE") return "MOVIE";
  if (f === "OVA" || f === "ONA") return "OVA";
  if (f === "SPECIAL" || f === "MUSIC") return "SPECIAL";
  return "TV";
}

const GRAPHQL_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
      total
    }
    media(type: ANIME, isAdult: false, sort: $sort) {
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
      popularity
      status
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
            externalLinks {
              site
              url
              type
            }
          }
        }
      }
    }
  }
}
`;

// Helper para salvar lote com integridade no PostgreSQL
async function saveAnimeBatch(mediaList: any[], category: string, jevSampleRate = 5) {
  let count = 0;
  const now = Date.now();

  for (let i = 0; i < mediaList.length; i++) {
    const m = mediaList[i];
    const romaji = m.title?.romaji;
    const english = m.title?.english;
    const native = m.title?.native;
    const ptTitle = resolvePortugueseTitle(romaji, english);

    const cover = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || "";
    const banner = m.bannerImage || cover;
    const cleanDesc = (m.description || "").replace(/<[^>]*>?/gm, "");

    const franchiseRoot = extractFranchiseName(romaji || english || "Anime");
    const universeId = franchiseRoot.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // Filtrar streaming links oficiais
    const cleanStreaming = (m.externalLinks || []).filter((link: any) => {
      const site = (link.site || "").toLowerCase();
      return (
        !site.includes("twitter") &&
        !site.includes("official site") &&
        !site.includes("instagram") &&
        !site.includes("tiktok") &&
        link.type !== "INFO" &&
        link.type !== "SOCIAL"
      );
    });

    // Construir lista de temporadas / relações da árvore da franquia
    const seasonsList: any[] = [
      {
        id: m.id,
        idMal: m.idMal,
        seasonNumber: 1,
        title: romaji || "Temporada Principal",
        title_english: english,
        format: normalizeFormat(m.format),
        episodes: m.episodes || (m.format === "MOVIE" ? 1 : 12),
        status: m.status || "FINISHED",
        year: m.seasonYear || m.startDate?.year,
        cover: cover,
        streaming_links: cleanStreaming,
      },
    ];

    if (m.relations?.edges) {
      for (const rel of m.relations.edges) {
        const node = rel.node;
        if (!node || node.type !== "ANIME") continue;
        const relType = (rel.relationType || "").toUpperCase();
        if (
          [
            "PREQUEL",
            "SEQUEL",
            "SIDE_STORY",
            "SPIN_OFF",
            "ALTERNATIVE",
            "SUMMARY",
            "PARENT",
          ].includes(relType)
        ) {
          if (!seasonsList.some((s) => s.id === node.id)) {
            seasonsList.push({
              id: node.id,
              idMal: node.idMal,
              seasonNumber: seasonsList.length + 1,
              title: node.title?.romaji || "Produção Relacionada",
              title_english: node.title?.english,
              format: normalizeFormat(node.format),
              episodes: node.episodes || (node.format === "MOVIE" ? 1 : 12),
              status: node.status || "FINISHED",
              year: node.seasonYear || node.startDate?.year,
              cover: node.coverImage?.large || cover,
              relationType: rel.relationType,
              streaming_links: [],
            });
          }
        }
      }
    }

    // Ordenar temporadas cronologicamente
    seasonsList.sort((a, b) => (a.year || 9999) - (b.year || 9999));
    seasonsList.forEach((s, idx) => (s.seasonNumber = idx + 1));

    // Validação amostral ou de cabeçalho com TypeSafe Jev
    let assignedCategory = category;
    if (i % jevSampleRate === 0) {
      const jevEval = await callJevValidation({
        title: romaji || english || "Anime",
        genres: m.genres || [],
        tags: (m.tags || []).map((t: any) => t.name),
        format: normalizeFormat(m.format),
        status: m.status || "FINISHED",
        episodes: m.episodes || 12,
      });

      if (jevEval?.answers?.canonical_category?.choice) {
        const choice = jevEval.answers.canonical_category.choice;
        if (choice === "seasonal") assignedCategory = "seasonal";
        else if (choice === "popular") assignedCategory = "popular";
        else if (choice === "upcoming") assignedCategory = "upcoming";
      }
    }

    // 1. Garantir Universo na anime_universes
    await query(
      `INSERT INTO anime_universes (id, display_name, root_mal_id, works_count, seasons_count, timeline_json, created_at, updated_at)
       VALUES ($1, $2, $3, 1, $4, $5::jsonb, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         seasons_count = GREATEST(anime_universes.seasons_count, EXCLUDED.seasons_count),
         timeline_json = EXCLUDED.timeline_json,
         updated_at = EXCLUDED.updated_at`,
      [
        universeId,
        franchiseRoot,
        m.id,
        seasonsList.length,
        JSON.stringify(seasonsList),
        now,
        now,
      ]
    );

    // 2. Inserir ou atualizar na anime_catalog
    const scoreVal = m.averageScore ? Math.round((m.averageScore / 10) * 10) / 10 : null;
    const imagesObj = {
      jpg: {
        image_url: cover,
        small_image_url: m.coverImage?.medium || cover,
        large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || cover,
      },
      webp: {
        image_url: cover,
        small_image_url: m.coverImage?.medium || cover,
        large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || cover,
      },
    };

    await query(
      `INSERT INTO anime_catalog (
        mal_id, id_mal, title, title_english, title_japanese, title_portuguese,
        synonyms_json, images_json, synopsis, score, popularity, episodes, status,
        category, genres_json, tags_json, studios_json, year, format, banner_image,
        streaming_links_json, seasons_json, universe_id, franchise_root, relation_type,
        next_airing_episode_json, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13,
        $14, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19, $20,
        $21::jsonb, $22::jsonb, $23, $24, 'MAIN',
        $25::jsonb, $26
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
        popularity = EXCLUDED.popularity,
        episodes = EXCLUDED.episodes,
        status = EXCLUDED.status,
        category = EXCLUDED.category,
        genres_json = EXCLUDED.genres_json,
        tags_json = EXCLUDED.tags_json,
        studios_json = EXCLUDED.studios_json,
        year = EXCLUDED.year,
        format = EXCLUDED.format,
        banner_image = EXCLUDED.banner_image,
        streaming_links_json = EXCLUDED.streaming_links_json,
        seasons_json = EXCLUDED.seasons_json,
        universe_id = EXCLUDED.universe_id,
        franchise_root = EXCLUDED.franchise_root,
        next_airing_episode_json = EXCLUDED.next_airing_episode_json,
        updated_at = EXCLUDED.updated_at`,
      [
        m.id,
        m.idMal || null,
        romaji || english || "Anime",
        english || null,
        native || null,
        ptTitle || null,
        JSON.stringify(m.synonyms || []),
        JSON.stringify(imagesObj),
        cleanDesc || null,
        scoreVal,
        m.popularity || null,
        m.episodes || null,
        m.status || "FINISHED",
        assignedCategory,
        JSON.stringify((m.genres || []).map((g: string, idx: number) => ({ mal_id: idx, name: g }))),
        JSON.stringify(m.tags || []),
        JSON.stringify((m.studios?.nodes || []).map((s: any, idx: number) => ({ mal_id: idx, name: s.name }))),
        m.seasonYear || m.startDate?.year || null,
        normalizeFormat(m.format),
        banner || null,
        JSON.stringify(cleanStreaming),
        JSON.stringify(seasonsList),
        universeId,
        franchiseRoot,
        m.nextAiringEpisode ? JSON.stringify(m.nextAiringEpisode) : null,
        now,
      ]
    );

    count++;
  }

  return count;
}

async function runCanonicalIngestion() {
  console.log("=================================================================");
  console.log("🚀 INICIANDO INGESTÃO MASSIVA DO CATÁLOGO CANÔNICO DO ANIRIUM");
  console.log("   - Fonte 1: AniList GraphQL (Relações genealógicas completas)");
  console.log("   - Fonte 2: MyAnimeList (MAL Jikan IDs & Scores)");
  console.log("   - Validador Semântico: TypeSafe Jev System One");
  console.log("   - Destino: PostgreSQL 16 (anirium_canonical)");
  console.log("=================================================================\n");

  await ensurePostgresSchema();

  // 1. POPULARES HISTÓRICOS & OBRAS-PRIMAS DO ANIME (Top 500 mais populares de todos os tempos)
  console.log("▶ [1/4] Baixando e indexando Obras Mais Populares da História...");
  for (let page = 1; page <= 10; page++) {
    try {
      const res = await axios.post(
        ANILIST_URL,
        {
          query: GRAPHQL_QUERY,
          variables: { page, perPage: 50, sort: ["POPULARITY_DESC"] },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );

      const media = res.data?.data?.Page?.media || [];
      if (media.length === 0) break;

      const saved = await saveAnimeBatch(media, "popular", 10);
      console.log(`  ✓ Página ${page}/10 concluída: ${saved} obras salvas no PostgreSQL.`);
      await sleep(700);
    } catch (err: any) {
      console.error(`  ✗ Erro na página ${page} (popular):`, err.message);
      await sleep(2000);
    }
  }

  // 2. TEMPORADA ATUAL (TODOS os animes em exibição no momento)
  console.log("\n▶ [2/4] Baixando e indexando Animes da Temporada em Exibição (Status RELEASING)...");
  for (let page = 1; page <= 6; page++) {
    try {
      const res = await axios.post(
        ANILIST_URL,
        {
          query: `
            query ($page: Int, $perPage: Int) {
              Page(page: $page, perPage: $perPage) {
                media(status: RELEASING, type: ANIME, isAdult: false, sort: [TRENDING_DESC]) {
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
                  popularity
                  status
                  seasonYear
                  startDate { year }
                  genres
                  tags { id name category }
                  studios(isMain: true) { nodes { name } }
                  externalLinks { id site url type language }
                  nextAiringEpisode { episode airingAt }
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
                        externalLinks { site url type }
                      }
                    }
                  }
                }
              }
            }
          `,
          variables: { page, perPage: 50 },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );

      const media = res.data?.data?.Page?.media || [];
      if (media.length === 0) break;

      const saved = await saveAnimeBatch(media, "seasonal", 5);
      console.log(`  ✓ Página ${page}/6 da temporada concluída: ${saved} animes processados.`);
      await sleep(700);
    } catch (err: any) {
      console.error(`  ✗ Erro na página ${page} (seasonal):`, err.message);
      await sleep(2000);
    }
  }

  // 3. PRÓXIMOS LANÇAMENTOS E ESTREIAS ANUNCIADAS (Status NOT_YET_RELEASED)
  console.log("\n▶ [3/4] Baixando e indexando Próximos Lançamentos e Anúncios Futuros...");
  for (let page = 1; page <= 4; page++) {
    try {
      const res = await axios.post(
        ANILIST_URL,
        {
          query: `
            query ($page: Int, $perPage: Int) {
              Page(page: $page, perPage: $perPage) {
                media(status: NOT_YET_RELEASED, type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) {
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
                  popularity
                  status
                  seasonYear
                  startDate { year }
                  genres
                  tags { id name category }
                  studios(isMain: true) { nodes { name } }
                  externalLinks { id site url type language }
                  nextAiringEpisode { episode airingAt }
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
                        externalLinks { site url type }
                      }
                    }
                  }
                }
              }
            }
          `,
          variables: { page, perPage: 50 },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );

      const media = res.data?.data?.Page?.media || [];
      if (media.length === 0) break;

      const saved = await saveAnimeBatch(media, "upcoming", 5);
      console.log(`  ✓ Página ${page}/4 futuros concluída: ${saved} animes registrados.`);
      await sleep(700);
    } catch (err: any) {
      console.error(`  ✗ Erro na página ${page} (upcoming):`, err.message);
      await sleep(2000);
    }
  }

  // 4. CROSS-CHECK COM TOP MAL (Jikan v4) PARA GARANTIR SCORES E NOTAS OFICIAIS MAL
  console.log("\n▶ [4/4] Sincronizando notas canônicas do MyAnimeList (MAL)...");
  try {
    const malRes = await axios.get(`${JIKAN_BASE_URL}/top/anime?limit=25`, {
      headers: { "User-Agent": "Anirium/1.0" },
      timeout: 10000,
    });

    const malList = malRes.data?.data || [];
    let updatedCount = 0;
    for (const item of malList) {
      if (item.mal_id && item.score) {
        await query(
          `UPDATE anime_catalog 
           SET score = $1, scored_by = $2 
           WHERE id_mal = $3 OR mal_id = $3 OR title ILIKE $4`,
          [item.score, item.scored_by || null, item.mal_id, `%${item.title}%`]
        );
        updatedCount++;
      }
    }
    console.log(`  ✓ ${updatedCount} animes calibrados com notas de topo do MyAnimeList.`);
  } catch (err: any) {
    console.warn("  ⚠ Atenção ao sincronizar MAL:", err.message);
  }

  // 5. RESUMO FINAL DO POSTGRESQL
  const countRow = await queryOne<{ total: string }>("SELECT COUNT(*) as total FROM anime_catalog");
  const universesRow = await queryOne<{ total: string }>("SELECT COUNT(*) as total FROM anime_universes");

  console.log("\n=================================================================");
  console.log("🎉 INGESTÃO CANÔNICA CONCLUÍDA COM SUCESSO!");
  console.log(`   - Total de Obras Registradas: ${countRow?.total} animes.`);
  console.log(`   - Franquias / Universos Estruturados: ${universesRow?.total} universos.`);
  console.log("=================================================================");

  process.exit(0);
}

runCanonicalIngestion().catch((err) => {
  console.error("Erro fatal na ingestão:", err);
  process.exit(1);
});
