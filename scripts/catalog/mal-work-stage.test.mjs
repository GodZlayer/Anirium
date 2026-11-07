import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshMalWorks } from "./mal-work-stage.mjs";

test("MAL enrichment keeps media namespaces separate, follows explicit targets and resumes verified caches", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-mal-works-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const rows = [{ mal_id: 1, entity_type: "WORK", status: "COMPLETED", source_relations_json: JSON.stringify([{ target: { provider: "mal", media: "anime", id: "2" } }]) }, { mal_id: 1, entity_type: "NOVEL", status: "COMPLETED" }];
  const urls = [], now = () => Date.parse("2026-10-21T00:00:00Z");
  const read = async value => {
    const url = new URL(value), id = Number(url.pathname.split("/").at(-1)); urls.push(url.pathname);
    return { id, title: "Fixture", media_type: url.pathname.includes("/manga/") ? "light_novel" : "tv", related_anime: [], related_manga: [] };
  };
  const first = await refreshMalWorks(rows, read, { directory, requestBudget: 6, now });
  assert.equal(first.records.length, 3);
  assert.ok(urls.includes("/v2/anime/1")); assert.ok(urls.includes("/v2/manga/1")); assert.ok(urls.includes("/v2/anime/2"));
  urls.length = 0;
  await refreshMalWorks(rows, read, { directory, requestBudget: 6, now });
  assert.equal(urls.length, 0);
});

test("newly returned relation targets are traversed recursively within the same budget and cycles cannot repeat requests", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-mal-recursive-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const calls = [], read = async value => {
    const id = Number(new URL(value).pathname.split("/").at(-1)); calls.push(id);
    return { id, title: `Work ${id}`, media_type: "tv", related_manga: [], related_anime: [{ node: { id: id === 3 ? 1 : id + 1 }, relation_type: "sequel" }] };
  };
  const result = await refreshMalWorks([{ mal_id: 1, entity_type: "WORK" }], read, { directory, requestBudget: 10 });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(result.records.map(row => row.mal_id), [1, 2, 3]);
  assert.equal(result.report.anime.discoveredReferences, 2);
  assert.equal(result.report.anime.complete, true);
});

test("a restart reconstructs an unfinished relation frontier from source caches before candidate rows were saved", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-mal-frontier-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const now = () => Date.parse("2026-10-22"), rows = [{ mal_id: 1, entity_type: "WORK" }], calls = [];
  const read = async value => {
    const id = Number(new URL(value).pathname.split("/").at(-1)); calls.push(id);
    return { id, title: `Work ${id}`, media_type: "tv", related_manga: [], related_anime: id < 3 ? [{ node: { id: id + 1 }, relation_type: "sequel" }] : [] };
  };
  const interrupted = await refreshMalWorks(rows, read, { directory, requestBudget: 2, now });
  assert.deepEqual(calls, [1, 2]); assert.equal(interrupted.report.anime.pending, 1);
  // Discard in-memory returned rows as if the process stopped before publication.
  calls.length = 0;
  const resumed = await refreshMalWorks(rows, read, { directory, requestBudget: 2, now });
  assert.deepEqual(calls, [3]); assert.equal(resumed.report.anime.complete, true);
  assert.deepEqual(resumed.records.map(row => row.mal_id), [1, 2, 3]);
});

test("anime to novel relations reach the written phase and a return relation remains explicit for the next anime phase", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-mal-cross-media-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const now = () => Date.parse("2026-10-22"), calls = [];
  const read = async value => {
    const url = new URL(value), id = Number(url.pathname.split("/").at(-1)), manga = url.pathname.includes("/manga/"); calls.push(url.pathname);
    return { id, title: "Related work", media_type: manga ? "light_novel" : "tv",
      related_anime: manga ? [{ node: { id: 2 }, relation_type: "adaptation" }] : [],
      related_manga: !manga && id === 1 ? [{ node: { id: 1 }, relation_type: "adaptation" }] : [] };
  };
  const first = await refreshMalWorks([{ mal_id: 1, entity_type: "WORK" }], read, { directory, requestBudget: 6, now });
  assert.deepEqual(calls, ["/v2/anime/1", "/v2/manga/1"]);
  assert.deepEqual(first.records.map(row => row.entity_type), ["WORK", "NOVEL"]);
  assert.equal(first.report.anime.deferredCrossMedia, 1); assert.equal(first.report.anime.complete, false);
  calls.length = 0;
  const second = await refreshMalWorks(first.records, read, { directory, requestBudget: 6, now });
  assert.deepEqual(calls, ["/v2/anime/2"]);
  assert.equal(second.report.anime.deferredCrossMedia, 0); assert.equal(second.records.length, 3);
});

test("a rate-limited discovered node stops traversal and preserves its retry deadline", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-mal-frontier-rate-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const now = () => Date.parse("2026-10-22"), calls = [];
  const result = await refreshMalWorks([{ mal_id: 1, entity_type: "WORK" }], async value => {
    const id = Number(new URL(value).pathname.split("/").at(-1)); calls.push(id);
    if (id === 2) throw Object.assign(new Error("rate limit"), { status: 429, retryAt: now() + 3 * 3600000 });
    return { id, title: "Parent", related_manga: [], related_anime: [2, 3].map(id => ({ node: { id }, relation_type: "other" })) };
  }, { directory, requestBudget: 6, now });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(result.report.anime.complete, false); assert.equal(result.report.anime.deferred, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "details/failures/2.json"))).retryAt, "2026-10-22T03:00:00.000Z");
});

test("access denial during recursive traversal retains every verified partial cache and truthful request counts", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-mal-frontier-access-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const calls = [];
  const result = await refreshMalWorks([{ mal_id: 1, entity_type: "WORK" }], async value => {
    const id = Number(new URL(value).pathname.split("/").at(-1)); calls.push(id);
    if (id === 3) throw Object.assign(new Error("access denied"), { status: 401 });
    return { id, title: `Cached ${id}`, related_manga: [], related_anime: [{ node: { id: id + 1 }, relation_type: "sequel" }] };
  }, { directory, requestBudget: 6 });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(result.records.map(row => row.mal_id), [1, 2]);
  assert.equal(result.report.anime.sourceError.status, 401);
  assert.equal(result.report.anime.attempted, 3); assert.equal(result.report.anime.updated, 2);
  assert.equal(result.report.anime.complete, false);
  assert.equal(fs.existsSync(path.join(directory, "details/failures/3.json")), false);
});
