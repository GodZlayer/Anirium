import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
const releasing = db.prepare("SELECT count(id) as c FROM catalog_works WHERE media='anime' AND status='RELEASING'").get();
const withEpisodes = db.prepare("SELECT count(id) as c FROM catalog_works WHERE media='anime' AND episode_count > 0").get();
console.log('RELEASING animes:', releasing.c);
console.log('Animes with episode_count > 0:', withEpisodes.c);
