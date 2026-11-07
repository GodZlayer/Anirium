import fs from "node:fs";
import path from "node:path";
import { auditGeneration } from "./audit-generation.mjs";
import { loadCatalog } from "./load-catalog.mjs";

export async function loadGeneration(directory, registry) {
  if (!fs.existsSync(path.join(directory, "catalog.manifest.json"))) return [];
  await auditGeneration(directory, { registry, indexDirectory: path.resolve(directory, "../indexes") });
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "catalog.manifest.json"), "utf8"));
  const rows = [];
  for (const descriptor of manifest.files) rows.push(...(await loadCatalog(path.join(directory, descriptor.url.slice(6)))).rows);
  return rows;
}
