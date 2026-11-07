// Otimizado: em memória via Map para zero overhead no SQLite
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const db = new DatabaseSync(path.resolve('database/database.sqlite'));
db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=OFF; PRAGMA synchronous=OFF;');

console.log('[LinkSourceRootsFast] Carregando títulos em memória...');
const t0 = Date.now();

// 1. Carrega títulos dos animes
const animeTitles = db.prepare(`
  SELECT t.entity_id, lower(trim(t.title)) as clean_title, t.locale
  FROM catalog_entity_titles t
  JOIN catalog_works w ON t.entity_id = w.id
  WHERE w.media = 'anime' AND t.locale IN ('ja', 'und', 'x-jat', 'en')
`).all();
console.log(`Carregados ${animeTitles.length} títulos de anime em ${Date.now() - t0}ms`);

// Indexa animes por clean_title
const animeMap = new Map();
for (const a of animeTitles) {
  if (!a.clean_title || a.clean_title.length < 3) continue;
  if (!animeMap.has(a.clean_title)) animeMap.set(a.clean_title, new Set());
  animeMap.get(a.clean_title).add(a.entity_id);
}

// 2. Carrega títulos de mangá/novel
const t1 = Date.now();
const sourceTitles = db.prepare(`
  SELECT t.entity_id, lower(trim(t.title)) as clean_title, t.locale
  FROM catalog_entity_titles t
  JOIN catalog_works w ON t.entity_id = w.id
  WHERE w.media IN ('manga', 'novel') AND t.locale IN ('ja', 'und', 'x-jat', 'en')
`).all();
console.log(`Carregados ${sourceTitles.length} títulos de mangá/novel em ${Date.now() - t1}ms`);

// 3. Cruza em memória instantaneamente
const t2 = Date.now();
const pairs = new Set();
for (const s of sourceTitles) {
  if (!s.clean_title) continue;
  const match = animeMap.get(s.clean_title);
  if (match) {
    for (const animeId of match) {
      pairs.add(`${animeId}|${s.entity_id}`);
    }
  }
}
console.log(`Casamento em memória concluído: ${pairs.size} conexões encontradas em ${Date.now() - t2}ms`);

// 4. Insere em lote
const insertRel = db.prepare(`
  INSERT OR IGNORE INTO catalog_work_relations (from_work_id, to_work_id, relation_type, provider)
  VALUES (?, ?, 'adaptation', 'canonical-title-bridge')
`);

db.exec('BEGIN IMMEDIATE');
let inserted = 0;
for (const pair of pairs) {
  const [animeId, sourceId] = pair.split('|');
  insertRel.run(animeId, sourceId);
  inserted++;
}
db.exec('COMMIT');
console.log(`Inseridas ${inserted} relações em ${Date.now() - t2}ms`);

// 5. Atualiza os universos
const t3 = Date.now();
db.exec(`
  INSERT OR IGNORE INTO catalog_universe_works (universe_id, work_id)
  SELECT DISTINCT uw.universe_id, r.to_work_id
  FROM catalog_universe_works uw
  JOIN catalog_work_relations r ON uw.work_id = r.from_work_id
  WHERE r.relation_type IN ('adaptation', 'source');
`);
console.log(`Universos atualizados com as obras originais em ${Date.now() - t3}ms`);
