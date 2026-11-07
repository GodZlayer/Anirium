import path from "node:path";
import { loadRegistry, saveRegistry } from "./registry-store.mjs";
import { loadGeneration } from "./load-generation.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { publishGeneration } from "./publish-generation.mjs";
import { syncSqlWorkGraph } from "./sql-work-graph.mjs";
import { syncSqlChildren } from "./sql-children-sync.mjs";
import { workCapabilities } from "./work-capabilities.mjs";
import { verifyCatalogAssets } from "./verify-catalog-assets.mjs";
import { auditGeneration } from "./audit-generation.mjs";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { refreshMalWorks } from "./mal-work-stage.mjs";
import { createConsolidator } from "./consolidate-snapshot.mjs";
import { applyMalSourceHealth } from "./mal-source-health.mjs";

export async function reprojectCandidate(output, { includeCachedMetadata = true, cacheDirectory = path.resolve("storage/app/catalog/myanimelist"), beforePublish = () => {}, identityDatabase } = {}) {
  const registryFile = path.join(output, "registry.json"), loaded = loadRegistry(registryFile,{database:identityDatabase});
  const directory = path.join(output, "data"), indexDirectory = path.join(output, "indexes");
  const oldManifest = readJson(path.join(directory, "catalog.manifest.json"));
  // Legacy publications are verified inputs during migration; assignIdentity and
  // saveRegistry reconcile every row against SQL before sealing a new version.
  const previous = await loadGeneration(directory, oldManifest?.identities?.authority === "sql" ? loaded.registry : undefined);
  if (!previous.length) throw new Error("No verified candidate to reproject");
  let reclassified = 0;
  let rows = previous.map(row => {
    const next = assignIdentity(row, loaded.registry);
    if (next.entity_type !== row.entity_type) reclassified++;
    if (next.field_provenance_json) {
      const provenance = JSON.parse(next.field_provenance_json);
      for (const evidence of Object.values(provenance.evidence || {})) if (evidence.provider === "anime-offline-database" && !evidence.license) evidence.license = "ODbL-1.0 + DbCL-1.0";
      next.field_provenance_json = JSON.stringify(provenance);
    }
    return next;
  });
  let cached = null, health = null;
  if (includeCachedMetadata) {
    cached = await refreshMalWorks(rows, () => { throw new Error("Offline projection cannot query a provider"); }, { directory: cacheDirectory, requestBudget: 0, timeBudgetMs: 0 });
    const merger = createConsolidator(rows, loaded.registry, { migrateExisting: false });
    for (const record of cached.records) merger.add(record);
    const result = merger.finish();
    rows = result.rows;
    health = applyMalSourceHealth(rows, cached.health);
  }
  const oldMedia = new Map(previous.map(row => [row.work_id, row.entity_type]));
  reclassified = rows.filter(row => oldMedia.has(row.work_id) && oldMedia.get(row.work_id) !== row.entity_type).length;
  const assets = verifyCatalogAssets(rows, directory);
  for (const row of rows) row.capabilities_json = JSON.stringify(workCapabilities(row));
  await beforePublish();
  if (readJson(path.join(directory, "catalog.manifest.json"))?.revision !== oldManifest.revision) throw new Error("Candidate changed during projection");
  saveRegistry(registryFile, loaded.registry, loaded);
  const relations = syncSqlWorkGraph(rows,loaded.registry,{database:loaded.database});
  const children = syncSqlChildren(rows,directory,{database:loaded.database});
  const projection = { checkedAt: new Date().toISOString(), reclassified, health, children, cachedCoverage: cached?.report || null };
  const manifest = await publishGeneration(rows, previous, directory, { indexDirectory, identityDatabase:loaded.database, report: { ...oldManifest.report, catalogComplete: false, projection, relations, assets } });
  const audit = await auditGeneration(directory, { registry: loaded.registry, indexDirectory });
  const imports = readJson(path.join(output, "imports.json"));
  if (imports?.revision === oldManifest.revision) writeJson(path.join(output, "imports.json"), { ...imports, revision: manifest.revision });
  writeJson(path.join(output, "report.json"), { ...readJson(path.join(output, "report.json")), projection, relations, assets, catalogComplete: false });
  return { projection, generation: manifest.generation, audit };
}
