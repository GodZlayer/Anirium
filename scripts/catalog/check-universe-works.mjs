import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const count = db.prepare(`
  SELECT count(DISTINCT uw.work_id) as c
  FROM catalog_universe_works uw
  JOIN catalog_works w ON uw.work_id = w.id
  WHERE w.media = 'anime'
`).get();
console.log('Anime works in catalog_universe_works:', count.c);

const mediaInUniverses = db.prepare(`
  SELECT w.media, count(DISTINCT uw.work_id) as c
  FROM catalog_universe_works uw
  JOIN catalog_works w ON uw.work_id = w.id
  GROUP BY w.media
`).all();
console.log('Media in catalog_universe_works:', mediaInUniverses);
