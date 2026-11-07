import test from "node:test";
import assert from "node:assert/strict";
import { createWorkRefreshSession, resolveContextWork } from "../../resources/js/lib/contextWorkRefresh.mjs";

test("a temporary failure retains the last work and recovers on the next check without a new generation", async () => {
  let fail = false, version = 1, shown = null, calls = 0; const errors = [];
  const session = createWorkRefreshSession({ resolve: async () => { calls++; if (fail) throw new Error("503"); return { version }; },
    onValue: value => { shown = value; }, onError: error => errors.push(error.message) });
  await session.load(); fail = true; await session.load();
  assert.equal(shown.version, 1); assert.equal(session.pending(), true);
  fail = false; version = 2; await session.retry();
  assert.equal(shown.version, 2); assert.equal(session.pending(), false); assert.deepEqual(errors, ["503"]);
  await session.retry(); assert.equal(calls, 3);
});

test("a definitive missing work clears previous content and is not restored by retries", async () => {
  let next = { id: 1 }, shown, calls = 0;
  const session = createWorkRefreshSession({ resolve: async () => { calls++; return next; }, onValue: value => { shown = value; }, onError: assert.fail });
  await session.load(); next = null; await session.load(); await session.retry();
  assert.equal(shown, null); assert.equal(calls, 2); assert.equal(session.pending(), false);
});

test("late results cannot overwrite a newer context or update a disposed account scope", async () => {
  const releases = [], shown = [];
  const session = createWorkRefreshSession({ resolve: () => new Promise(resolve => releases.push(resolve)), onValue: value => shown.push(value), onError: assert.fail });
  const old = session.load(), current = session.load(); releases[1]("new"); await current; releases[0]("old"); await old;
  assert.deepEqual(shown, ["new"]);
  const disposed = session.load(); session.dispose(); releases[2]("other account"); await disposed; await session.retry();
  assert.deepEqual(shown, ["new"]); assert.equal(releases.length, 3);
});

test("an obsolete failure cannot re-arm retries after a newer definitive missing result", async () => {
  const requests = [], values = [], errors = [];
  const session = createWorkRefreshSession({ resolve: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    onValue: value => values.push(value), onError: error => errors.push(error) });
  const old = session.load(), current = session.load();
  requests[1].resolve(null); await current;
  requests[0].reject(new Error("Obsolete 503")); await old; await session.retry();
  assert.deepEqual(values, [null]); assert.deepEqual(errors, []); assert.equal(requests.length, 2); assert.equal(session.pending(), false);
});

test("pending retries do not create duplicate in-flight requests", async () => {
  let requests = 0, release;
  const session = createWorkRefreshSession({ resolve: async () => { requests++; if (requests === 1) throw new Error("timeout"); return new Promise(resolve => { release = resolve; }); }, onValue: () => {}, onError: () => {} });
  await session.load(); const retry = session.retry(); await session.retry();
  assert.equal(requests, 2); release("ready"); await retry;
});

test("only an absent unified manifest permits provisional legacy migration, never a missing or denied work", async () => {
  const legacy = { id: 1 }, options = { reference: "1", readLegacy: async () => [legacy], findLegacy: values => values[0] };
  const fallback = await resolveContextWork({ ...options, resolve: async () => { throw Object.assign(new Error("Missing manifest"), { code: "CATALOG_MANIFEST_UNAVAILABLE", status: 404 }); } });
  assert.equal(fallback.work, legacy); assert.equal(fallback.provisional, true);
  const absent = await resolveContextWork({ ...options, resolve: async () => null, readLegacy: () => assert.fail("404 resurrection") });
  assert.equal(absent.work, null); assert.equal(absent.provisional, false);
  for (const status of [401, 403, 503]) await assert.rejects(resolveContextWork({ ...options,
    resolve: async () => { throw Object.assign(new Error("Denied"), { status }); }, readLegacy: () => assert.fail("failure fallback") }));
});

test("a provisional legacy work continues retrying until unified metadata becomes available", async () => {
  let provisional = true, shown;
  const session = createWorkRefreshSession({ resolve: async () => ({ provisional, work: "known" }), needsRetry: value => value.provisional,
    onValue: value => { shown = value; }, onError: assert.fail });
  await session.load(); assert.equal(session.pending(), true);
  provisional = false; await session.retry(); assert.equal(shown.provisional, false); assert.equal(session.pending(), false);
});
