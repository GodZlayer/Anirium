import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const relCount = db.prepare("SELECT count(from_work_id) as count FROM catalog_work_relations WHERE provider = 'canonical-title-bridge'").get();
console.log('Conexões criadas por canonical-title-bridge:', relCount);

const mediaInUniv = db.prepare(`
  SELECT w.media, count(DISTINCT uw.work_id) as count
  FROM catalog_universe_works uw
  JOIN catalog_works w ON uw.work_id = w.id
  GROUP BY w.media
`).all();
console.log('Distribuição de mídias em catalog_universe_works agora:', mediaInUniv);
