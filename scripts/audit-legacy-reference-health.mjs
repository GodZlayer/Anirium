import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson, readDetail } from "./catalog/mal-detail-cache.mjs";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { applyMalSourceHealth } from "./catalog/mal-source-health.mjs";
const directory = path.resolve("storage/app/catalog/unified-candidate/data"), manifest = readJson(path.join(directory, "catalog.manifest.json"));
const rows = [];
for (const descriptor of manifest.files.filter(file => file.media === "anime")) rows.push(...(await loadCatalog(path.join(directory, descriptor.url.slice(6)))).rows);
const failures = path.resolve("storage/app/catalog/myanimelist/details/failures"), caches = path.resolve("storage/app/catalog/myanimelist/details");
const health = fs.readdirSync(failures).filter(name => /^[1-9]\d*\.json$/.test(name)).map(name => {
  const id = Number(name.slice(0, -5));
  return { media: "anime", id, checkedAt: readDetail(caches, id)?.checkedAt || null, failure: readJson(path.join(failures, name)) };
});
const report = applyMalSourceHealth(rows, health);
const result = { checkedAt: new Date().toISOString(), candidateGeneration: manifest.generation, works: rows.length, failuresChecked: health.length, report,
  examples: rows.filter(row => row.catalog_visibility === "quarantined").slice(0, 5).map(row => ({ work_id: row.work_id, mal_id: row.mal_id, account_reference: row.account_reference })) };
writeJson("storage/app/catalog/probes/legacy-reference-health.json", result);
console.log(JSON.stringify(result));
