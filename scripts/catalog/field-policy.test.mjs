import test from "node:test";
import assert from "node:assert/strict";
import { consolidateSnapshot } from "./consolidate-snapshot.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { mangabakaRecord } from "./mangabaka-record.mjs";
import { newerSameSource, mergeRawRelations } from "./field-policy.mjs";

test("new observations from the same source update metadata, while recent imports of old data cannot", () => {
  const source = { importedAt: "2026-10-21", version: "fixture", digest: "fixture" };
  const record = { id: 1, title: "Novel", type: "novel", state: "active", status: "ongoing", total_chapters: "20", last_updated_at: "2026-10-19" };
  const registry = emptyRegistry();
  const first = consolidateSnapshot([], [mangabakaRecord(record, source)], registry).rows;
  const stale = consolidateSnapshot(first, [mangabakaRecord({ ...record, total_chapters: "10", last_updated_at: "2026-10-18" }, source)], registry);
  assert.equal(stale.rows[0].chapters_count, 20);
  assert.ok(stale.report.fieldConflicts > 0);
  const fresh = consolidateSnapshot(first, [mangabakaRecord({ ...record, total_chapters: "21", last_updated_at: "2026-10-20" }, source)], registry);
  assert.equal(fresh.rows[0].chapters_count, 21);
  assert.equal(newerSameSource({ provider: "mal", observed_at: "2026-10-19" }, { provider: "jikan", observed_at: "2026-10-20" }), false);
});

test("raw relations preserve every provider and unknown relation type", () => {
  const a = { source: "mal", relation_type: "other" }, b = { source: "snapshot", relation_type: "unspecified" };
  assert.deepEqual(JSON.parse(mergeRawRelations(JSON.stringify([a]), JSON.stringify([a, b]))), [a, b]);
});
