import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { auditGeneration, isGenerationAuditReceipt } from "./audit-generation.mjs";
import { loadCatalog } from "./load-catalog.mjs";
import { loadRegistry } from "./registry-store.mjs";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { digestFile } from "./download-snapshot.mjs";
import { auditCatalogContent } from "./content-audit.mjs";
import { assertSqlRegistrySnapshot } from "./sql-registry-snapshot.mjs";
import { assertSqlUniverseProjection } from "./sql-universe-verification.mjs";

async function rowsFor(directory, manifest) {
  const rows = [];
  for (const descriptor of manifest.files) rows.push(...(await loadCatalog(path.join(directory, descriptor.url.slice(6)))).rows);
  return rows;
}
async function copyVerified(source, destination, digest) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) {
    if (await digestFile(destination) !== digest) throw new Error("Immutable published asset collision");
    return;
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.copyFileSync(source, temporary);
    if (await digestFile(temporary) !== digest) throw new Error("Published asset copy checksum mismatch");
    fs.renameSync(temporary, destination);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export async function promoteCandidate(candidate, { dataDirectory, privateDirectory, beforeCommit = () => {}, registry: suppliedRegistry, auditReceipt, onProgress = () => {}, identityDatabase } = {}) {
  const auditProgress = phase => detail => onProgress({ phase, ...detail });
  if (path.resolve(candidate, "data") === path.resolve(dataDirectory)) throw new Error("Candidate must be separate from publication");
  const manifestFile = path.join(candidate, "data/catalog.manifest.json"), manifest = readJson(manifestFile);
  if (manifest?.identities?.schema!==1 || manifest.identities.authority!=="sql") throw new Error("Candidate requires canonical SQL universe identities");
  const registry = suppliedRegistry || loadRegistry(path.join(candidate, "registry.json"), {database:identityDatabase}).registry;
  assertSqlRegistrySnapshot(registry,identityDatabase);
  if (!manifest?.search || manifest.search.schema < 2) throw new Error("Candidate search index is not ready");
  if (auditReceipt && !isGenerationAuditReceipt(auditReceipt, path.join(candidate, "data"), manifest, registry)) throw new Error("Stale or invalid candidate audit receipt");
  if (!auditReceipt) await auditGeneration(path.join(candidate, "data"), { registry, indexDirectory: path.join(candidate, "indexes"), onProgress: auditProgress("auditing-candidate") });
  onProgress({ phase: "loading-candidate" });
  const rows = await rowsFor(path.join(candidate, "data"), manifest);
  assertSqlUniverseProjection(rows,identityDatabase);
  const destination = path.join(dataDirectory, "catalog.manifest.json"), previousManifest = readJson(destination);
  if (previousManifest?.generation === manifest.generation && previousManifest.revision !== manifest.revision) throw new Error("Immutable publication generation changed");
  const indexes = path.join(privateDirectory, "indexes");
  let previous = [];
  if (previousManifest) {
    await auditGeneration(dataDirectory, { indexDirectory: indexes, onProgress: auditProgress("auditing-previous") });
    onProgress({ phase: "loading-previous" });
    previous = await rowsFor(dataDirectory, previousManifest);
  }
  const legacy = path.join(dataDirectory, "catalog.parquet");
  if (fs.existsSync(legacy)) previous.push(...(await loadCatalog(legacy)).rows);
  onProgress({ phase: "comparing-content", candidateWorks: rows.length, previousWorks: previous.length });
  const audit = auditCatalogContent(rows, previous, { dataDirectory: path.join(candidate, "data"), previousDirectory: dataDirectory });
  onProgress({ phase: "copying-assets" });
  for (const asset of [...manifest.files, manifest.lookup]) {
    const relative = asset.url.slice(6);
    await copyVerified(path.join(candidate, "data", relative), path.join(dataDirectory, relative), asset.sha256);
  }
  for (const row of rows) {
    if (!row.episodes_metadata_url) continue;
    const relative = row.episodes_metadata_url.slice(6), source = path.join(candidate, "data", relative);
    await copyVerified(source, path.join(dataDirectory, relative), await digestFile(source));
  }
  await copyVerified(path.join(candidate, "indexes", `${manifest.generation}.sqlite`), path.join(indexes, `${manifest.generation}.sqlite`), manifest.search.sha256);
  writeJson(path.join(privateDirectory, "registries", `${manifest.generation}.json`), registry);
  await auditGeneration(dataDirectory, { registry, indexDirectory: indexes, manifest, onProgress: auditProgress("auditing-destination") });
  onProgress({ phase: "committing-manifest" });
  await beforeCommit();
  assertSqlRegistrySnapshot(registry,identityDatabase);
  assertSqlUniverseProjection(rows,identityDatabase);
  if (readJson(manifestFile)?.revision !== manifest.revision) throw new Error("Candidate changed during publication");
  if (readJson(destination)?.generation !== previousManifest?.generation) throw new Error("Published version changed concurrently");
  writeJson(path.join(privateDirectory, "audits", `${manifest.generation}.json`), { generation: manifest.generation, revision: manifest.revision, checkedAt: new Date().toISOString(), ...audit });
  if (fs.existsSync(destination) && previousManifest?.generation !== manifest.generation) fs.copyFileSync(destination, destination + ".previous");
  writeJson(destination, manifest);
  onProgress({ phase: "manifest-published", generation: manifest.generation });
  return { generation: manifest.generation, works: rows.length, ...audit };
}
