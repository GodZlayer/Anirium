import fs from "node:fs";
import { importRecipe } from "./catalog/import-recipe.mjs";
import { applyMalSourceHealth } from "./catalog/mal-source-health.mjs";
import { addMangaBakaRedirect } from "./catalog/source-redirects.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { loadRegistry, saveRegistry } from "./catalog/registry-store.mjs";
import { createConsolidator } from "./catalog/consolidate-snapshot.mjs";
import { offlineAnimeRecord } from "./catalog/offline-anime-record.mjs";
import { mangabakaRecord } from "./catalog/mangabaka-record.mjs";
import { readMangaBakaArchive } from "./catalog/read-mangabaka-archive.mjs";
import { publishGeneration } from "./catalog/publish-generation.mjs";
import { workCapabilities } from "./catalog/work-capabilities.mjs";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
import { SOURCE_CONTRACTS } from "./catalog/source-contracts.mjs";
import { sourceReadiness } from "./catalog/source-readiness.mjs";
import { digestFile } from "./catalog/download-snapshot.mjs";
import { loadGeneration } from "./catalog/load-generation.mjs";
import { syncSqlWorkGraph } from "./catalog/sql-work-graph.mjs";
import { syncSqlChildren } from "./catalog/sql-children-sync.mjs";
import { loadImportCheckpoint, saveImportCheckpoint } from "./catalog/import-checkpoint.mjs";
import { refreshMalWorks } from "./catalog/mal-work-stage.mjs";
import { createMalClient } from "./catalog/mal-client.mjs";
import { supplementCatalog } from "./catalog/supplemental-stage.mjs";
import { createJsonlSink } from "./catalog/jsonl-sink.mjs";
import { discoverWorkRecords } from "./catalog/discover-work-records.mjs";
import { ensureBootstrapInputs } from "./catalog/bootstrap-inputs.mjs";
import { assertSqlRegistrySnapshot } from "./catalog/sql-registry-snapshot.mjs";

const args = process.argv.slice(2), empty = args.includes("--empty");
const output = path.resolve(args.find(arg => arg.startsWith("--output="))?.slice(9) || "storage/app/catalog/unified-candidate");
const sourceDirectory = empty ? path.join(output, "sources") : path.resolve("storage/app/catalog");
const runId = randomUUID();
const progress = (phase, details = {}) => writeJson(path.join(output, "progress.json"), { runId, phase, observedAt: new Date().toISOString(), ...details });
progress("loading");
process.on("uncaughtExceptionMonitor", error => progress("failed", { error: error.message }));
const registryFile = path.join(output, "registry.json");
const loaded = loadRegistry(registryFile), registry = loaded.registry;
const retained = await loadGeneration(path.join(output, "data"), registry);
if (empty) {
  const bootstrap = ensureBootstrapInputs(output, { registryWorks: Object.keys(registry.works).length, retainedWorks: retained.length });
  if (bootstrap.resumed) console.log(`[Bootstrap] retomando armazenamento isolado; ${retained.length} obras auditadas preservadas`);
}
const legacy = empty ? [] : (await loadCatalog(path.resolve("public/data/catalog.parquet"))).rows;
const previous = retained.length ? retained : legacy;
const conflictFile = path.join(output, "runs", runId, "field-conflicts.jsonl");
fs.mkdirSync(path.dirname(conflictFile), { recursive: true });
const conflictSink = createJsonlSink(conflictFile);
let sources = {}, rejected = [];
const snapshots = path.resolve("storage/app/catalog/snapshots");
const snapshotState = readJson(path.join(snapshots, "sources.json"));
const animeName = snapshotState?.anime?.filename || fs.readdirSync(snapshots).filter(name => /^\d{4}-\d+-anime-offline-database-minified\.json$/.test(name)).sort().at(-1);
if (animeName && path.basename(animeName) !== animeName) throw new Error("Invalid anime snapshot path");
const animeFile = path.join(snapshots, animeName || "unavailable");
const archive = path.join(snapshots, "mangabaka-series.jsonl.tar.gz");
const recipe = importRecipe(), verifiedDigests = {};
const fingerprint = createHash("sha256").update(recipe);
for (const [source, file] of [["anime", animeFile], ["publications", archive]]) {
  const digest = fs.existsSync(file) ? await digestFile(file) : null;
  if (digest && readJson(file + ".source.json")?.digest !== `sha256:${digest}`) throw new Error(`${source} snapshot integrity failure`);
  verifiedDigests[source] = digest;
  fingerprint.update(digest || "missing");
}
if (!empty) fingerprint.update(await digestFile(path.resolve("public/data/catalog.parquet")));
const retainedManifest = path.join(output, "data/catalog.manifest.json");
fingerprint.update(JSON.stringify({ empty, retainedRevision: fs.existsSync(retainedManifest) ? await digestFile(retainedManifest) : null }));
const signature = fingerprint.digest("hex");
const cached = await loadImportCheckpoint(output, signature);
const lastImport = readJson(path.join(output, "imports.json"));
const retainedRevision = fs.existsSync(retainedManifest) ? readJson(retainedManifest)?.revision : null;
const snapshotSignature = createHash("sha256").update(JSON.stringify({ ...verifiedDigests, recipe })).digest("hex");
let result;
if (retained.length && lastImport?.revision === retainedRevision && lastImport.signature === snapshotSignature) {
  const retainedMerger = createConsolidator(previous, registry, { onFieldConflict: conflictSink.add });
  for (const row of legacy) retainedMerger.add(row);
  result = retainedMerger.finish();
  sources = lastImport.sources; rejected = lastImport.rejected;
  console.log(`[Importação] snapshots já incorporados; ${result.rows.length} obras preservadas`);
} else if (cached) {
  result = cached.result; sources = cached.metadata.sources; rejected = cached.metadata.rejected;
  console.log(`[Importação] checkpoint validado; ${result.rows.length} obras recuperadas`);
} else {
progress("importing");
const consolidator = createConsolidator(previous, registry, { onFieldConflict: conflictSink.add });
if (retained.length) for (const row of legacy) consolidator.add(row);
if (fs.existsSync(animeFile)) {
  const buffer = fs.readFileSync(animeFile), provenance = readJson(animeFile + ".source.json");
  if ("sha256:" + createHash("sha256").update(buffer).digest("hex") !== provenance?.digest) throw new Error("Anime snapshot integrity failure");
  const snapshot = JSON.parse(buffer);
  for (const record of snapshot.data) {
    try { consolidator.add(offlineAnimeRecord(record, { ...provenance, version: provenance.tag, sourceUpdatedAt: snapshot.lastUpdate, importedAt: provenance.downloadedAt })); }
    catch (error) { rejected.push({ source: "anime-offline-database", title: record.title, reason: error.message }); }
  }
  sources.anime = { state: "imported", records: snapshot.data.length, provenance };
} else sources.anime = { state: "unavailable", reason: "Validated snapshot not downloaded" };
saveRegistry(registryFile, registry, loaded);
const provenance = readJson(archive + ".source.json");
if (fs.existsSync(archive) && provenance?.digest) {
  if ("sha256:" + await digestFile(archive) !== provenance.digest) throw new Error("Publication snapshot integrity failure");
  let count = 0, normalizedRecords = 0, normalizedControls = 0, retired = 0, acceptedRedirects = 0;
  const states = {};
  for await (const record of readMangaBakaArchive(archive, { onNormalization: event => { normalizedRecords++; normalizedControls += event.normalizedControls; } })) {
    states[record.state || "unknown"] = (states[record.state || "unknown"] || 0) + 1;
    if (["deleted", "merged"].includes(record.state) || record.merged_with) {
      retired++;
      if (record.merged_with) {
        try { addMangaBakaRedirect(registry, record, provenance); acceptedRedirects++; }
        catch (error) { rejected.push({ source: "mangabaka-redirect", id: record.id, reason: error.message }); }
      }
    }
    else {
      try { consolidator.add(mangabakaRecord(record, { ...provenance, version: provenance.sourceUpdatedAt })); }
      catch (error) { rejected.push({ source: "mangabaka", id: record.id, reason: error.message }); }
    }
    if (++count % 10000 === 0) {
      if (count % 50000 === 0) saveRegistry(registryFile, registry);
      progress("importing", { source: "mangabaka", records: count });
      console.log(`[MangaBaka] ${count} registros processados${count % 50000 === 0 ? "; identidades salvas" : ""}`);
    }
  }
  sources.publications = { state: "imported", records: count, retired, acceptedRedirects, states, normalizedRecords, normalizedControls, provenance };
  if (await digestFile(archive) !== verifiedDigests.publications) throw new Error("Publication snapshot changed during import");
} else sources.publications = { state: "unavailable", reason: "Validated publication snapshot not downloaded" };
result = consolidator.finish();
conflictSink.flush();
saveRegistry(registryFile, registry);
await saveImportCheckpoint(output, signature, result, { sources, rejected });
}
const pendingRelationsFile = path.join(output, "runs", runId, "pending-relations.jsonl");
const malDirectory = path.join(sourceDirectory, "myanimelist");
const malRead = process.env.MAL_CLIENT_ID ? createMalClient(process.env.MAL_CLIENT_ID, { cooldownFile: path.join(malDirectory, "source-cooldown.json") }) : null;
progress("discovering", { works: result.rows.length });
const discovery = await discoverWorkRecords({ malRead, directory: sourceDirectory });
const discoveryMerger = createConsolidator(result.rows, registry, { migrateExisting: false, onFieldConflict: conflictSink.add });
for (const row of discovery.records) discoveryMerger.add(row);
result.rows = discoveryMerger.finish().rows;
let enrichment = { state: "unavailable", reason: "MAL credentials not configured" };
if (malRead) {
  progress("enriching", { source: "myanimelist", works: result.rows.length });
  const enriched = await refreshMalWorks(result.rows, malRead, {
    onProgress: state => progress("enriching", { source: "myanimelist", ...state }),
    directory: malDirectory, requestBudget: Number(process.env.MAL_DETAIL_BUDGET || 200),
  });
  const merger = createConsolidator(result.rows, registry, { migrateExisting: false, onFieldConflict: conflictSink.add });
  for (const row of enriched.records) merger.add(row);
  const merged = merger.finish();
  result.rows = merged.rows;
  enrichment = { report: enriched.report, rejected: enriched.rejected, consolidation: merged.report, health: applyMalSourceHealth(result.rows, enriched.health) };
}
progress("validating", { works: result.rows.length });
const supplemental = await supplementCatalog(result.rows, { dataDirectory: path.join(output, "data"), sourceDirectory,
  ...(empty ? { publicDirectory: path.join(output, "data") } : {}), episodeBudget: Number(process.env.EPISODE_DETAIL_BUDGET || 100) });
const pendingSink = createJsonlSink(pendingRelationsFile);
for (const row of result.rows) registry.works[row.work_id].title=row.title;
saveRegistry(registryFile, registry);
const relations = syncSqlWorkGraph(result.rows, registry, { onPending: pendingSink.add, onConflict: pendingSink.add });
const children = syncSqlChildren(result.rows, path.join(output, "data"));
conflictSink.flush(); pendingSink.flush();
for (const row of result.rows) row.capabilities_json = JSON.stringify(workCapabilities(row));
const assets = supplemental.assets;
const report = { runId, conflictFile, pendingRelationsFile, relations, children, sources, discovery: discovery.report, enrichment, supplemental, availability: snapshotState || {}, consolidation: result.report, rejected, assets, contracts: SOURCE_CONTRACTS, catalogComplete: false };
report.sourceReadiness = sourceReadiness(report);
writeJson(path.join(output, "report.json"), report);
const summary = { catalogComplete: false, sources: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, {
  state: value.state, records: value.records, version: value.provenance?.tag || value.provenance?.sourceUpdatedAt || null,
}])), rejected: rejected.length + result.report.conflicts.length, fieldConflicts: result.report.fieldConflicts, assets };
progress("publishing-candidate", { works: result.rows.length });
assertSqlRegistrySnapshot(registry);
const manifest = await publishGeneration(result.rows, previous, path.join(output, "data"), { report: summary, indexDirectory: path.join(output, "indexes") });
writeJson(path.join(output, "imports.json"), { revision: manifest.revision, signature: snapshotSignature, sources, rejected });
progress("candidate-ready", { generation: manifest.generation, works: manifest.works });
console.log(JSON.stringify({ output, generation: manifest.generation, works: manifest.works,
  inserted: result.report.inserted, partitions: manifest.files.length, rejected: rejected.length + result.report.conflicts.length, sources: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, value.state])) }));
