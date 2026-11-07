import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const mangaExt = db.prepare("SELECT * FROM catalog_external_identities WHERE provider = 'mangabaka' AND external_id = '83'").get();
console.log('Blue lock manga in DB:', mangaExt);
const targetExt = db.prepare("SELECT * FROM catalog_external_identities WHERE provider = 'mangabaka' AND external_id = '134800'").get();
console.log('Target series in DB:', targetExt);
if (targetExt) {
  const w = db.prepare('SELECT * FROM catalog_works WHERE id = ?').get(targetExt.entity_id);
  console.log('Target work:', w);
}
if (mangaExt) {
  const w = db.prepare('SELECT * FROM catalog_works WHERE id = ?').get(mangaExt.entity_id);
  console.log('Manga work:', w);
}
