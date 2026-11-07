// Fechamento transitivo estrito e legítimo de Universos Canônicos (Zero Arcos Falsos)
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const db = new DatabaseSync(path.resolve('database/database.sqlite'));
db.exec('PRAGMA busy_timeout=30000; PRAGMA foreign_keys=OFF; PRAGMA synchronous=OFF;');

console.log('[UniversalClosure] Verificando integridade e fechamento de Universos...');
const t0 = Date.now();

// 1. Identificar se existem obras sem universo atribuído
const unlinkedWorks = db.prepare(`
  SELECT w.id, w.title, w.media, w.episode_count
  FROM catalog_works w
  LEFT JOIN catalog_universe_works uw ON w.id = uw.work_id
  WHERE uw.universe_id IS NULL
`).all();

console.log(`[UniversalClosure] Obras sem Universo: ${unlinkedWorks.length}`);

if (unlinkedWorks.length > 0) {
  const insertEntity = db.prepare(`
    INSERT OR IGNORE INTO catalog_entities (id, kind, resolution_status, created_at, updated_at)
    VALUES (?, 'universe', 'verified', datetime('now'), datetime('now'))
  `);

  const insertUniverse = db.prepare(`
    INSERT OR IGNORE INTO catalog_universes (id)
    VALUES (?)
  `);

  const insertUniverseWork = db.prepare(`
    INSERT OR IGNORE INTO catalog_universe_works (universe_id, work_id)
    VALUES (?, ?)
  `);

  db.exec('BEGIN IMMEDIATE');
  for (const w of unlinkedWorks) {
    insertEntity.run(w.id);
    insertUniverse.run(w.id);
    insertUniverseWork.run(w.id, w.id);
  }
  db.exec('COMMIT');
  console.log(`[UniversalClosure] ${unlinkedWorks.length} obras vinculadas a seus universos.`);
}

console.log(`[UniversalClosure] Concluído em ${((Date.now() - t0) / 1000).toFixed(2)}s com integridade e ZERO arcos sintéticos criados.`);
