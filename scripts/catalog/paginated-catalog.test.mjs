import assert from "node:assert/strict";
import test from "node:test";
import { collectCatalogPages } from "./paginated-catalog.mjs";

const page = (id, next = true) => ({ data: [{ mal_id: id }], pagination: { has_next_page: next } });

test("discovery follows source pagination beyond former arbitrary page limits", async () => {
  const records = await collectCatalogPages(async number => page(number, number < 101));
  assert.equal(records.length, 101);
  assert.equal(records.at(-1).mal_id, 101);
});

test("an interrupted discovery resumes cached pages without requesting them again", async () => {
  const cache = new Map(); const requested = [];
  const options = { cachedPage: number => cache.get(number), savePage: (number, data) => cache.set(number, data) };
  await assert.rejects(collectCatalogPages(async number => { if (number === 3) throw new Error("offline"); return page(number); }, options));
  const records = await collectCatalogPages(async number => { requested.push(number); return page(number, false); }, options);
  assert.deepEqual(requested, [3]);
  assert.deepEqual(records.map(record => record.mal_id), [1, 2, 3]);
});

test("invalid or repeated pages cannot be declared a complete discovery", async () => {
  for (const data of [{}, { data: [], pagination: { has_next_page: true } }, { data: [{ mal_id: null }], pagination: { has_next_page: false } }]) {
    await assert.rejects(collectCatalogPages(async () => data));
  }
  await assert.rejects(collectCatalogPages(async () => page(1)), /no progress/);
});
