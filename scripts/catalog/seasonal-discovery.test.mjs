import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverSeasonalCatalog } from "./seasonal-discovery.mjs";
import { jikanRecord } from "./jikan-record.mjs";

function config(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-seasonal-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  return { directory, pause: async ms => assert.equal(ms, 1100) };
}
const work = (id, status) => ({ mal_id: id, title: `Work ${id}`, status });
const page = (data, more = false) => ({ data, pagination: { has_next_page: more } });

test("season discovery follows every page, deduplicates and preserves source status", async t => {
  const options = config(t), urls = [];
  const result = await discoverSeasonalCatalog(async url => {
    urls.push(url);
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/upcoming')) return page([work(2, "Not yet aired"), work(3, "Not yet aired")]);
    return parsed.searchParams.get('page') === '1' ? page([work(1, "Finished Airing")], true) : page([work(2, "Currently Airing")]);
  }, options);
  assert.equal(urls.length, 3);
  assert.deepEqual(result.records.map(record => record.mal_id), [1, 2, 3]);
  assert.deepEqual(result.records.map(record => jikanRecord(record).mappedStatus), ['COMPLETED', 'RELEASING', 'NOT_YET_RELEASED']);
  assert.equal(jikanRecord(work(4, null)).mappedStatus, 'UNKNOWN');
  assert.deepEqual(await discoverSeasonalCatalog(() => { throw Error('unneeded network'); }, options), result);
});

test("season outage keeps only validated last good data and original timestamps", async t => {
  let clock = Date.parse('2026-10-21T00:00:00Z');
  const options = { ...config(t), now: () => clock };
  const original = await discoverSeasonalCatalog(async () => page([work(1, 'Not yet aired')]), options);
  clock += 7 * 3600000;
  const stale = await discoverSeasonalCatalog(async () => { throw Object.assign(new Error('private response'), { status: 503 }); }, options);
  assert.deepEqual(stale.records, original.records);
  for (const source of Object.values(stale.sources)) {
    assert.equal(source.checkedAt, original.sources.now.checkedAt);
    assert.equal(source.stale, true);
    assert.deepEqual(source.error, { status: 503, code: 'SEASON_DISCOVERY_FAILED', kind: 'service-unavailable' });
  }
  assert.equal(JSON.stringify(stale).includes('private response'), false);
});

test("invalid or absent seasonal sources never manufacture discovery records", async t => {
  const result = await discoverSeasonalCatalog(async () => page([{ mal_id: -1, title: 'Bad' }]), config(t));
  assert.deepEqual(result.records, []);
  assert.equal(result.sources.now.checkedAt, null);
  assert.equal(result.sources.upcoming.stale, true);
});

test("interrupted discovery resumes saved pages and keeps each original observation time", async t => {
  let clock = Date.parse('2026-10-21T00:00:00Z');
  const options = { ...config(t), now: () => clock };
  await discoverSeasonalCatalog(async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/upcoming')) return page([work(3)]);
    if (parsed.searchParams.get('page') === '1') return page([work(1)], true);
    throw Object.assign(new Error('network interrupted'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
  }, options);
  clock += 3600000;
  const urls = [];
  const resumed = await discoverSeasonalCatalog(async url => { urls.push(url); return page([work(2)]); }, options);
  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).searchParams.get('page'), '2');
  assert.equal(resumed.records.find(record => record.mal_id === 1).source_checked_at, '2026-10-21T00:00:00.000Z');
  assert.equal(resumed.records.find(record => record.mal_id === 2).source_checked_at, '2026-10-21T01:00:00.000Z');
  assert.equal(resumed.sources.now.checkedAt, '2026-10-21T00:00:00.000Z');
});

test("corrupt partial pages are fetched again and cannot replace the last complete scope", async t => {
  const options = config(t);
  await discoverSeasonalCatalog(async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/upcoming')) return page([work(3)]);
    if (parsed.searchParams.get('page') === '1') return page([work(1)], true);
    throw Error('interrupted');
  }, options);
  fs.writeFileSync(path.join(options.directory, 'pages/now/1.json'), '{broken');
  const pages = [];
  const recovered = await discoverSeasonalCatalog(async url => {
    const number = Number(new URL(url).searchParams.get('page')); pages.push(number);
    return number === 1 ? page([work(1)], true) : page([work(2)]);
  }, options);
  assert.deepEqual(pages, [1, 2]);
  assert.equal(recovered.records.length, 3);
});
