import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqlChildIdentities } from "./sql-child-identities.mjs";
import { SqlChildEpisodes } from "./sql-child-episodes.mjs";

const db = new DatabaseSync(path.resolve("database/database.sqlite"));
const identities = new SqlChildIdentities(db);
const episodes = new SqlChildEpisodes(db, identities);

const works = db.prepare(`SELECT w.id, (SELECT max(number) FROM catalog_episodes e WHERE e.work_id=w.id AND e.numbering_scheme='original') existing_max FROM catalog_works w WHERE w.media='anime' LIMIT 20`).all();
const aliases = db.prepare("SELECT alias FROM catalog_entity_aliases WHERE kind='work' AND entity_id=? ORDER BY alias");

const t0 = Date.now();
db.exec("BEGIN IMMEDIATE");
for (const w of works) {
  const names = aliases.all(w.id).map(a => a.alias);
  for (let n = 1; n <= 12; n++) {
    episodes.write(w.id, { number: n, classification: "canon" }, names);
  }
}
db.exec("COMMIT");
console.log(`Wrote 20 works (240 episodes) in ONE transaction: ${Date.now() - t0}ms`);
