import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqlChildIdentities } from "./sql-child-identities.mjs";
import { SqlChildEpisodes } from "./sql-child-episodes.mjs";

const db = new DatabaseSync(path.resolve("database/database.sqlite"));
const identities = new SqlChildIdentities(db);
const episodes = new SqlChildEpisodes(db, identities);

const work = db.prepare("SELECT id FROM catalog_works WHERE media='anime' LIMIT 1").get();
const aliases = db.prepare("SELECT alias FROM catalog_entity_aliases WHERE kind='work' AND entity_id=?").all(work.id).map(a => a.alias);

console.log('Work:', work.id, 'Aliases:', aliases);

const t0 = Date.now();
for (let i = 1; i <= 50; i++) {
  episodes.write(work.id, { number: i, classification: "canon" }, aliases);
}
console.log('Time for 50 episodes with write():', Date.now() - t0, 'ms');
