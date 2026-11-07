import { DatabaseSync } from 'node:sqlite';
import { loadCatalog } from './load-catalog.mjs';
import path from 'node:path';

const db = new DatabaseSync('database/database.sqlite');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('--- DB Tables ---');
console.log(tables.map(t => t.name));

const catalog = await loadCatalog(path.resolve('public/data/catalog.parquet'));
console.log('--- Parquet Row Keys ---');
const sample = catalog.rows[0];
console.log(Object.keys(sample));

console.log('--- Parquet Media Distribution ---');
const mediaCounts = {};
for (const r of catalog.rows) {
  const m = r.entity_type || r.format || 'unknown';
  mediaCounts[m] = (mediaCounts[m] || 0) + 1;
}
console.log(mediaCounts);

console.log('--- Sample studios_json & relations_json ---');
const sampleWithStudio = catalog.rows.find(r => r.studios_json && r.studios_json.length > 5);
console.log('studios_json sample:', sampleWithStudio?.title, sampleWithStudio?.studios_json);
const sampleWithRelations = catalog.rows.find(r => r.relations_json && r.relations_json.length > 10);
console.log('relations_json sample:', sampleWithRelations?.title, sampleWithRelations?.relations_json);
