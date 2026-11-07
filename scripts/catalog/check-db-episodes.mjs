import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite');
const sampleEp = db.prepare(`
  SELECT e.*, w.title as work_title 
  FROM catalog_episodes e 
  JOIN catalog_works w ON e.work_id = w.id 
  LIMIT 5
`).all();
console.log('sampleEp:', sampleEp);

const workCountWithEp = db.prepare('SELECT count(DISTINCT work_id) as c FROM catalog_episodes').get();
console.log('Works with episodes in DB:', workCountWithEp.c);

const sampleTitles = db.prepare(`
  SELECT t.locale, t.title 
  FROM catalog_entity_titles t 
  WHERE t.entity_id = ?
`).all(sampleEp[0]?.id || '');
console.log('Sample episode titles:', sampleTitles);
