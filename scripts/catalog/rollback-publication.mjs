import path from "node:path";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { auditGeneration } from "./audit-generation.mjs";
import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";
import { loadRegistry } from "./registry-store.mjs";
import { assertSqlRegistrySnapshot } from "./sql-registry-snapshot.mjs";

export async function rollbackPublication({ dataDirectory, privateDirectory, identityDatabase }) {
  const file = path.join(dataDirectory, "catalog.manifest.json"), current = readJson(file), previous = readJson(file + ".previous");
  if (!current || !WORK_UUID.test(current.generation)) throw new Error("No valid current publication to roll back");
  if (previous?.identities?.schema!==1 || previous.identities.authority!=="sql") throw new Error("No verified canonical publication to restore; legacy identity rollback is disabled");
  const registry = loadRegistry(path.join(privateDirectory, "registries", current.generation + ".json"), {database:identityDatabase}).registry;
  await auditGeneration(dataDirectory, { registry, indexDirectory:path.join(privateDirectory, "indexes"), manifest:previous });
  assertSqlRegistrySnapshot(registry,identityDatabase);
  writeJson(file + ".previous", current);
  writeJson(file, previous);
  return {state:"restored",generation:previous.generation};
}
