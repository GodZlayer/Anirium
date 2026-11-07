import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const fateWorks = db.prepare("SELECT id, title, media FROM catalog_works WHERE title LIKE 'Fate/%' LIMIT 15").all();
console.log('Sample Fate works:', fateWorks);

if (fateWorks.length > 0) {
  const ids = fateWorks.map(w => w.id);
  const placeholders = ids.map(() => '?').join(',');
  const rels = db.prepare(`SELECT from_work_id, to_work_id, relation_type FROM catalog_work_relations WHERE from_work_id IN (${placeholders})`).all(...ids);
  console.log('Fate relations found:', rels.length);

  const univs = db.prepare(`SELECT DISTINCT universe_id FROM catalog_universe_works WHERE work_id IN (${placeholders})`).all(...ids);
  console.log('Fate universe_ids:', univs);
}
