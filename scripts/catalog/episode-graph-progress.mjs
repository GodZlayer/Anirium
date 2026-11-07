import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
db.exec('PRAGMA busy_timeout=5000');
console.log('episodes:', db.prepare('SELECT count(*) c FROM catalog_episodes').get().c);
console.log('works with episodes:', db.prepare('SELECT count(DISTINCT work_id) c FROM catalog_episodes').get().c);
console.log('refs:', db.prepare('SELECT count(*) c FROM catalog_episode_source_refs').get().c);
