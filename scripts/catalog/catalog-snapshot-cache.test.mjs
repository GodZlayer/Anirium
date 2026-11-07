import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogSnapshotCache } from "../../resources/js/lib/catalogSnapshotCache.mjs";

const snapshot = (id, revision) => ({ items: [{ id }], revision: revision.repeat(64) });

test("catalog refresh coalesces callers and retains the last good snapshot through failure", async () => {
  let reads = 0, next = snapshot(1, "a");
  const updates = [];
  const cache = createCatalogSnapshotCache(async () => { reads++; if (next instanceof Error) throw next; return next; }, { onChange: items => updates.push(items[0].id) });
  await Promise.all([cache.load(), cache.load()]);
  assert.equal(reads, 1);
  next = new Error("offline");
  assert.equal((await cache.load(true)).items[0].id, 1);
  assert.equal(cache.revision(), "a".repeat(64));
  next = snapshot(2, "b");
  assert.equal((await cache.load(true)).items[0].id, 2);
  assert.deepEqual(updates, [1, 2]);
});

test("a failed initial load can recover and an empty replacement cannot erase the catalog", async () => {
  let next = new Error("initial offline");
  const cache = createCatalogSnapshotCache(async () => { if (next instanceof Error) throw next; return next; });
  assert.deepEqual((await cache.load()).items, []);
  next = snapshot(3, "c");
  assert.equal((await cache.load()).items[0].id, 3);
  next = { items: [], revision: "d".repeat(64) };
  assert.equal((await cache.load(true)).items[0].id, 3);
});
