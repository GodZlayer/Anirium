import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const targetMedia = db.prepare(`
  SELECT w1.media as from_media, w2.media as to_media, r.relation_type, count(r.from_work_id) as count
  FROM catalog_work_relations r
  JOIN catalog_works w1 ON r.from_work_id = w1.id
  JOIN catalog_works w2 ON r.to_work_id = w2.id
  WHERE r.relation_type IN ('adaptation', 'source')
  GROUP BY w1.media, w2.media, r.relation_type
`).all();
console.log('Target media for adaptation/source:', targetMedia);

const sample = db.prepare(`
  SELECT r.relation_type, w1.title as from_title, w1.media as from_media, w2.title as to_title, w2.media as to_media
  FROM catalog_work_relations r
  JOIN catalog_works w1 ON r.from_work_id = w1.id
  JOIN catalog_works w2 ON r.to_work_id = w2.id
  WHERE r.relation_type = 'adaptation'
  LIMIT 5
`).all();
console.log('Sample adaptation relations:', sample);
