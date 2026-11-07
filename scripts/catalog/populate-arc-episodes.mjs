/**
 * Consolidação Massiva da Malha: catalog_arc_episodes
 * Mapeia todos os ~80.000 episódios que possuem ranges definidos em catalog_arc_works
 * para dentro da tabela relacional física catalog_arc_episodes.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_PATH = path.resolve('database/database.sqlite');
const db = new DatabaseSync(DB_PATH);

console.log('Iniciando sincronização massiva de catalog_arc_episodes...');
db.exec('PRAGMA synchronous = OFF; PRAGMA journal_mode = WAL;');

// Busca arcos com seus intervalos
const arcRanges = db.prepare(`
  SELECT aw.arc_id, aw.work_id, a.universe_id, aw.start_number, aw.end_number
  FROM catalog_arc_works aw
  JOIN catalog_arcs a ON a.id = aw.arc_id
`).all();

console.log(`Total de registros em catalog_arc_works: ${arcRanges.length}`);

// Busca todos os episódios indexados
const episodes = db.prepare(`SELECT id, work_id, number FROM catalog_episodes`).all();
console.log(`Total de episódios no banco: ${episodes.length}`);

// Agrupa episódios por work_id
const episodesByWork = new Map();
for (const ep of episodes) {
  if (!episodesByWork.has(ep.work_id)) {
    episodesByWork.set(ep.work_id, []);
  }
  episodesByWork.get(ep.work_id).push(ep);
}

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO catalog_arc_episodes (arc_id, episode_id, universe_id, work_id)
  VALUES (?, ?, ?, ?)
`);

let inserted = 0;
db.exec('BEGIN TRANSACTION;');

for (const arc of arcRanges) {
  const workEps = episodesByWork.get(arc.work_id);
  if (!workEps) continue;

  const start = arc.start_number || 1;
  const end = arc.end_number || 999999;

  for (const ep of workEps) {
    if (ep.number >= start && ep.number <= end) {
      insertStmt.run(arc.arc_id, ep.id, arc.universe_id, arc.work_id);
      inserted++;
    }
  }
}

db.exec('COMMIT;');
console.log(`Sucesso: ${inserted} vínculos criados em catalog_arc_episodes!`);

const finalCount = db.prepare('SELECT count(*) as total FROM catalog_arc_episodes').get();
console.log(`Contagem total consolidada em catalog_arc_episodes: ${finalCount.total}`);
