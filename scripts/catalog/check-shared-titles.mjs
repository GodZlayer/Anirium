import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const sharedTitles = db.prepare(`
  SELECT count(*) as count
  FROM (
    SELECT lower(trim(w1.title)) as t
    FROM catalog_works w1
    WHERE w1.media = 'anime'
    INTERSECT
    SELECT lower(trim(w2.title)) as t
    FROM catalog_works w2
    WHERE w2.media IN ('manga', 'novel')
  )
`).get();
console.log('Shared exact titles between Anime and Manga/Novel:', sharedTitles);
