import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshMalDetailBatch } from "./mal-detail-batch.mjs";
import { writeJson } from "./mal-detail-cache.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const record = id => ({ id, title: `Work ${id}`, status: "finished_airing", source_checked_at: new Date(NOW).toISOString() });
const payload = id => ({ id, title: `Work ${id}`, related_anime: [] });
function options(t, extra = {}) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-detail-batch-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  return { directory, now: () => NOW, ...extra };
}
const idFrom = url => Number(new URL(url).pathname.split("/").pop());

test("bounded batches advance past warm caches without dropping any discovery record", async t => {
  const config = options(t, { requestBudget: 1 });
  const records = [record(1), record(2)];
  const requested = [];
  const read = async url => { requested.push(idFrom(url)); return payload(idFrom(url)); };
  const first = await refreshMalDetailBatch(records, read, config);
  assert.equal(first.records.length, 2);
  assert.equal(first.coverage.fresh, 1);
  assert.equal(first.coverage.missing, 1);
  assert.equal(first.coverage.complete, false);
  const second = await refreshMalDetailBatch(records, read, config);
  assert.equal(second.coverage.complete, true);
  assert.deepEqual(requested, [1, 2]);
  assert.equal((await refreshMalDetailBatch(records, () => { throw new Error("unnecessary network"); }, config)).coverage.attempted, 0);
});

test("stale relation evidence survives while newer listing fields win", async t => {
  const config = options(t, { requestBudget: 0 });
  writeJson(path.join(config.directory, "1.json"), { checkedAt: "2026-10-01T00:00:00Z", payload: { ...payload(1), title: "Old title", num_episodes: 10, related_anime: [{ node: { id: 2 }, relation_type: "sequel" }] } });
  const result = await refreshMalDetailBatch([{ ...record(1), title: "New title", num_episodes: 12 }], () => { throw new Error("budget zero"); }, config);
  assert.equal(result.coverage.stale, 1);
  assert.equal(result.records[0].title, "New title");
  assert.equal(result.records[0].num_episodes, 12);
  assert.equal(result.records[0].related_anime[0].node.id, 2);
  assert.equal(result.records[0].details_checked_at, "2026-10-01T00:00:00Z");
});

test("one unavailable work backs off and cannot repeatedly consume the next batch", async t => {
  const config = options(t, { requestBudget: 1 });
  const records = [record(1), record(2)];
  const failure = Object.assign(new Error("not found"), { status: 404 });
  const first = await refreshMalDetailBatch(records, async () => { throw failure; }, config);
  assert.equal(first.coverage.errors[0].status, 404);
  const second = await refreshMalDetailBatch(records, async url => { assert.equal(idFrom(url), 2); return payload(2); }, config);
  assert.equal(second.coverage.updated, 1);
  assert.equal(second.coverage.missing, 1);
});

test("invalid credentials and wrong source identity remain fatal", async t => {
  const config = options(t);
  await assert.rejects(refreshMalDetailBatch([record(1)], async () => { throw Object.assign(new Error("unauthorized"), { status: 401 }); }, config), /unauthorized/);
  await assert.rejects(refreshMalDetailBatch([record(1)], async () => payload(2), config), /Invalid official MAL details/);
});

test("time budget stops network work but still returns every cached or missing record", async t => {
  let clock = NOW;
  const config = options(t, { now: () => clock, timeBudgetMs: 1500 });
  const result = await refreshMalDetailBatch([record(1), record(2), record(3)], async url => { clock += 1000; return payload(idFrom(url)); }, config);
  assert.equal(result.coverage.attempted, 2);
  assert.equal(result.records.length, 3);
  assert.equal(result.coverage.missing, 1);
});

test("a source outage stops repeated failed requests and preserves cached data", async t => {
  const config = options(t);
  const result = await refreshMalDetailBatch(Array.from({ length: 8 }, (_, i) => record(i + 1)), async () => { throw new Error("offline"); }, config);
  assert.equal(result.coverage.attempted, 5);
  assert.equal(result.coverage.errors.length, 5);
  assert.equal(result.records.length, 8);
});

test("active work refreshes and completed-work backfill both receive a share of requests", async t => {
  const config = options(t, { requestBudget: 3 });
  const records = [record(1), record(2), record(3), ...[4, 5, 6, 7].map(id => ({ ...record(id), status: "currently_airing" }))];
  const requested = [];
  await refreshMalDetailBatch(records, async url => { requested.push(idFrom(url)); return payload(idFrom(url)); }, config);
  assert.deepEqual(requested, [4, 5, 1]);
});

test("malformed or mismatched cached data is repaired from the correct official identity", async t => {
  const config = options(t);
  fs.writeFileSync(path.join(config.directory, "1.json"), "{broken");
  writeJson(path.join(config.directory, "2.json"), { checkedAt: new Date(NOW).toISOString(), payload: payload(999) });
  writeJson(path.join(config.directory, "failures", "1.json"), { id: 999, attempts: "invalid", retryAt: "2099-01-01T00:00:00Z" });
  const result = await refreshMalDetailBatch([record(1), record(2)], async url => payload(idFrom(url)), config);
  assert.equal(result.coverage.updated, 2);
  assert.deepEqual(result.records.map(row => row.id), [1, 2]);
});

test("unmapped works do not trigger the global outage breaker for the remaining queue", async t => {
  const config = options(t);
  const result = await refreshMalDetailBatch(Array.from({ length: 6 }, (_, i) => record(i + 1)), async url => {
    if (idFrom(url) < 6) throw Object.assign(new Error("not found"), { status: 404 });
    return payload(6);
  }, config);
  assert.equal(result.coverage.attempted, 6);
  assert.equal(result.coverage.updated, 1);
});
