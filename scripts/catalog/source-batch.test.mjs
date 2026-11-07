import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshSourceBatch } from "./source-batch.mjs";

test("slow local cache scans do not spend the network budget", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-source-clock-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  fs.writeFileSync(path.join(directory, "1.json"), "{}");
  let clock = 0;
  const result = await refreshSourceBatch([{ id: 1 }], {
    directory, requestBudget: 1, timeBudgetMs: 100, now: () => clock,
    readCache: () => { clock += 1000; return null; }, isFresh: (_record, cache) => Boolean(cache),
    isActive: () => true, fetchCache: async () => ({ checkedAt: new Date(clock).toISOString() }), label: "test",
  });
  assert.equal(result.coverage.attempted, 1);
  assert.equal(result.coverage.updated, 1);
});

test("successful retry clears obsolete failure state and progress reports actual requests", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-source-retry-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  let clock = Date.parse("2026-10-21");
  const options = { directory, requestBudget: 1, timeBudgetMs: 100, now: () => clock,
    readCache: () => null, isFresh: (_record, cache) => Boolean(cache), isActive: () => true, label: "test" };
  const first = await refreshSourceBatch([{ id: 1 }], { ...options, fetchCache: async () => { throw Object.assign(new Error("missing"), { status: 404 }); } });
  assert.equal(first.entries[0].failure.status, 404);
  assert.equal(first.coverage.retryWaiting, 1);
  assert.equal(first.coverage.nextRetryAt, new Date(clock + 7 * 86400000).toISOString());
  const waiting = await refreshSourceBatch([{ id: 1 }, { id: 2 }], { ...options, requestBudget: 0,
    fetchCache: async () => { assert.fail("Cooldown and zero budget must not make requests"); } });
  assert.equal(waiting.coverage.waitingAtStart, 1);
  assert.equal(waiting.coverage.deferred, 1);
  assert.equal(waiting.coverage.retryWaiting, 1);
  assert.equal(waiting.coverage.attempted, 0);
  clock += 8 * 86400000;
  const progress = [];
  const second = await refreshSourceBatch([{ id: 1 }], { ...options, fetchCache: async () => ({ checkedAt: new Date(clock).toISOString() }), onProgress: event => progress.push(event) });
  assert.equal(second.entries[0].failure, null);
  assert.equal(second.coverage.retryWaiting, 0);
  assert.equal(second.coverage.nextRetryAt, null);
  assert.equal(second.coverage.deferred, 0);
  assert.equal(fs.existsSync(path.join(directory, "failures/1.json")), false);
  assert.equal(progress[0].attempted, 1);
  assert.equal(progress[0].updated, 1);
  assert.equal(progress[0].failed, 0);
});

test("a bounded cycle prioritizes releases while reserving capacity for the completed catalog", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-source-priority-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const requested = [];
  const result = await refreshSourceBatch([
    { id: 1, active: false }, { id: 2, active: false },
    { id: 100, active: true }, { id: 101, active: true }, { id: 102, active: true },
  ], { directory, requestBudget: 3, timeBudgetMs: 10000, readCache: () => null,
    isFresh: (_record, cache) => Boolean(cache), isActive: record => record.active, label: "test",
    fetchCache: async record => { requested.push(record.id); return { checkedAt: new Date().toISOString() }; },
  });
  assert.deepEqual(requested, [100, 101, 1]);
  assert.equal(result.coverage.deferred, 2);
  assert.equal(result.coverage.pending, 2);
});
