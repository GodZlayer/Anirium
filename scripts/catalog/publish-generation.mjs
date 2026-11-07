import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { publishCatalog, validatePublicationIdentities } from "./publish-catalog.mjs";
import { catalogAliases } from "../../resources/js/lib/catalogAliases.mjs";
import { writeJson } from "./mal-detail-cache.mjs";
import { buildSearchIndex } from "./search-index.mjs";
import { assertSqlUniverseProjection } from "./sql-universe-verification.mjs";

export async function publishGeneration(rows, previousRows, directory, { report, chunkSize = 5000, indexDirectory, identityDatabase=process.env.CATALOG_IDENTITY_DATABASE } = {}) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error("Invalid catalog partition size");
  validatePublicationIdentities(rows, previousRows);
  if (identityDatabase) assertSqlUniverseProjection(rows,identityDatabase);
  const identities=identityDatabase ? {schema:1,authority:"sql",roles:["work","universe"]} : null;
  const generation = randomUUID(), relative = `catalog/v2/${generation}`, files = [], aliases = {};
  const root = path.join(directory, relative);
  fs.mkdirSync(root, { recursive: true });
  for (const [media, entity] of [["anime", "WORK"], ["manga", "MANGA"], ["novel", "NOVEL"]]) {
    const selected = rows.filter(row => (row.entity_type || "WORK") === entity).sort((a, b) => a.work_id.localeCompare(b.work_id));
    for (let offset = 0; offset < selected.length; offset += chunkSize) {
      const slice = selected.slice(offset, offset + chunkSize), name = `${media}-${String(offset / chunkSize).padStart(5, "0")}.parquet`;
      const file = path.join(root, name), publication = await publishCatalog(slice, [], file);
      const url = `/data/${relative}/${name}`;
      const descriptor = { media, url, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"), ...publication };
      files.push(descriptor);
      for (const row of slice) for (const alias of [row.catalog_key, ...catalogAliases(row)]) {
        if (aliases[alias] && aliases[alias].work_id !== row.work_id) throw new Error("Conflicting generation lookup alias");
        aliases[alias] = { work_id: row.work_id, url };
      }
    }
  }
  const lookupFile = path.join(root, "lookup.json");
  writeJson(lookupFile, aliases);
  const lookup = { url: `/data/${relative}/lookup.json`, sha256: createHash("sha256").update(fs.readFileSync(lookupFile)).digest("hex") };
  const search = indexDirectory ? await buildSearchIndex(rows, indexDirectory, generation, { locationFor: row => aliases[row.catalog_key].url }) : undefined;
  const identityFields=identities ? {identities} : {};
  const manifest = { schema: 2, generation, publishedAt: new Date().toISOString(), works: rows.length, files, lookup, ...(search ? { search } : {}),...identityFields,
    revision: createHash("sha256").update(JSON.stringify({ files, lookup, ...(search ? { search } : {}),...identityFields })).digest("hex"), report };
  const destination = path.join(directory, "catalog.manifest.json");
  if (fs.existsSync(destination)) fs.copyFileSync(destination, destination + ".previous");
  writeJson(destination, manifest);
  return manifest;
}
