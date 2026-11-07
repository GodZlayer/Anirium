import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const adaptedAnime = db.prepare(`
  SELECT count(DISTINCT r.from_work_id) as c
  FROM catalog_work_relations r
  JOIN catalog_works w1 ON r.from_work_id = w1.id
  JOIN catalog_works w2 ON r.to_work_id = w2.id
  WHERE w1.media = 'anime' AND r.relation_type IN ('source', 'adaptation', 'main')
`).get();

const totalAnime = db.prepare("SELECT count(id) as c FROM catalog_works WHERE media='anime'").get();
console.log('Total anime:', totalAnime.c, 'Anime linked to source/adaptation:', adaptedAnime.c);

const rels = db.prepare(`
  SELECT r.relation_type, count(r.from_work_id) as count
  FROM catalog_work_relations r
  JOIN catalog_works w ON r.from_work_id = w.id
  WHERE w.media = 'anime'
  GROUP BY r.relation_type
`).all();
console.log('Anime relation types:', rels);

// Check MangaBaka relations in SQLite
const mangaRelTypes = db.prepare(`
  SELECT r.relation_type, count(r.from_work_id) as count
  FROM catalog_work_relations r
  JOIN catalog_works w ON r.from_work_id = w.id
  WHERE w.media IN ('manga', 'novel')
  GROUP BY r.relation_type
`).all();
console.log('Manga/Novel relation types:', mangaRelTypes);
