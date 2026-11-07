import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite');
for (const t of ['catalog_episodes', 'catalog_seasons', 'catalog_arcs', 'catalog_arc_works', 'catalog_arc_episodes', 'catalog_works']) {
  console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(t).sql);
}
console.log(db.prepare("SELECT classification, count(*) c FROM catalog_episodes GROUP BY classification").all());
console.log(db.prepare("SELECT count(*) c FROM catalog_works WHERE media='anime' AND episode_count>0").get());
console.log(db.prepare("SELECT status, count(*) c FROM catalog_works WHERE media='anime' GROUP BY status").all());
const fillerMal = db.prepare("SELECT count(*) c FROM catalog_external_identities WHERE provider='mal' AND namespace='anime:work'").get();
console.log('mal anime identities', fillerMal);
console.log(db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='catalog_episodes'").all());
