import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadCatalog } from "./load-catalog.mjs";
import { SqlChildIdentities } from "./sql-child-identities.mjs";
import { SqlChildEpisodes } from "./sql-child-episodes.mjs";

const db = new DatabaseSync(path.resolve("database/database.sqlite"));
db.exec("PRAGMA busy_timeout=10000;");

const catalog = await loadCatalog(path.resolve("public/data/catalog.parquet"));
const latestByMal = new Map(catalog.rows.filter(r => r.entity_type !== "MANGA").map(r => [String(r.mal_id), Number(r.latest_episode_num)]));

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

const fillers = fillerIndex();
const works = db.prepare(`SELECT w.id, w.status, w.episode_count, (SELECT external_id FROM catalog_external_identities x WHERE x.entity_id=w.id AND x.provider='mal' AND x.namespace='anime:work') mal,
  (SELECT max(number) FROM catalog_episodes e WHERE e.work_id=w.id AND e.numbering_scheme='original') existing_max FROM catalog_works w WHERE w.media='anime' LIMIT 200`).all();

let eligible = 0, skipped = 0;
const counts = [];
for (const w of works) {
  const total = airedCount(w, latestByMal.get(w.mal), w.existing_max || 0);
  if (!total) skipped++;
  else {
    eligible++;
    counts.push(total);
  }
}

console.log('Sample 200 works:', { eligible, skipped, totalEpisodes: counts.reduce((a,b)=>a+b, 0) });
