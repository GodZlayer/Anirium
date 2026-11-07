// Extrator e reconciliador oficial Manga/Novel -> Arcos e Capítulos Adaptados
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readMangaBakaArchive } from './read-mangabaka-archive.mjs';

const db = new DatabaseSync(path.resolve('database/database.sqlite'));
db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=OFF; PRAGMA synchronous=OFF;');

console.log('[ExtractSourceArcs] Carregando índices de obras e universos...');
const t0 = Date.now();

// Mapeia MangaBaka external_id para entity_id do SQLite
const mangaMap = new Map();
const extRows = db.prepare("SELECT external_id, entity_id FROM catalog_external_identities WHERE provider = 'mangabaka'").all();
for (const r of extRows) {
  mangaMap.set(String(r.external_id), r.entity_id);
}
console.log(`Carregados ${mangaMap.size} identificadores MangaBaka em ${Date.now() - t0}ms`);

// Mapeia work_id -> universe_id
const workUnivMap = new Map();
const univRows = db.prepare("SELECT work_id, universe_id FROM catalog_universe_works").all();
for (const r of univRows) {
  if (!workUnivMap.has(r.work_id)) workUnivMap.set(r.work_id, r.universe_id);
}

// Mapeia animes adaptados a partir da obra fonte
// from_work_id (anime) -> to_work_id (source manga)
const sourceToAnime = new Map();
const relRows = db.prepare("SELECT from_work_id as anime_id, to_work_id as source_id FROM catalog_work_relations WHERE relation_type IN ('adaptation', 'source')").all();
for (const r of relRows) {
  if (!sourceToAnime.has(r.source_id)) sourceToAnime.set(r.source_id, []);
  sourceToAnime.get(r.source_id).push(r.anime_id);
}
console.log(`Carregadas ${relRows.length} relações de adaptação`);

function parseChapterRange(text) {
  if (!text) return null;
  // Procura padrões como "Chap 1", "Chap 42", "Vol 1", etc.
  const chapMatch = text.match(/Chap\s*(\d+)/i);
  const volMatch = text.match(/Vol\s*(\d+)/i);
  return {
    chapter: chapMatch ? parseInt(chapMatch[1], 10) : null,
    volume: volMatch ? parseInt(volMatch[1], 10) : null,
  };
}

function parseArcLabel(text) {
  if (!text) return null;
  const match = text.match(/\(([^)]+)\)/);
  if (match) return match[1].trim();
  return null;
}

const archive = path.resolve('storage/app/catalog/snapshots/mangabaka-series.jsonl.tar.gz');

const insertArc = db.prepare(`
  INSERT OR IGNORE INTO catalog_arcs (id, universe_id, title, classification, source_url)
  VALUES (?, ?, ?, 'canon', 'mangabaka')
`);

const insertArcWork = db.prepare(`
  INSERT OR IGNORE INTO catalog_arc_works (arc_id, universe_id, work_id, start_number, end_number)
  VALUES (?, ?, ?, ?, ?)
`);

const insertTitle = db.prepare(`
  INSERT OR IGNORE INTO catalog_entity_titles (entity_id, locale, title)
  VALUES (?, 'und', ?)
`);

const insertEntity = db.prepare(`
  INSERT OR IGNORE INTO catalog_entities (id, kind, resolution_status, created_at, updated_at)
  VALUES (?, 'arc', 'verified', datetime('now'), datetime('now'))
`);

let arcsCreated = 0;
let arcWorksLinked = 0;
let processedRecords = 0;

console.log('[ExtractSourceArcs] Processando acervo de material original...');
const t1 = Date.now();
db.exec('BEGIN IMMEDIATE');

for await (const r of readMangaBakaArchive(archive)) {
  processedRecords++;
  if (!r.anime || (!r.anime.start && !r.anime.end)) continue;

  const sourceWorkId = mangaMap.get(String(r.id));
  if (!sourceWorkId) continue;

  const universeId = workUnivMap.get(sourceWorkId);
  if (!universeId) continue;

  const startParts = (r.anime.start || '').split('/').map(s => s.trim()).filter(Boolean);
  const endParts = (r.anime.end || '').split('/').map(s => s.trim()).filter(Boolean);

  const numPhases = Math.max(startParts.length, endParts.length);
  const adaptedAnimes = sourceToAnime.get(sourceWorkId) || [];

  for (let i = 0; i < numPhases; i++) {
    const sStr = startParts[i] || startParts[0] || '';
    const eStr = endParts[i] || endParts[startParts.length - 1] || '';

    const sRange = parseChapterRange(sStr);
    const eRange = parseChapterRange(eStr);
    const label = parseArcLabel(sStr) || parseArcLabel(eStr) || `Fase ${i + 1}`;

    const arcTitle = `${r.title} - ${label}`;
    const arcId = randomUUID();

    try {
      insertEntity.run(arcId);
      insertArc.run(arcId, universeId, arcTitle);
      insertTitle.run(arcId, arcTitle);
      arcsCreated++;

      // Vincula ao Mangá Original (demarcação de capítulos)
      insertArcWork.run(
        arcId,
        universeId,
        sourceWorkId,
        sRange?.chapter || null,
        eRange?.chapter || null
      );
      arcWorksLinked++;

      // Vincula aos Animes adaptados desse universo
      for (const animeId of adaptedAnimes) {
        insertArcWork.run(
          arcId,
          universeId,
          animeId,
          sRange?.chapter || null,
          eRange?.chapter || null
        );
        arcWorksLinked++;
      }
    } catch (err) {}
  }

  if (processedRecords % 50000 === 0) {
    console.log(`[ExtractSourceArcs] ${processedRecords} obras verificadas · ${arcsCreated} arcos canônicos criados`);
  }
}

db.exec('COMMIT');
console.log(`[ExtractSourceArcs] Concluído em ${((Date.now() - t1) / 1000).toFixed(1)}s!`);
console.log(`Total de Arcos Oficiais Criados: ${arcsCreated}`);
console.log(`Total de Obras Vinculadas aos Arcos: ${arcWorksLinked}`);
