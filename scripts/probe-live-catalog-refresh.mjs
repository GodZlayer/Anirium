import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { loadGeneration } from "./catalog/load-generation.mjs";
import { digestFile } from "./catalog/download-snapshot.mjs";
import { assignIdentity } from "./catalog/assign-identities.mjs";
import { emptyRegistry } from "./catalog/work-registry.mjs";
import { loadRegistry } from "./catalog/registry-store.mjs";
import { publishGeneration } from "./catalog/publish-generation.mjs";
import { auditGeneration } from "./catalog/audit-generation.mjs";
import { refreshMediawikiArcs } from "./catalog/mediawiki-batch.mjs";
import { workCapabilities } from "./catalog/work-capabilities.mjs";
import { verifyCatalogAssets } from "./catalog/verify-catalog-assets.mjs";

const action = process.argv[2], id = 21881;
const candidate = process.argv.find(arg => arg.startsWith("--candidate="))?.slice(12) || "live-refresh-verification";
if (!["live-refresh-verification", "recovery-refresh-verification"].includes(candidate)) throw new Error("Unrecognized isolated validation candidate");
const output = path.resolve("storage/app/catalog", candidate), data = path.join(output, "data"), indexes = path.join(output, "indexes");
const receiptFile = path.join(output, "probe.json"), receipt = readJson(receiptFile);
let row, previous = [], registry, inputGeneration, collection = null;
if (action === "prepare") {
  if (fs.existsSync(output)) throw new Error("Probe directory already exists; keep its original evidence");
  const source = path.resolve("storage/app/catalog/bootstrap-verification-20261022"), manifest = readJson(path.join(source, "data/catalog.manifest.json"));
  const db = new DatabaseSync(path.join(source, "indexes", `${manifest.generation}.sqlite`), { readOnly: true });
  const entry = db.prepare("SELECT works.work_id, works.partition_url FROM aliases JOIN works USING(work_id) WHERE aliases.reference=?").get(`anime:${id}`); db.close();
  const descriptor = manifest.files.find(file => file.url === entry?.partition_url), file = descriptor && path.join(source, "data", descriptor.url.slice(6));
  if (!file || await digestFile(file) !== descriptor.sha256) throw new Error("Invalid real bootstrap input");
  row = (await loadCatalog(file)).rows.find(work => work.work_id === entry.work_id);
  if (JSON.parse(row.arcs_json || "[]").length) throw new Error("Expected actual pre-enrichment bootstrap work, not fabricated missing arcs");
  inputGeneration = manifest.generation; registry = emptyRegistry(); row = assignIdentity(row, registry);
  if (row.episodes_metadata_url) {
    const relative = /^\/data\/(episodes\/anime\/[1-9]\d*\/[a-f0-9]{64}\.json)$/.exec(row.episodes_metadata_url)?.[1];
    if (!relative) throw new Error("Invalid source episode document");
    const target = path.join(data, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(source, "data", relative), target);
  }
} else if (action === "update") {
  if (receipt?.phase !== "prepared" || receipt.mal_id !== id) throw new Error("Prepare the real candidate first");
  registry = loadRegistry(path.join(output, "registry.json")).registry;
  previous = await loadGeneration(data, registry); row = structuredClone(previous[0]); inputGeneration = receipt.inputGeneration;
  if (previous.length !== 1 || row.work_id !== receipt.work_id) throw new Error("Candidate identity changed");
  collection = await refreshMediawikiArcs([row], { directory: path.resolve("storage/app/catalog/mediawiki/cache"), requestBudget: 0,
    request: async () => { throw new Error("Cache-only validation must not make requests"); } });
  if (!collection.applied || collection.httpRequests !== 0 || JSON.parse(row.arcs_json || "[]").length !== 3) throw new Error("Verified real arc cache unavailable");
} else throw new Error("Expected prepare or update");
row.capabilities_json = JSON.stringify(workCapabilities(row));
verifyCatalogAssets([row], data);
const manifest = await publishGeneration([row], previous, data, { indexDirectory: indexes, report: { validationOnly: true, catalogComplete: false, inputGeneration } });
writeJson(path.join(output, "registry.json"), registry);
const audit = await auditGeneration(data, { registry, indexDirectory: indexes });
const proof = { phase: action === "prepare" ? "prepared" : "updated", checkedAt: new Date().toISOString(), inputGeneration,
  generation: manifest.generation, work_id: row.work_id, mal_id: id, arcs: JSON.parse(row.arcs_json || "[]").length, audit, collection,
  initialGeneration: receipt?.initialGeneration || manifest.generation, publicCatalogModified: false };
writeJson(receiptFile, proof);
console.log(JSON.stringify(proof));
