import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const sharedLocales = db.prepare(`
  SELECT count(*) as count
  FROM (
    SELECT t1.locale, lower(trim(t1.title)) as t
    FROM catalog_entity_titles t1
    JOIN catalog_works w1 ON t1.entity_id = w1.id
    WHERE w1.media = 'anime'
    INTERSECT
    SELECT t2.locale, lower(trim(t2.title)) as t
    FROM catalog_entity_titles t2
    JOIN catalog_works w2 ON t2.entity_id = w2.id
    WHERE w2.media IN ('manga', 'novel')
  )
`).get();
console.log('Shared localized titles between Anime and Manga/Novel:', sharedLocales);
