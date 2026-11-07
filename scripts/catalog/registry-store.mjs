import { writeJson } from "./mal-detail-cache.mjs";
import { validateRegistry } from "./work-registry.mjs";
import { registryConnection, rejectUnmigratedRegistry } from "./sql-registry-connection.mjs";
import { readSqlRegistry } from "./sql-registry-read.mjs";
import { writeSqlRegistry } from "./sql-registry-write.mjs";

export function loadRegistry(file, {database = process.env.CATALOG_IDENTITY_DATABASE} = {}) {
  const db = registryConnection(database);
  try {
    rejectUnmigratedRegistry(db,file);
    db.exec("BEGIN");
    const registry = readSqlRegistry(db);
    db.exec("COMMIT");
    return {registry,recovered:false,database};
  } finally { db.close(); }
}

export function saveRegistry(file, registry, {database = process.env.CATALOG_IDENTITY_DATABASE} = {}) {
  validateRegistry(registry);
  const db = registryConnection(database);
  let result;
  try { rejectUnmigratedRegistry(db,file); result=writeSqlRegistry(db,registry); }
  finally { db.close(); }
  // Compatibility snapshot only. Failure here cannot roll SQL identities back.
  writeJson(file, registry);
  return result;
}
