import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
import { refreshMediawikiArcs } from "./catalog/mediawiki-batch.mjs";
import { workCapabilities } from "./catalog/work-capabilities.mjs";
import { emptyRegistry } from "./catalog/work-registry.mjs";
import { assignIdentity } from "./catalog/assign-identities.mjs";
import { publishGeneration } from "./catalog/publish-generation.mjs";
import { auditGeneration } from "./catalog/audit-generation.mjs";
import { digestFile } from "./catalog/download-snapshot.mjs";

const id = Number(process.argv.find(value => value.startsWith("--mal="))?.slice(6));
if (!Number.isSafeInteger(id) || id < 1) throw new Error("Supply --mal");
const output = path.resolve("storage/app/catalog/mediawiki-verification"), data = path.join(output, "data"), indexes = path.join(output, "indexes");
const manifest = readJson("public/data/catalog.manifest.json");
const db = new DatabaseSync(`storage/app/catalog/published/indexes/${manifest.generation}.sqlite`, { readOnly: true });
const found = db.prepare("SELECT works.work_id, works.partition_url FROM aliases JOIN works USING(work_id) WHERE aliases.reference=? AND works.adult=0").get(`anime:${id}`); db.close();
if (!found) throw new Error("Published non-adult anime missing");
const descriptor = manifest.files.find(file => file.url === found.partition_url), input = path.resolve("public" + found.partition_url);
if (!descriptor || await digestFile(input) !== descriptor.sha256) throw new Error("Published input integrity mismatch");
const row = (await loadCatalog(input)).rows.find(work => work.work_id === found.work_id);
const batch = await refreshMediawikiArcs([row], { directory: path.resolve("storage/app/catalog/mediawiki/cache"), requestBudget: 1 });
if (!batch.applied) throw new Error("No sourced narrative divisions available");
row.capabilities_json = JSON.stringify(workCapabilities(row));
if (row.episodes_metadata_url) {
  const relative = /^\/data\/(episodes\/anime\/[1-9]\d*\/[a-f0-9]{64}\.json)$/.exec(row.episodes_metadata_url)?.[1];
  if (!relative) throw new Error("Invalid episode source");
  const target = path.join(data, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join("public/data", relative), target);
}
const registry = emptyRegistry(), identified = assignIdentity(row, registry);
const result = await publishGeneration([identified], [], data, { indexDirectory: indexes, report: { catalogComplete: false, validationOnly: true, inputGeneration: manifest.generation } });
writeJson(path.join(output, "registry.json"), registry);
const audit = await auditGeneration(data, { registry, indexDirectory: indexes });
console.log(JSON.stringify({ generation: result.generation, work_id: row.work_id, arcs: JSON.parse(row.arcs_json).length, audit }));
