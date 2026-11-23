import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ALLOWED_JOURNAL_MODES = new Set(["WAL", "DELETE", "TRUNCATE", "PERSIST", "MEMORY"]);

export function registryConnection(database = process.env.CATALOG_IDENTITY_DATABASE) {
  if (!database || !path.isAbsolute(database) || !fs.existsSync(database)) {
    throw new Error("Canonical SQL identity database required; run the Laravel catalog command");
  }
  const requestedMode = String(process.env.CATALOG_SQLITE_JOURNAL_MODE || "WAL").trim().toUpperCase();
  const journalMode = ALLOWED_JOURNAL_MODES.has(requestedMode) ? requestedMode : "WAL";
  const rawTimeout = Number(process.env.CATALOG_SQLITE_BUSY_TIMEOUT || 30000);
  const busyTimeout = Number.isFinite(rawTimeout) ? Math.min(120000, Math.max(1000, Math.trunc(rawTimeout))) : 30000;
  const db = new DatabaseSync(database);
  try {
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=${busyTimeout}; PRAGMA cache_size=-65536`);
    for (const table of ["catalog_entities", "catalog_works", "catalog_external_identities", "catalog_entity_aliases", "catalog_registry_metadata", "catalog_source_redirects"]) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new Error("Canonical SQL identity schema is not ready");
    }
    if (String(db.prepare(`PRAGMA journal_mode=${journalMode}`).get()?.journal_mode || "").toLowerCase() !== journalMode.toLowerCase()) {
      throw new Error(`Canonical SQL catalog failed to activate ${journalMode} journal mode`);
    }
    return db;
  } catch (error) { db.close(); throw error; }
}

export const READ_PAGE_SIZE = 5000;

function pauseMs(rawValue, defaultMs, maxMs) {
  const raw = Number(rawValue ?? defaultMs);
  const ms = Number.isFinite(raw) ? Math.min(maxMs, Math.max(0, Math.trunc(raw))) : defaultMs;
  if (ms > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }
}

export function yieldBetweenBatches() {
  pauseMs(process.env.CATALOG_SQLITE_BATCH_YIELD_MS, 20, 1000);
}

export function yieldBetweenReadPages() {
  pauseMs(process.env.CATALOG_SQLITE_READ_YIELD_MS, 5, 500);
}

export function forEachKeysetPage(db, firstSql, nextSql, cursorField, onRow, pageSize = READ_PAGE_SIZE) {
  const firstStmt = db.prepare(firstSql);
  const nextStmt = db.prepare(nextSql);
  let rows = firstStmt.all();
  while (rows.length > 0) {
    for (const row of rows) onRow(row);
    if (rows.length < pageSize) break;
    const cursor = rows[rows.length - 1][cursorField];
    yieldBetweenReadPages();
    rows = nextStmt.all(cursor);
  }
}

export function rejectUnmigratedRegistry(db, file) {
  if (!db.prepare("SELECT 1 FROM catalog_works LIMIT 1").get() && fs.existsSync(file)) {
    throw new Error("SQL catalog migration required; refusing to recreate identities from legacy JSON");
  }
}
