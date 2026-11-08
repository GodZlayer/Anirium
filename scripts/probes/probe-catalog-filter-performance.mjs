import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const manifest = JSON.parse(fs.readFileSync("public/data/catalog.manifest.json"));
const db = new DatabaseSync(`storage/app/catalog/published/indexes/${manifest.generation}.sqlite`, { readOnly: true });
db.exec("PRAGMA cache_size=-65536");
const scope = "coalesce(json_extract(works.summary, '$.catalog_visibility'),'visible')='visible' AND works.adult=0 AND works.media='anime'";
const clauses = `${scope} AND upper(json_extract(works.summary,'$.status')) IN ('COMPLETED','FINISHED','FINISHED_AIRING') AND upper(json_extract(works.summary,'$.format'))='TV' AND search MATCH '"Sword"* AND "Art"*'`;
const genres = "CASE WHEN json_valid(json_extract(works.summary,'$.genres_json')) THEN json_extract(works.summary,'$.genres_json') ELSE '[]' END";
const queries = {
  filteredSearch: `SELECT works.work_id FROM works JOIN search ON search.work_id=works.work_id WHERE ${clauses} ORDER BY works.year DESC, works.score DESC, works.work_id LIMIT 12`,
  formats: `SELECT DISTINCT json_extract(works.summary,'$.format') AS format FROM works WHERE ${scope} AND format IS NOT NULL AND format<>'' ORDER BY format LIMIT 128`,
  genres: `SELECT g.value,count(*) AS frequency FROM works,json_each(${genres}) g WHERE ${scope} AND g.type='text' AND length(g.value)>0 GROUP BY g.value ORDER BY frequency DESC,g.value COLLATE NOCASE LIMIT 129`,
};
const proof = { observedAt: new Date().toISOString(), generation: manifest.generation, readOnly: true, phases: {} };
const file = "storage/app/catalog/probes/tier-zero/filter-performance.json";
try {
  for (const [name, sql] of Object.entries(queries)) {
    proof.phases[name] = { plan: db.prepare("EXPLAIN QUERY PLAN " + sql).all() };
    fs.writeFileSync(file, JSON.stringify(proof, null, 2));
    const started = performance.now(), rows = db.prepare(sql).all();
    Object.assign(proof.phases[name], { milliseconds: Math.round(performance.now() - started), rows: rows.length });
    fs.writeFileSync(file, JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({ phase: name, milliseconds: proof.phases[name].milliseconds, rows: rows.length }));
  }
} finally { db.close(); }
