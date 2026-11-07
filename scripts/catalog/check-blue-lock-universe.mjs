import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const blWorks = db.prepare(`
  SELECT DISTINCT w.id, w.title, w.media
  FROM catalog_universe_works uw
  JOIN catalog_works w ON uw.work_id = w.id
  WHERE w.title LIKE '%Blue Lock%'
`).all();
console.log('Blue Lock obras no mesmo Universo:', blWorks);
