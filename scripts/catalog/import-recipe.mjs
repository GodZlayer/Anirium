import fs from "node:fs";
import { createHash } from "node:crypto";

// Only code that changes bulk normalization invalidates the imported snapshots.
const INPUTS = [
  "offline-anime-record", "mangabaka-record", "provider-reference", "external-identity",
  "assign-identities", "work-registry", "source-redirects", "field-provenance", "field-policy", "sql-registry-plan",
  "consolidate-snapshot", "written-kind-reconciliation", "mangabaka-relations", "json-record-stream", "read-mangabaka-archive",
].map(name => `scripts/catalog/${name}.mjs`).concat([
  "scripts/catalog/import-recipe.mjs", "scripts/catalog/registry-store.mjs", "scripts/catalog/sql-registry-read.mjs", "scripts/catalog/sql-registry-write.mjs", "scripts/catalog/sql-registry-preservation.mjs", "resources/js/lib/catalogIdentity.mjs", "resources/js/lib/catalogAliases.mjs",
]);
export function importRecipe({ read = file => fs.readFileSync(file) } = {}) {
  const hash = createHash("sha256").update("anirium-bulk-import-v2");
  for (const file of INPUTS) hash.update(file).update("\0").update(read(file));
  return hash.digest("hex");
}
