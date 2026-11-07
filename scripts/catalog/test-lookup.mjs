import { DatabaseSync } from 'node:sqlite';
import { loadCatalog } from './load-catalog.mjs';
import path from 'node:path';

const catalog = await loadCatalog(path.resolve('public/data/catalog.parquet'));
const db = new DatabaseSync('database/database.sqlite');

const sample = catalog.rows.find(r => r.status === 'RELEASING' && r.synopsis);
console.log('Sample in parquet: mal_id =', sample.mal_id, 'title =', sample.title);

const ext = db.prepare("SELECT * FROM catalog_external_identities WHERE provider = 'mal' AND external_id = ?").get(String(sample.mal_id));
console.log('Found in external_identities:', ext);

if (ext) {
  const titles = db.prepare("SELECT * FROM catalog_entity_titles WHERE entity_id = ?").all(ext.entity_id);
  console.log('Titles in db for entity:', titles);
}
