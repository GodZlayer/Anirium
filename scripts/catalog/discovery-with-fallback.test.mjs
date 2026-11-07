import test from "node:test";
import assert from "node:assert/strict";
import { discoveryWithFallback } from "./discovery-with-fallback.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publishCatalog } from "./publish-catalog.mjs";
import { loadCatalog } from "./load-catalog.mjs";
import { refreshAniZipBatch, applyAniZipEpisodes } from "./anizip-batch.mjs";

test("discovery outage permits independent enrichment without inventing discovery freshness", async () => {
  const existing = [{ mal_id: 1, title: "Known" }];
  const result = await discoveryWithFallback(async () => { throw Object.assign(new Error("private response"), { status: 401 }); }, existing);
  assert.deepEqual(result, { records: [], completedAt: null, stale: true, error: { status: 401, code: "DISCOVERY_UNAVAILABLE" } });
  assert.deepEqual(existing, [{ mal_id: 1, title: "Known" }]);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("cold bootstrap cannot claim success from a failed discovery", async () => {
  const failure = new Error("offline");
  await assert.rejects(discoveryWithFallback(async () => { throw failure; }, []), error => error === failure);
});

test("successful and stale discoveries keep their original coverage and timestamps", async () => {
  const result = { records: [{ id: 1, mal_id: 1 }], completedAt: "2026-10-21T00:00:00Z", stale: true };
  assert.equal(await discoveryWithFallback(async () => result, [{ mal_id: 2 }]), result);
});

test("validated catalog receives and publishes episode updates while discovery is offline", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-offline-enrichment-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const file = path.join(directory, "catalog.parquet");
  await publishCatalog([{ mal_id: 1, entity_type: "WORK", title: "Known", episodes: 1 }], [], file);
  const snapshot = await loadCatalog(file);
  const discovery = await discoveryWithFallback(async () => { throw new Error("offline"); }, snapshot.rows);
  const batch = await refreshAniZipBatch(snapshot.rows, async () => ({ mappings: { mal_id: 1 }, episodes: {
    "1": { episode: "1", title: { en: "Real source title" }, airDateUtc: "2020-01-01T00:00:00Z" },
  } }), { directory: path.join(directory, "cache"), requestBudget: 1 });
  const entities = new Map(snapshot.rows.map(row => [row.mal_id, { ...row }]));
  const coverage = applyAniZipEpisodes(entities, batch, path.join(directory, "episodes"));
  await publishCatalog([...entities.values()], snapshot.rows, file);
  const published = await loadCatalog(file);
  assert.equal(published.rows[0].title, "Known");
  assert.equal(published.rows[0].episodes_indexed_count, 1);
  assert.equal(coverage.publishedWorks, 1);
  assert.equal(discovery.completedAt, null);
  assert.equal(discovery.stale, true);
});
