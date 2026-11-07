import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const samples = db.prepare(`
  SELECT a.title as arc_title, w.title as work_title, w.media, aw.start_number, aw.end_number
  FROM catalog_arcs a
  JOIN catalog_arc_works aw ON a.id = aw.arc_id
  JOIN catalog_works w ON aw.work_id = w.id
  WHERE aw.start_number IS NOT NULL AND a.title LIKE '%Record of Ragnarok%'
  LIMIT 5
`).all();
console.log(samples);
