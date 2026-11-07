import fs from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { digestFile } from "./download-snapshot.mjs";
import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";
import { catalogAliases } from "../../resources/js/lib/catalogAliases.mjs";

const SUMMARY = ["id", "mal_id", "work_id", "account_reference", "catalog_key", "entity_type", "title", "title_english", "title_japanese", "title_portuguese", "title_spanish", "title_french", "title_german", "synonyms_json", "aliases_json", "images_json", "genres_json", "score", "popularity", "year", "status", "format", "episodes", "chapters_count", "volumes_count", "universe_v2_id", "universe_ids_json", "universe_identity_version", "universe_reconciliation_pending", "continuity_root_work_id", "capabilities_json", "synopsis", "synopses_json", "studios_json", "metadata_source", "start_date", "end_date", "latest_episode_at", "latest_episode_num", "updated_at", "airing_day", "airing_time", "airing_timezone", "provider_health_json", "catalog_visibility", "catalog_visibility_reason"];
export async function buildSearchIndex(rows, directory, generation, { locationFor = row => row.partition_url || null } = {}) {
  if (!WORK_UUID.test(generation)) throw new Error("Invalid search index generation");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, generation + ".sqlite"), staging = `${file}.${randomUUID()}.tmp`;
  if (fs.existsSync(file)) throw new Error("Immutable search index generation already exists");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-search-")), temporary = path.join(scratch, "index.sqlite");
  let count = 0, staged = false;
  try {
  const db = new DatabaseSync(temporary);
  try {
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA cache_size=-65536; PRAGMA temp_store=MEMORY; CREATE TABLE works (work_id TEXT PRIMARY KEY, media TEXT NOT NULL, title TEXT NOT NULL, score REAL, year INTEGER, adult INTEGER NOT NULL, summary TEXT NOT NULL, partition_url TEXT); CREATE INDEX browse ON works(media, adult, score DESC, work_id); CREATE TABLE aliases(reference TEXT PRIMARY KEY, work_id TEXT NOT NULL); CREATE VIRTUAL TABLE search USING fts5(work_id UNINDEXED, terms, tokenize='unicode61 remove_diacritics 2'); BEGIN");
    const insert = db.prepare("INSERT INTO works VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const alias = db.prepare("INSERT INTO aliases VALUES (?, ?)");
    const search = db.prepare("INSERT INTO search VALUES (?, ?)");
    for await (const row of rows) {
      const media = { WORK: "anime", MANGA: "manga", NOVEL: "novel" }[row.entity_type];
      if (!media || !row.work_id || !row.title) throw new Error("Invalid search index work");
      const summary = Object.fromEntries(SUMMARY.filter(key => row[key] != null).map(key => [key, row[key]]));
      const genres = JSON.parse(row.genres_json || "[]").map(item => String(typeof item === "string" ? item : item.name).toLowerCase());
      const adult = ["hentai", "erotica", "rx", "pornographic"].some(label => genres.includes(label) || row.content_rating === label);
      insert.run(row.work_id, media, row.title, row.score ?? null, row.year ?? null, adult ? 1 : 0, JSON.stringify(summary), locationFor(row));
      for (const reference of new Set([row.catalog_key, ...catalogAliases(row)])) alias.run(reference, row.work_id);
      const synonyms = JSON.parse(row.synonyms_json || "[]");
      search.run(row.work_id, [row.title, row.title_english, row.title_japanese, row.title_portuguese, row.title_spanish, row.title_french, row.title_german, ...synonyms].filter(value => typeof value === "string").join(" "));
      count++;
    }
    db.exec("COMMIT; INSERT INTO search(search) VALUES('optimize');");
    db.exec("CREATE INDEX browse_visibility ON works(coalesce(json_extract(summary, '$.catalog_visibility'), 'visible'), media, adult, score DESC, work_id)");
    db.exec("CREATE INDEX feed_release ON works(media, json_extract(summary, '$.status'), adult, coalesce(json_extract(summary, '$.catalog_visibility'), 'visible'), coalesce(json_extract(summary, '$.latest_episode_at'), json_extract(summary, '$.start_date')) DESC, year DESC, score DESC, work_id)");
    db.exec("CREATE INDEX universe_members ON works(json_extract(summary, '$.universe_v2_id'))");
    db.exec("ANALYZE");
    if (!count || db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("SELECT count(*) AS total FROM works").get().total !== count) throw new Error("Search index integrity failure");
  } finally { db.close(); }
  const sha256 = await digestFile(temporary);
  fs.copyFileSync(temporary, staging, fs.constants.COPYFILE_EXCL); staged = true;
  if (await digestFile(staging) !== sha256) throw new Error("Search index copy checksum mismatch");
  const descriptor = fs.openSync(staging, "r+");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  if (fs.existsSync(file)) throw new Error("Immutable search index generation already exists");
  fs.renameSync(staging, file); staged = false;
  return { schema: 2, generation, sha256, works: count };
  } finally {
    if (staged && fs.existsSync(staging)) fs.unlinkSync(staging);
    const resolved = fs.realpathSync(scratch), parent = fs.realpathSync(os.tmpdir());
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith("anirium-search-") || fs.lstatSync(scratch).isSymbolicLink()) throw new Error("Unsafe search scratch directory");
    fs.rmSync(resolved, { recursive: true });
  }
}
