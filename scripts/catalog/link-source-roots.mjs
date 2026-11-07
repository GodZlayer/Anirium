// Script mestre para interligar Anime -> Manga/Novel (Origem) e enriquecer os Universos com a Fonte Original e seus Autores
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const db = new DatabaseSync(path.resolve('database/database.sqlite'));
db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;');

console.log('[LinkSourceRoots] Iniciando interligação das raízes canônicas...');

// 1. Encontra pontes de identidade onde o Anime compartilha título em JP ou título canônico com o Manga/Novel
const linkQuery = db.prepare(`
  SELECT DISTINCT w_anime.id as anime_id, w_source.id as source_id, w_source.media as source_media
  FROM catalog_entity_titles t_anime
  JOIN catalog_works w_anime ON t_anime.entity_id = w_anime.id
  JOIN catalog_entity_titles t_source ON lower(trim(t_anime.title)) = lower(trim(t_source.title)) AND t_anime.locale = t_source.locale
  JOIN catalog_works w_source ON t_source.entity_id = w_source.id
  WHERE w_anime.media = 'anime'
    AND w_source.media IN ('manga', 'novel')
    AND t_anime.locale IN ('ja', 'und', 'x-jat', 'en')
`);

const insertRel = db.prepare(`
  INSERT OR IGNORE INTO catalog_work_relations (from_work_id, to_work_id, relation_type, provider)
  VALUES (?, ?, 'adaptation', 'canonical-title-bridge')
`);

const candidates = linkQuery.all();
console.log(`[LinkSourceRoots] Candidatos de adaptação direta identificados: ${candidates.length}`);

db.exec('BEGIN IMMEDIATE');
let inserted = 0;
for (const c of candidates) {
  try {
    insertRel.run(c.anime_id, c.source_id);
    inserted++;
  } catch (err) {}
}
db.exec('COMMIT');

console.log(`[LinkSourceRoots] Conexões de adaptação registradas no banco: ${inserted}`);

// 2. Agora vincula essas obras fontes (Mangás e Novels) aos universos correspondentes
const insertUnivWork = db.prepare(`
  INSERT OR IGNORE INTO catalog_universe_works (universe_id, work_id)
  SELECT DISTINCT uw.universe_id, r.to_work_id
  FROM catalog_universe_works uw
  JOIN catalog_work_relations r ON uw.work_id = r.from_work_id
  WHERE r.relation_type IN ('adaptation', 'source')
`);

db.exec('BEGIN IMMEDIATE');
insertUnivWork.run();
db.exec('COMMIT');

console.log(`[LinkSourceRoots] Mangás e Novels incorporados aos Universos Canônicos com sucesso!`);
