import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { publishCatalog } from "./catalog/publish-catalog.mjs";
import { verifyCatalogAssets } from "./catalog/verify-catalog-assets.mjs";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";

const candidate = path.resolve("storage/app/catalog/repair/catalog.parquet");
const report = readJson(candidate + ".repair.json");
const destination = path.resolve("public/data/catalog.parquet");
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (!report || report.source !== destination || hash(destination) !== report.sourceHash) throw new Error("Published source differs from candidate baseline; rebuild required");
const original = await loadCatalog(destination), prepared = await loadCatalog(candidate);
if (original.recovered || prepared.recovered) throw new Error("Repair requires valid primary snapshots");
const keys = row => `${row.entity_type === "MANGA" ? "manga" : "anime"}:${row.mal_id}`;
const byKey = new Map(original.rows.map(row => [keys(row), row]));
const allowed = new Set(["start_date", "end_date", "filler_episodes_json"]);
if (prepared.rows.length !== original.rows.length) throw new Error("Unexpected identity count change");
for (const row of prepared.rows) {
  const previous = byKey.get(keys(row));
  if (!previous) throw new Error("Unexpected work in repair candidate");
  for (const column of new Set([...Object.keys(previous), ...Object.keys(row)])) {
    if (!allowed.has(column) && (previous[column] ?? null) !== (row[column] ?? null)) throw new Error(`Unexpected change: ${keys(row)}/${column}`);
  }
}
const verifiedAssets = verifyCatalogAssets(prepared.rows, path.dirname(destination));
const previousStatus = readJson(destination + ".status.json");
const result = await publishCatalog(prepared.rows, original.rows, destination);
writeJson(destination + ".status.json", { ...previousStatus, publishedAt: new Date().toISOString(), snapshotSha256: hash(destination),
  verifiedAssets, repair: { before: report.before, after: report.after, source: report.snapshot }, catalogComplete: false });
console.log(JSON.stringify({ ...result, verifiedAssets, before: report.before, after: report.after }));
