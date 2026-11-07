import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { refreshAniZipBatch, applyAniZipEpisodes } from "./anizip-batch.mjs";

test("episode backfill passes forty works, resumes cached entries and publishes immutable documents", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-episodes-test-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const works = Array.from({ length: 50 }, (_, i) => ({ mal_id: i + 1, entity_type: "WORK", status: "COMPLETED", episodes: 1 }));
  const requested = [];
  const read = async url => {
    const id = Number(new URL(url).searchParams.get("mal_id")); requested.push(id);
    return { mappings: { mal_id: id }, episodeCount: 999, episodes: { "1": { episode: "1", title: { en: `Episode of ${id}` }, airDateUtc: "2020-01-01T00:00:00Z" } } };
  };
  const options = { directory: path.join(directory, "cache"), requestBudget: 45 };
  const first = await refreshAniZipBatch(works, read, options);
  assert.equal(first.coverage.fresh, 45);
  assert.equal(first.coverage.missing, 5);
  const second = await refreshAniZipBatch(works, read, { ...options, requestBudget: 5 });
  assert.equal(second.coverage.complete, true);
  assert.equal(new Set(requested).size, 50);
  const entities = new Map(works.map(work => [work.mal_id, { ...work }]));
  const published = applyAniZipEpisodes(entities, second, path.join(directory, "public"));
  assert.equal(published.indexedEpisodes, 50);
  assert.equal(entities.get(1).episodes, 1);
  assert.equal(entities.get(1).latest_episode_num, 1);
  const url = entities.get(1).episodes_metadata_url;
  assert.match(url, /^\/data\/episodes\/anime\/1\/[a-f0-9]{64}\.json$/);
  assert.ok(fs.existsSync(path.join(directory, "public", "1", url.split("/").pop())));
});

test("a changed MAL total refreshes a warm cache and future episodes do not become released", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-episodes-update-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  let count = 1, requests = 0;
  const read = async () => {
    requests++;
    return { mappings: { mal_id: 99 }, episodes: Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i + 1), {
      episode: String(i + 1), title: { en: `Episode ${i + 1}` }, airDateUtc: i === 0 ? "2020-01-01T00:00:00Z" : "2070-01-01T00:00:00Z",
    }])) };
  };
  const options = { directory: path.join(directory, "cache"), requestBudget: 1 };
  await refreshAniZipBatch([{ mal_id: 99, status: "RELEASING", episodes: 1 }], read, options);
  count = 2;
  const record = { mal_id: 99, status: "RELEASING", episodes: 2 };
  const updated = await refreshAniZipBatch([record], read, options);
  assert.equal(requests, 2);
  assert.equal(updated.entries[0].cache.payload.episodes.length, 2);
  const entities = new Map([[99, record]]);
  applyAniZipEpisodes(entities, updated, path.join(directory, "public"));
  assert.equal(record.latest_episode_num, 1);
  assert.equal(record.episodes, 2);
});

test("quarantined identities do not spend episode requests and validated identities automatically rejoin the queue", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-episodes-quarantine-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const work = { mal_id: 99, entity_type: "WORK", status: "RELEASING", episodes: 1, catalog_visibility: "quarantined" };
  let requests = 0;
  const read = async () => {
    requests++;
    return { mappings: { mal_id: 99 }, episodes: { "1": { episode: "1", title: { en: "Episode" } } } };
  };
  const skipped = await refreshAniZipBatch([work], read, { directory, requestBudget: 1 });
  assert.equal(skipped.coverage.total, 0);
  assert.equal(requests, 0);
  work.catalog_visibility = "visible";
  const restored = await refreshAniZipBatch([work], read, { directory, requestBudget: 1 });
  assert.equal(restored.coverage.updated, 1);
  assert.equal(requests, 1);
});
