import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function registryConnection(database = process.env.CATALOG_IDENTITY_DATABASE) {
  if (!database || !path.isAbsolute(database) || !fs.existsSync(database)) {
    throw new Error("Canonical SQL identity database required; run the Laravel catalog command");
  }
  const db = new DatabaseSync(database);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; PRAGMA cache_size=-65536");
    for (const table of ["catalog_entities", "catalog_works", "catalog_external_identities", "catalog_entity_aliases", "catalog_registry_metadata", "catalog_source_redirects"]) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new Error("Canonical SQL identity schema is not ready");
    }
    if (db.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode!=="wal") throw new Error("Canonical SQL catalog requires WAL for concurrent account access");
    return db;
  } catch (error) { db.close(); throw error; }
}

export function rejectUnmigratedRegistry(db, file) {
  if (!db.prepare("SELECT 1 FROM catalog_works LIMIT 1").get() && fs.existsSync(file)) {
    throw new Error("SQL catalog migration required; refusing to recreate identities from legacy JSON");
  }
}
