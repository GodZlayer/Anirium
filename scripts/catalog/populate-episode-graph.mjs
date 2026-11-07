// Popula o grafo Obra → Temporada → Episódio com veracidade e proveniência narrativa.
// Regras: só episódios já exibidos; classificação vem de fonte verificada; capítulo nunca é estimado.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadCatalog } from "./load-catalog.mjs";
import { SqlChildIdentities } from "./sql-child-identities.mjs";
import { SqlChildEpisodes } from "./sql-child-episodes.mjs";

const db = new DatabaseSync(path.resolve("database/database.sqlite"));
db.exec("PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;");
const MIGRATION = "2026_10_29_180000_create_catalog_episode_source_refs_table";

function ensureSchema() {
  db.exec(`CREATE TABLE IF NOT EXISTS "catalog_episode_source_refs" ("episode_id" varchar not null, "work_id" varchar not null,
    "provider" varchar not null, "basis" varchar not null default 'unknown', "source_work_id" varchar, "unit" varchar,
    "start_number" numeric, "end_number" numeric, "source_url" text, "checked_at" datetime not null,
    foreign key("source_work_id") references "catalog_works"("id") on delete restrict,
    foreign key("episode_id", "work_id") references "catalog_episodes"("id", "work_id") on delete restrict,
    primary key ("episode_id", "provider"));
    CREATE INDEX IF NOT EXISTS "catalog_episode_source_refs_source_work_id_start_number_index" on "catalog_episode_source_refs" ("source_work_id", "start_number");
    CREATE INDEX IF NOT EXISTS "catalog_episode_source_refs_work_id_basis_index" on "catalog_episode_source_refs" ("work_id", "basis");`);
  if (!db.prepare("SELECT 1 FROM migrations WHERE migration=?").get(MIGRATION)) {
    const batch = (db.prepare("SELECT max(batch) b FROM migrations").get().b || 0) + 1;
    db.prepare("INSERT INTO migrations(migration,batch) VALUES(?,?)").run(MIGRATION, batch);
  }
}

function fillerIndex() {
  const file = path.resolve("storage/app/catalog/snapshots/fillers-fillers.json");
  const snapshot = JSON.parse(fs.readFileSync(file, "utf-8")), index = new Map();
  for (const [mal, guide] of Object.entries(snapshot.shows)) {
    const byNumber = new Map();
    for (const basis of ["canon", "mixed", "filler", "anime_canon", "recap"]) for (const n of guide[basis] || []) if (!byNumber.has(n)) byNumber.set(n, basis);
    index.set(mal, { source: guide.source, episodes: guide.episodes, byNumber });
  }
  return { index, checkedAt: snapshot.generated };
}

function airedCount(work, latest, existingMax) {
  if (["COMPLETED", "FINISHED", "CANCELLED"].includes(work.status)) return work.episode_count || existingMax;
  if (work.status === "RELEASING") {
    const known = Number.isSafeInteger(latest) && latest > 0 ? latest : 0;
    const capped = work.episode_count ? Math.min(known, work.episode_count) : known;
    return Math.max(capped, existingMax);
  }
  return existingMax;
}

async function main() {
  const t0 = Date.now();
  ensureSchema();
  const catalog = await loadCatalog(path.resolve("public/data/catalog.parquet"));
  const latestByMal = new Map(catalog.rows.filter(r => r.entity_type !== "MANGA").map(r => [String(r.mal_id), Number(r.latest_episode_num)]));
  const fillers = fillerIndex();
  const identities = new SqlChildIdentities(db), episodes = new SqlChildEpisodes(db, identities);

  const works = db.prepare(`SELECT w.id, w.status, w.episode_count, (SELECT external_id FROM catalog_external_identities x WHERE x.entity_id=w.id AND x.provider='mal' AND x.namespace='anime:work') mal,
    (SELECT max(number) FROM catalog_episodes e WHERE e.work_id=w.id AND e.numbering_scheme='original') existing_max FROM catalog_works w WHERE w.media='anime'`).all();

  const aliases = db.prepare("SELECT alias FROM catalog_entity_aliases WHERE kind='work' AND entity_id=? ORDER BY alias");
  const sources = db.prepare(`SELECT DISTINCT t.id, t.media FROM catalog_work_relations r JOIN catalog_works t ON t.id=r.to_work_id
    WHERE r.from_work_id=? AND r.relation_type IN ('adaptation','source') AND t.media IN ('manga','novel')`);
  const ref = db.prepare(`INSERT INTO catalog_episode_source_refs(episode_id,work_id,provider,basis,source_work_id,source_url,checked_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(episode_id,provider) DO UPDATE SET basis=excluded.basis,source_work_id=excluded.source_work_id,source_url=excluded.source_url,checked_at=excluded.checked_at`);

  const classOf = { canon: "canon", mixed: "mixed", filler: "filler", anime_canon: "canon", recap: "unknown" };
  const basisOf = { canon: "adapted", mixed: "adapted", filler: "filler", anime_canon: "anime_original", recap: "recap" };
  const report = { works: works.length, worksWithEpisodes: 0, episodes: 0, classified: 0, refs: 0, skippedUnaired: 0, errors: [] };

  const LIMIT = Number(process.env.EPISODE_GRAPH_LIMIT || 0);
  const BATCH_SIZE = 50;
  let done = 0;
  console.log(`[EpisodeGraph] ${works.length} obras carregadas em ${((Date.now() - t0) / 1000).toFixed(1)}s (LIMIT=${LIMIT || 'ALL'})`);

  const started = Date.now();
  for (let i = 0; i < works.length; i += BATCH_SIZE) {
    if (LIMIT && done >= LIMIT) break;
    const chunk = works.slice(i, i + BATCH_SIZE);

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const work of chunk) {
        if (LIMIT && done >= LIMIT) break;
        done++;

        const total = airedCount(work, latestByMal.get(work.mal), work.existing_max || 0);
        if (!total) { report.skippedUnaired++; continue; }
        const names = aliases.all(work.id).map(a => a.alias);
        if (!names.length) { report.errors.push({ work: work.id, reason: "no-work-alias" }); continue; }

        const guide = work.mal ? fillers.index.get(work.mal) : null;
        const candidates = guide ? sources.all(work.id) : [];
        const manga = candidates.filter(c => c.media === "manga"), novels = candidates.filter(c => c.media === "novel");
        const sourceWork = manga.length === 1 ? manga[0].id : (!manga.length && novels.length === 1 ? novels[0].id : null);

        for (let n = 1; n <= total; n++) {
          const basis = guide?.byNumber.get(n);
          const id = episodes.write(work.id, { number: n, classification: basis ? classOf[basis] : "unknown" }, names);
          report.episodes++;
          if (basis) {
            report.classified++;
            ref.run(id, work.id, "animefillerlist", basisOf[basis], ["adapted"].includes(basisOf[basis]) ? sourceWork : null, guide.source, fillers.checkedAt);
            report.refs++;
          }
        }
        report.worksWithEpisodes++;
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      console.error(`[EpisodeGraph] Erro no lote iniciado na obra ${i}:`, err.message);
      report.errors.push({ batch: i, reason: err.message });
    }

    if (done % 200 === 0 || done >= (LIMIT || works.length)) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`[EpisodeGraph] ${done}/${works.length} obras · ${report.episodes} eps · ${report.classified} classificados · ${elapsed}s`);
    }
  }

  fs.mkdirSync(path.resolve("storage/app/catalog/reports"), { recursive: true });
  const out = path.resolve("storage/app/catalog/reports/episode-graph-report.json");
  fs.writeFileSync(out, JSON.stringify({ ...report, errorSample: report.errors.slice(0, 50), errors: report.errors.length }, null, 2));
  console.log(JSON.stringify({ ...report, errors: report.errors.length, report: out }));
}

main().catch(error => { console.error(error); process.exit(1); });
