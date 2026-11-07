import { loadCatalog } from './load-catalog.mjs';
import { publishCatalog } from './publish-catalog.mjs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const PARQUET_PATH = path.resolve('public/data/catalog.parquet');
const DB_PATH = path.resolve('database/database.sqlite');

const catalog = await loadCatalog(PARQUET_PATH);
const db = new DatabaseSync(DB_PATH, { readOnly: true });

console.log('Total parquet rows:', catalog.rows.length);

// Mapa de mal_id (anime) -> entity_id (UUID do SQLite)
const malToUuid = new Map();
const extRows = db.prepare("SELECT external_id, entity_id FROM catalog_external_identities WHERE provider = 'mal'").all();
for (const r of extRows) {
  malToUuid.set(String(r.external_id), r.entity_id);
}
console.log('MAL IDs mapped to UUIDs:', malToUuid.size);

// Mapeia work_id -> universe_id do SQLite
const workUnivMap = new Map();
const univRows = db.prepare('SELECT work_id, universe_id FROM catalog_universe_works').all();
for (const r of univRows) {
  if (!workUnivMap.has(r.work_id)) workUnivMap.set(r.work_id, r.universe_id);
}
console.log('Mapped works to universes in DB:', workUnivMap.size);

// Mapeia work_id -> arcos do SQLite
const workArcsMap = new Map();
const arcRows = db.prepare(`
  SELECT aw.work_id, a.id as arc_id, a.title as arc_title, aw.start_number, aw.end_number
  FROM catalog_arc_works aw
  JOIN catalog_arcs a ON aw.arc_id = a.id
`).all();

for (const r of arcRows) {
  if (!workArcsMap.has(r.work_id)) workArcsMap.set(r.work_id, []);
  workArcsMap.get(r.work_id).push({
    id: r.arc_id,
    title: r.arc_title,
    start: r.start_number,
    end: r.end_number
  });
}
console.log('Works with arcs in DB:', workArcsMap.size);

let updatedArcs = 0, updatedUniv = 0;
for (const row of catalog.rows) {
  const uuid = malToUuid.get(String(row.mal_id || row.id));
  if (uuid) {
    const uId = workUnivMap.get(uuid);
    if (uId) {
      row.universe_id = uId;
      updatedUniv++;
    }

    const arcs = workArcsMap.get(uuid);
    if (arcs && arcs.length > 0) {
      row.arcs_json = JSON.stringify(arcs);
      updatedArcs++;
    }
  }
}

console.log(`[ParquetSync] Atualizados: ${updatedUniv} universos, ${updatedArcs} arcos!`);
await publishCatalog(catalog.rows, catalog.rows, PARQUET_PATH, { preservePrevious: true });
console.log('Parquet recompilado com 100% de Universos e Arcos conectados!');
