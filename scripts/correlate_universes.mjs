/**
 * correlate_universes.mjs
 * 
 * Script que percorre todo o acervo canônico local no PostgreSQL (11.898 animes),
 * utiliza os grafos de conexões oficiais do MyAnimeList (MAL) e as regras semânticas do TypeSafe Jev
 * para correlacionar todas as temporadas, filmes, OVAs e spin-offs em Universos Canônicos únicos.
 * 
 * Atualiza:
 * 1. anime_universes: IDs consolidados, timeline completa, contagem de obras e temporadas.
 * 2. anime_catalog: universe_id, franchise_root, seasons_json propagados para todas as obras irmãs.
 */

import pg from "/app/node_modules/pg/lib/index.js";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://anirium:anirium_secret_2026@localhost:5432/anirium_canonical",
});

function extractFranchiseName(title) {
  if (!title) return "";
  const t = title.trim();

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

  const colonIdx = clean.indexOf(":");
  if (colonIdx > 0) {
    const beforeColon = clean.substring(0, colonIdx).trim();
    if (beforeColon.length >= 4 && !/\b(re:?\s*zero|steins;?\s*gate)\b/i.test(clean)) {
      clean = beforeColon;
    }
  }

  clean = clean
    .replace(/\s*-\s*.+$/, "")
    .replace(/\s+(I{1,3}|IV|V|VI|VII|VIII|IX|X)\b/gi, "")
    .replace(/\s*\d+$/i, "")
    .trim();

  if (clean.length < 3) return t;
  return clean;
}

function normalizeFormat(format) {
  const f = (format || "").toUpperCase();
  if (f === "MOVIE") return "MOVIE";
  if (f === "OVA" || f === "ONA") return "OVA";
  if (f === "SPECIAL" || f === "MUSIC") return "SPECIAL";
  return "TV";
}

// Disjoint Set Union (Union-Find)
class DisjointSet {
  constructor() {
    this.parent = new Map();
  }
  find(i) {
    if (!this.parent.has(i)) {
      this.parent.set(i, i);
      return i;
    }
    if (this.parent.get(i) === i) return i;
    const root = this.find(this.parent.get(i));
    this.parent.set(i, root);
    return root;
  }
  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent.set(rootI, rootJ);
    }
  }
}

async function main() {
  console.log("=== INICIANDO CORRELAÇÃO TOTAL DE UNIVERSOS DO ANIRIUM (MAL + JEV) ===");
  const client = await pool.connect();

  try {
    // 1. Carrega todas as obras do catálogo
    console.log("▶ Carregando todo o acervo de anime_catalog...");
    const { rows: animes } = await client.query(`
      SELECT mal_id, id_mal, title, title_english, title_japanese, title_portuguese,
             format, year, score, banner_image, images_json, streaming_links_json, seasons_json
      FROM anime_catalog
      ORDER BY score DESC NULLS LAST, mal_id ASC
    `);
    console.log(`✓ Total de obras carregadas: ${animes.length}`);

    const animeById = new Map();
    const animeByMalId = new Map();
    const dsu = new DisjointSet();

    for (const a of animes) {
      animeById.set(a.mal_id, a);
      if (a.id_mal) animeByMalId.set(a.id_mal, a.mal_id);
    }

    // 2. Unir obras baseadas nas relações existentes em seasons_json (que vieram de AniList/MAL graph)
    console.log("▶ Conectando grafos através de relações já mapeadas (seasons_json)...");
    let relationsConnected = 0;
    for (const a of animes) {
      if (a.seasons_json) {
        let seasons = [];
        try {
          seasons = typeof a.seasons_json === "string" ? JSON.parse(a.seasons_json) : a.seasons_json;
        } catch {}

        if (Array.isArray(seasons)) {
          for (const s of seasons) {
            if (s.id && animeById.has(s.id)) {
              dsu.union(a.mal_id, s.id);
              relationsConnected++;
            }
            if (s.idMal && animeByMalId.has(s.idMal)) {
              const matchedId = animeByMalId.get(s.idMal);
              dsu.union(a.mal_id, matchedId);
              relationsConnected++;
            }
          }
        }
      }
    }
    console.log(`✓ Conexões de grafo aplicadas: ${relationsConnected}`);

    // 3. Unir obras baseadas no nome canônico da franquia (extractFranchiseName)
    console.log("▶ Agrupando franquias canônicas por identidade textual...");
    const franchiseMap = new Map();
    for (const a of animes) {
      const rootRomaji = extractFranchiseName(a.title).toLowerCase();
      const rootEnglish = a.title_english ? extractFranchiseName(a.title_english).toLowerCase() : "";

      const keys = [rootRomaji, rootEnglish].filter((k) => k && k.length >= 3);
      for (const k of keys) {
        if (!franchiseMap.has(k)) {
          franchiseMap.set(k, a.mal_id);
        } else {
          dsu.union(a.mal_id, franchiseMap.get(k));
        }
      }
    }

    // 4. Agrupar em componentes conexos (Universos)
    console.log("▶ Agrupando componentes conexos em Universos...");
    const clusters = new Map();
    for (const a of animes) {
      const rootId = dsu.find(a.mal_id);
      if (!clusters.has(rootId)) {
        clusters.set(rootId, []);
      }
      clusters.get(rootId).push(a);
    }
    console.log(`✓ Total de universos únicos canônicos identificados: ${clusters.size}`);

    // 5. Limpar anime_universes antigo para reconstruir de forma 100% íntegra
    console.log("▶ Limpando e preparando anime_universes...");
    await client.query("DELETE FROM anime_universes");

    // 6. Processar e salvar cada universo
    console.log("▶ Construindo timelines, temporadas e atualizando catálogo...");
    let processed = 0;
    const now = Date.now();

    for (const [rootId, members] of clusters.entries()) {
      // Determina obra principal do universo (mais antiga em ano ou maior score com TV format)
      members.sort((a, b) => {
        const aYear = a.year || 9999;
        const bYear = b.year || 9999;
        if (aYear !== bYear) return aYear - bYear;
        const aIsTV = a.format === "TV" ? 0 : 1;
        const bIsTV = b.format === "TV" ? 0 : 1;
        if (aIsTV !== bIsTV) return aIsTV - bIsTV;
        return (b.score || 0) - (a.score || 0);
      });

      const rootAnime = members[0];
      const displayName = extractFranchiseName(rootAnime.title) || extractFranchiseName(rootAnime.title_english || "") || rootAnime.title;
      
      let universeId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (universeId.length < 3) {
        universeId = (rootAnime.title_english || rootAnime.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      }
      if (universeId.length < 3) {
        universeId = `universe-${rootAnime.mal_id}`;
      }

      // Consolidar temporadas e streaming links
      const allStreamingLinks = [];
      for (const m of members) {
        let streamLinks = [];
        try {
          streamLinks = typeof m.streaming_links_json === "string" ? JSON.parse(m.streaming_links_json) : (m.streaming_links_json || []);
        } catch {}
        if (Array.isArray(streamLinks)) {
          for (const link of streamLinks) {
            if (link.site && !allStreamingLinks.some((l) => l.site.toLowerCase() === link.site.toLowerCase())) {
              allStreamingLinks.push(link);
            }
          }
        }
      }

      const seasonsList = members.map((m, idx) => {
        let parsedImages = {};
        try {
          parsedImages = typeof m.images_json === "string" ? JSON.parse(m.images_json) : (m.images_json || {});
        } catch {}
        const cover = parsedImages?.webp?.large_image_url || parsedImages?.jpg?.large_image_url || "";

        let streamLinks = [];
        try {
          streamLinks = typeof m.streaming_links_json === "string" ? JSON.parse(m.streaming_links_json) : (m.streaming_links_json || []);
        } catch {}

        return {
          id: m.mal_id,
          idMal: m.id_mal,
          seasonNumber: idx + 1,
          title: m.title,
          title_english: m.title_english,
          format: normalizeFormat(m.format),
          episodes: m.episodes || 12,
          year: m.year,
          cover: cover,
          streaming_links: (streamLinks && streamLinks.length > 0) ? streamLinks : allStreamingLinks,
        };
      });

      const seasonsJson = JSON.stringify(seasonsList);

      // Inserir em anime_universes
      await client.query(
        `INSERT INTO anime_universes (id, display_name, root_mal_id, works_count, seasons_count, timeline_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           root_mal_id = EXCLUDED.root_mal_id,
           works_count = EXCLUDED.works_count,
           seasons_count = EXCLUDED.seasons_count,
           timeline_json = EXCLUDED.timeline_json,
           updated_at = EXCLUDED.updated_at`,
        [universeId, displayName, rootAnime.mal_id, members.length, seasonsList.length, seasonsJson, now, now]
      );

      // Atualizar todas as obras do universo em lote no anime_catalog
      const memberIds = members.map((m) => m.mal_id);
      await client.query(
        `UPDATE anime_catalog
         SET universe_id = $1,
             franchise_root = $2,
             seasons_json = $3::jsonb,
             updated_at = $4
         WHERE mal_id = ANY($5::int[])`,
        [universeId, displayName, seasonsJson, now, memberIds]
      );

      processed++;
      if (processed % 1000 === 0 || processed === clusters.size) {
        console.log(`  Processados ${processed} de ${clusters.size} universos...`);
      }
    }

    console.log("✓ CORRELAÇÃO DE UNIVERSOS CONCLUÍDA COM SUCESSO!");
  } catch (err) {
    console.error("Erro durante correlação de universos:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
