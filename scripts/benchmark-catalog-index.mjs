import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { buildSearchIndex } from "./catalog/search-index.mjs";
import { digestFile } from "./catalog/download-snapshot.mjs";
const root = path.resolve("storage/app/catalog/unified-candidate/data"), manifest = readJson(path.join(root, "catalog.manifest.json"));
const rows = [], started = Date.now();
for (const descriptor of manifest.files.filter(file => file.media === "anime").slice(0, 2)) {
  const file = path.join(root, descriptor.url.slice(6));
  if (await digestFile(file) !== descriptor.sha256) throw new Error("Benchmark input checksum mismatch");
  rows.push(...(await loadCatalog(file)).rows);
}
const loadedAt = Date.now(), generation = randomUUID(), directory = path.resolve("storage/app/catalog/probes/index-benchmark");
const result = await buildSearchIndex(rows, directory, generation), builtAt = Date.now();
const db = new DatabaseSync(path.join(directory, generation + ".sqlite"), { readOnly: true });
const sql = "SELECT count(*) AS total FROM works WHERE media='anime' AND json_extract(summary, '$.status')='RELEASING' AND adult=0 AND coalesce(json_extract(summary,'$.catalog_visibility'),'visible')='visible'";
const count = db.prepare(sql).get(), queriedAt = Date.now(), plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all();
db.close();
const report = { checkedAt: new Date().toISOString(), inputGeneration: manifest.generation, works: rows.length, readMilliseconds: loadedAt - started,
  buildMilliseconds: builtAt - loadedAt, queryMilliseconds: queriedAt - builtAt, count: count.total, bytes: fs.statSync(path.join(directory, generation + ".sqlite")).size, plan, generation: result.generation };
writeJson(path.join(directory, "report.json"), report);
console.log(JSON.stringify(report));
