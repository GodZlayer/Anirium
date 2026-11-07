import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { publishCatalog } from "./catalog/publish-catalog.mjs";
import { discoverMalCatalog } from "./catalog/mal-discovery.mjs";
import { refreshMalDetailBatch } from "./catalog/mal-detail-batch.mjs";
import { malDatePatch } from "./catalog/mal-dates.mjs";
import { applyFillerSnapshot } from "./catalog/filler-snapshot.mjs";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
import { episodeEvidence } from "../resources/js/lib/episodeClassification.mjs";

const source = path.resolve("public/data/catalog.parquet");
const destination = path.resolve("storage/app/catalog/repair/catalog.parquet");
const { rows } = await loadCatalog(source);
const before = { works: rows.length, guides: rows.filter(episodeEvidence).length, startDates: rows.filter(row => row.start_date).length };
const sourceHash = createHash("sha256").update(fs.readFileSync(source)).digest("hex");
const discovery = await discoverMalCatalog(() => { throw new Error("Repair only uses existing official source cache"); });
const details = await refreshMalDetailBatch(discovery.records, () => { throw new Error("No network in repair"); }, { requestBudget: 0 });
const byId = new Map(rows.filter(row => row.entity_type !== "MANGA").map(row => [row.mal_id, row]));
for (const record of details.records) {
  const row = byId.get(record.id);
  if (row) Object.assign(row, malDatePatch(record));
}
const snapshotFile = path.resolve("storage/app/catalog/snapshots/fillers-fillers.json");
const provenance = readJson(snapshotFile + ".source.json");
const buffer = fs.readFileSync(snapshotFile);
if ("sha256:" + createHash("sha256").update(buffer).digest("hex") !== provenance?.digest) throw new Error("Snapshot checksum mismatch");
const classification = applyFillerSnapshot(rows, JSON.parse(buffer), provenance);
const publication = await publishCatalog(rows, rows, destination);
const after = { works: rows.length, guides: rows.filter(episodeEvidence).length, startDates: rows.filter(row => row.start_date).length };
if (sourceHash !== createHash("sha256").update(fs.readFileSync(source)).digest("hex")) throw new Error("Source changed during candidate build");
const report = { source, sourceHash, destination, generatedAt: new Date().toISOString(), before, after, publication,
  classification, dateSource: { source: "myanimelist-cache", discoveryCheckedAt: discovery.completedAt }, snapshot: provenance,
  preserved: "Existing identities, metadata, episodes, relations and manga retained; no inferred arcs or canon outside explicit source indices." };
writeJson(destination + ".repair.json", report);
console.log(JSON.stringify({ sourceHash, destination, before, after, rejected: classification.rejected.length, publication }, null, 2));
