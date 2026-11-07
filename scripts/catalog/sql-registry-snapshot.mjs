import { registryConnection } from "./sql-registry-connection.mjs";
import { readSqlRegistry } from "./sql-registry-read.mjs";
import { assertRegistryPreserved } from "./sql-registry-preservation.mjs";

export function assertSqlRegistrySnapshot(registry, database = process.env.CATALOG_IDENTITY_DATABASE) {
  const db = registryConnection(database);
  try {
    db.exec("BEGIN");
    const current = readSqlRegistry(db);
    assertRegistryPreserved(current,registry);
    assertRegistryPreserved(registry,current);
    db.exec("COMMIT");
  } finally { db.close(); }
}
