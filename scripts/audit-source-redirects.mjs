import fs from "node:fs";
import path from "node:path";
import { readMangaBakaArchive } from "./catalog/read-mangabaka-archive.mjs";
import { digestFile } from "./catalog/download-snapshot.mjs";
import { addMangaBakaRedirect, validateSourceRedirects } from "./catalog/source-redirects.mjs";
import { emptyRegistry } from "./catalog/work-registry.mjs";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
const file = path.resolve("storage/app/catalog/snapshots/mangabaka-series.jsonl.tar.gz"), provenance = readJson(file + ".source.json");
if (provenance?.digest !== `sha256:${await digestFile(file)}`) throw new Error("Unverified MangaBaka redirect snapshot");
const registry = emptyRegistry(), active = new Set(), rejected = [];
let records = 0, retired = 0;
for await (const record of readMangaBakaArchive(file)) {
  records++;
  if (record.state === "active" && !record.merged_with) active.add(String(record.id));
  if (record.merged_with) {
    retired++;
    try { addMangaBakaRedirect(registry, record, provenance); }
    catch (error) { rejected.push({ id: record.id, reason: error.message }); }
  }
}
validateSourceRedirects(registry);
let resolvedActive = 0, unresolved = 0, maxDepth = 0;
for (const key of Object.keys(registry.source_redirects || {})) {
  let cursor = key, depth = 0;
  while (registry.source_redirects[cursor]) { depth++; cursor = registry.source_redirects[cursor].to; }
  maxDepth = Math.max(maxDepth, depth);
  if (active.has(cursor.split(":")[2])) resolvedActive++; else unresolved++;
}
if (provenance.digest !== `sha256:${await digestFile(file)}`) throw new Error("Snapshot changed during redirect audit");
const report = { checkedAt: new Date().toISOString(), digest: provenance.digest, records, active: active.size, retired,
  redirects: Object.keys(registry.source_redirects || {}).length, resolvedActive, unresolved, maxDepth, rejected };
writeJson("storage/app/catalog/probes/mangabaka-redirect-audit.json", report);
console.log(JSON.stringify(report));
