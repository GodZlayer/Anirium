import fs from "node:fs";
import { assertPublicationRegistryIdentity } from "./publication-registry-identity.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadCatalog } from "./load-catalog.mjs";
import { catalogAliases, WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";
import { digestFile } from "./download-snapshot.mjs";
import { DatabaseSync } from "node:sqlite";

const receipts = new WeakMap();
export function isGenerationAuditReceipt(receipt, directory, manifest, registry) {
  const issued = receipt && receipts.get(receipt);
  return Boolean(issued && issued.directory === path.resolve(directory) && issued.revision === manifest.revision
    && issued.generation === manifest.generation && issued.registry === registry);
}

export async function auditGeneration(directory, { registry, indexDirectory, manifest: suppliedManifest, onProgress = () => {} } = {}) {
  const manifest = suppliedManifest || JSON.parse(fs.readFileSync(path.join(directory, "catalog.manifest.json"), "utf8"));
  if (manifest.schema !== 2 || !WORK_UUID.test(manifest.generation) || !manifest.files?.length || !manifest.works) throw new Error("Invalid generation manifest");
  if (manifest.identities && (manifest.identities.schema!==1 || manifest.identities.authority!=="sql"
    || !Array.isArray(manifest.identities.roles) || manifest.identities.roles.length!==2
    || !manifest.identities.roles.includes("work") || !manifest.identities.roles.includes("universe"))) throw new Error("Invalid publication identity contract");
  function checkedFile(descriptor) {
    const prefix = `/data/catalog/v2/${manifest.generation}/`;
    if (!descriptor.url?.startsWith(prefix) || !/^[a-z0-9][a-z0-9._-]*\.(json|parquet)$/.test(descriptor.url.slice(prefix.length))) throw new Error("Invalid generation asset path");
    const file = path.join(directory, descriptor.url.slice(6));
    const bytes = fs.readFileSync(file);
    if (createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) throw new Error("Generation asset checksum mismatch");
    return { file, bytes };
  }
  const progress = stage => onProgress({ stage, generation: manifest.generation, partitionsChecked: partitions, partitionsTotal: manifest.files.length, worksChecked: seen.size, worksTotal: manifest.works });
  let partitions = 0;
  const seen = new Set(), aliases = new Set();
  progress("lookup");
  const lookup = JSON.parse(checkedFile(manifest.lookup).bytes);
  const media = { anime: "WORK", manga: "MANGA", novel: "NOVEL" }, counts = {};
  for (const descriptor of manifest.files) {
    progress("partitions");
    if (!media[descriptor.media]) throw new Error("Invalid generation media partition");
    const { file, bytes } = checkedFile(descriptor);
    const snapshot = await loadCatalog(file);
    if (snapshot.recovered || snapshot.rows.length !== descriptor.rows || bytes.length !== descriptor.bytes) throw new Error("Generation partition dimensions mismatch");
    for (const row of snapshot.rows) {
      if (!row.work_id || row.entity_type !== media[descriptor.media] || seen.has(row.work_id)) throw new Error("Generation work identity mismatch");
      assertPublicationRegistryIdentity(row,registry);
      seen.add(row.work_id);
      for (const alias of [row.catalog_key, ...catalogAliases(row)]) {
        if (lookup[alias]?.work_id !== row.work_id || lookup[alias]?.url !== descriptor.url) throw new Error("Generation lookup mismatch");
        aliases.add(alias);
      }
    }
    counts[descriptor.media] = (counts[descriptor.media] || 0) + snapshot.rows.length;
    partitions++;
    progress("partitions");
  }
  if (seen.size !== manifest.works || Object.keys(lookup).length !== aliases.size) throw new Error("Generation totals mismatch");
  if (manifest.search) {
    progress("search-index");
    if (!indexDirectory || manifest.search.generation !== manifest.generation || manifest.search.works !== seen.size) throw new Error("Invalid search index descriptor");
    const indexFile = path.join(indexDirectory, manifest.generation + ".sqlite");
    if (await digestFile(indexFile) !== manifest.search.sha256) throw new Error("Search index checksum mismatch");
    const db = new DatabaseSync(indexFile, { readOnly: true });
    try {
      db.exec("PRAGMA cache_size=-65536");
      if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("SELECT count(*) AS total FROM works").get().total !== seen.size) throw new Error("Search index dimensions mismatch");
    } finally { db.close(); }
  }
  progress("revision");
  const revision = createHash("sha256").update(JSON.stringify({ files: manifest.files, lookup: manifest.lookup, ...(manifest.search ? { search: manifest.search } : {}),...(manifest.identities ? {identities:manifest.identities} : {}) })).digest("hex");
  if (revision !== manifest.revision) throw new Error("Generation revision mismatch");
  const receipt = Object.freeze({ generation: manifest.generation, revision: manifest.revision, works: seen.size, partitions: manifest.files.length, media: counts, integrity: "verified" });
  receipts.set(receipt, { directory: path.resolve(directory), revision: manifest.revision, generation: manifest.generation, registry });
  progress("verified");
  return receipt;
}
