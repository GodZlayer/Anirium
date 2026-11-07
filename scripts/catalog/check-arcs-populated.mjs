import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

console.log('--- Novo Estado dos Arcos no Banco ---');
const totalArcs = db.prepare('SELECT count(id) as c FROM catalog_arcs').get().c;
const univWithArcs = db.prepare('SELECT count(DISTINCT universe_id) as c FROM catalog_arcs').get().c;
const arcWorks = db.prepare('SELECT count(arc_id) as c FROM catalog_arc_works').get().c;
console.log({ totalArcs, univWithArcs, arcWorks });

console.log('--- Amostra de Arcos com Capítulos ---');
const samples = db.prepare(`
  SELECT a.title as arc_title, aw.work_id, w.title as work_title, w.media, aw.start_number, aw.end_number
  FROM catalog_arcs a
  JOIN catalog_arc_works aw ON a.id = aw.arc_id
  JOIN catalog_works w ON aw.work_id = w.id
  WHERE aw.start_number IS NOT NULL AND a.title LIKE '%Dragon Ball%'
  LIMIT 5
`).all();
console.log(samples);
