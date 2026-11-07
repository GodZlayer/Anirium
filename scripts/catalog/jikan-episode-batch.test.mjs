import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { supplementJikanEpisodes } from "./jikan-episode-batch.mjs";
import { verifyCatalogAssets } from "./verify-catalog-assets.mjs";
import { normalizeAniZip } from "./anizip-record.mjs";
import { applyEpisodeDocuments } from "./anizip-batch.mjs";

const episode = number => ({ mal_id: number, title: `Episode ${number}`, aired: null, filler: false, recap: false });
const page = (number, next, data) => ({ pagination: { current_page: number, has_next_page: next }, data });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-jikan-batch-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  return { directory: path.join(root, "cache"), dataDirectory: path.join(root, "data"), cooldownFile: path.join(root, "cooldown.json"), pause: async () => {} };
}

test("HTTP budget interrupts a long work and the next cycle resumes pages, publishes with provenance and validates assets", async t => {
  const options = fixture(t), work = { mal_id: 1, entity_type: "WORK", episodes: 2, status: "COMPLETED" };
  let clock = Date.parse("2026-10-22T00:00:00Z"), calls = [];
  const request = async url => { calls.push(String(url)); const n = Number(new URL(url).searchParams.get("page")); return Response.json(page(n, n === 1, [episode(n)])); };
  const untouched = { ...work, mal_id: 2 };
  const first = await supplementJikanEpisodes([work, untouched], { ...options, requestBudget: 1, request, now: () => clock });
  assert.equal(first.httpRequests, 1); assert.equal(work.episodes_metadata_url, undefined);
  assert.equal(first.interrupted, 1); assert.equal(first.deferred, 1);
  assert.equal(first.errors.length, 0); assert.equal(first.retryWaiting, 0);
  assert.equal(fs.existsSync(path.join(options.directory, "failures/2.json")), false);
  clock += 2 * 3600000;
  const written = { mal_id: 1, entity_type: "MANGA", episodes: 2 };
  const second = await supplementJikanEpisodes([work, written], { ...options, requestBudget: 1, request, now: () => clock });
  assert.equal(second.httpRequests, 1); assert.equal(second.publishedWorks, 1);
  assert.deepEqual(calls.map(url => new URL(url).searchParams.get("page")), ["1", "2"]);
  assert.equal(written.episodes_metadata_url, undefined);
  assert.equal(verifyCatalogAssets([work], options.dataDirectory).indexedEpisodes, 2);
  const document = JSON.parse(fs.readFileSync(path.join(options.dataDirectory, work.episodes_metadata_url.slice(6))));
  assert.equal(document.source, "jikan"); assert.equal(document.upstream, "myanimelist");
  assert.ok(Object.values(JSON.parse(work.field_provenance_json).evidence).some(item => item.provider === "jikan" && item.upstream === "myanimelist"));
  const cached = await supplementJikanEpisodes([work], { ...options, request: () => assert.fail("warm cache"), now: () => clock });
  assert.equal(cached.httpRequests, 0);
  const partialAniZip = normalizeAniZip({ mappings: { mal_id: 1 }, episodes: { "1": { title: { en: "Partial" } } } }, work, new Date(clock).toISOString());
  const url = work.episodes_metadata_url;
  applyEpisodeDocuments(new Map([[1, work]]), { entries: [{ record: { id: 1 }, cache: { payload: partialAniZip }, state: "fresh" }], coverage: {} }, path.join(options.dataDirectory, "episodes/anime"));
  assert.notEqual(work.episodes_metadata_url, url);
  const composed = JSON.parse(fs.readFileSync(path.join(options.dataDirectory, work.episodes_metadata_url.slice(6))));
  assert.deepEqual(composed.episodes.map(item => item.number), [1, 2]);
  assert.equal(composed.source, "anirium");
});

test("Jikan supplements AniZip fields while quarantined identities do not consume requests", async t => {
  const options = fixture(t), work = { mal_id: 1, entity_type: "WORK", episodes: 1 };
  const primary = normalizeAniZip({ mappings: { mal_id: 1 }, episodes: { "1": { title: { en: "Existing" } } } }, work, new Date().toISOString());
  applyEpisodeDocuments(new Map([[1, work]]), { entries: [{ record: { id: 1 }, cache: { payload: primary }, state: "fresh" }], coverage: {} }, path.join(options.dataDirectory, "episodes/anime"));
  const url = work.episodes_metadata_url;
  const calls = [];
  const result = await supplementJikanEpisodes([work, { mal_id: 2, entity_type: "WORK", catalog_visibility: "quarantined" }], { ...options, request: async target => {
    calls.push(String(target)); return Response.json(page(1, false, [episode(1)]));
  } });
  assert.equal(result.httpRequests, 1); assert.notEqual(work.episodes_metadata_url, url);
  assert.deepEqual(calls, ["https://api.jikan.moe/v4/anime/1/episodes?page=1"]);
  const document = JSON.parse(fs.readFileSync(path.join(options.dataDirectory, work.episodes_metadata_url.slice(6))));
  assert.equal(document.episodes[0].titles.en, "Existing");
  assert.equal(document.episodes[0].source_flags.filler, false);
  assert.equal(result.composedWorks, 1); assert.equal(result.episodeConflicts, 1);
});

test("rate limiting persists shared cooldown and a failed refresh never erases existing episodes", async t => {
  const options = fixture(t), work = { mal_id: 1, entity_type: "WORK", episodes: 2, status: "RELEASING" };
  let clock = Date.parse("2026-10-22T00:00:00Z");
  await supplementJikanEpisodes([work], { ...options, request: async () => Response.json(page(1, false, [episode(1), episode(2)])), now: () => clock });
  const url = work.episodes_metadata_url;
  clock += 7 * 3600000;
  const unavailable = await supplementJikanEpisodes([work], { ...options, request: async () => new Response(null, { status: 429, headers: { "Retry-After": "10800" } }), now: () => clock });
  assert.equal(unavailable.sourceError.kind, "rate-limited");
  assert.equal(JSON.parse(fs.readFileSync(options.cooldownFile)).retryAt, clock + 10800000);
  assert.equal(work.episodes_metadata_url, url);
  clock += 4 * 3600000;
  const shrunk = await supplementJikanEpisodes([work], { ...options, request: async () => Response.json(page(1, false, [episode(1)])), now: () => clock });
  assert.equal(shrunk.preservedEpisodes, 1);
  assert.equal(verifyCatalogAssets([work], options.dataDirectory).indexedEpisodes, 2);
});

test("the cycle deadline stops a multi-page request without manufacturing a source outage", async t => {
  const options = fixture(t), work = { mal_id: 1, entity_type: "WORK", episodes: 2 };
  let clock = Date.parse("2026-10-22"), calls = 0;
  const result = await supplementJikanEpisodes([work], { ...options, now: () => clock, timeBudgetMs: 10, request: async () => {
    calls++; clock += 11; return Response.json(page(1, true, [episode(1)]));
  } });
  assert.equal(calls, 1); assert.equal(result.interrupted, 1);
  assert.equal(result.sourceError, undefined); assert.equal(result.retryWaiting, 0);
  assert.equal(work.episodes_metadata_url, undefined);
});
