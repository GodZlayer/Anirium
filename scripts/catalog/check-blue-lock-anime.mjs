import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const anime = db.prepare("SELECT * FROM catalog_works WHERE media = 'anime' AND title LIKE 'Blue Lock%'").all();
console.log('Blue lock animes in DB:', anime.map(a => ({ id: a.id, title: a.title })));
if (anime.length > 0) {
  const rels = db.prepare('SELECT * FROM catalog_work_relations WHERE from_work_id = ? OR to_work_id = ?').all(anime[0].id, anime[0].id);
  console.log('Blue lock anime relations:', rels);
  const universe = db.prepare('SELECT * FROM catalog_universe_works WHERE work_id = ?').all(anime[0].id);
  console.log('Blue lock anime universes:', universe);
}
