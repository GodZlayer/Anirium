import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverMalCatalog } from "./mal-discovery.mjs";
import { createMalClient } from "./mal-client.mjs";
import { malRecord } from "./mal-record.mjs";

test("expired discovery preserves last complete result offline and resumes partial refresh", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-mal-recovery-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  let clock = Date.parse("2026-10-20T00:00:00Z");
  const options = { now: () => clock };
  const initial = await discoverMalCatalog(async () => ({ data: [{ node: { id: 1 } }], paging: {} }), directory, options);
  clock += 24 * 3600000;
  const stale = await discoverMalCatalog(async url => {
    if (new URL(url).searchParams.get("offset") === "500") throw Object.assign(new Error("offline private detail"), { status: 503 });
    return { data: [{ node: { id: 2 } }], paging: { next: "https://api.myanimelist.net/v2/anime/ranking?offset=500" } };
  }, directory, options);
  assert.deepEqual(stale.records, initial.records);
  assert.equal(stale.completedAt, initial.completedAt);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.error, { status: 503, code: "MAL_DISCOVERY_REFRESH_FAILED" });
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "state.json"))).completedAt, null);
  const resumed = await discoverMalCatalog(async url => {
    assert.equal(new URL(url).searchParams.get("offset"), "500");
    return { data: [{ node: { id: 3 } }], paging: {} };
  }, directory, options);
  assert.deepEqual(resumed.records.map(record => record.id), [2, 3]);
  assert.equal(resumed.completedAt, new Date(clock).toISOString());
  assert.equal(resumed.stale, undefined);
});

test("official discovery resumes missing pages and never labels interruption complete", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-mal-test-"));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    fs.rmSync(directory, { recursive: true });
  });
  await assert.rejects(discoverMalCatalog(async url => {
    if (new URL(url).searchParams.get("offset") === "500") throw new Error("offline");
    return { data: [{ node: { id: 1, title: "Fixture" } }], paging: { next: "https://api.myanimelist.net/v2/anime/ranking?offset=500" } };
  }, directory), /offline/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "state.json"))).completedAt, null);
  const result = await discoverMalCatalog(async url => {
    assert.equal(new URL(url).searchParams.get("offset"), "500");
    return { data: [{ node: { id: 2 } }], paging: {} };
  }, directory);
  assert.deepEqual(result.records.map(item => item.id), [1, 2]);
  const cached = await discoverMalCatalog(() => { throw new Error("unneeded network"); }, directory);
  assert.deepEqual(cached, result);
});

test("completed discovery rejects corrupted cached identities", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-mal-identity-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  await discoverMalCatalog(async () => ({ data: [{ node: { id: 1 } }], paging: {} }), directory);
  const state = JSON.parse(fs.readFileSync(path.join(directory, "state.json")));
  fs.writeFileSync(path.join(directory, state.generation, "1.json"), JSON.stringify({ data: [{ id: 2, mal_id: 1 }], pagination: { has_next_page: false } }));
  await assert.rejects(discoverMalCatalog(() => { throw new Error("network should not hide corruption"); }, directory), /Invalid cached MAL identity/);
});

test("malformed checkpoint JSON recovers from independently validated complete generation", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-mal-checkpoint-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const original = await discoverMalCatalog(async () => ({ data: [{ node: { id: 1 } }], paging: {} }), directory);
  fs.writeFileSync(path.join(directory, "state.json"), "{truncated");
  assert.deepEqual(await discoverMalCatalog(() => { throw new Error("offline"); }, directory), original);
  assert.ok(JSON.parse(fs.readFileSync(path.join(directory, "state.json"))).completedAt);
  fs.writeFileSync(path.join(directory, "last-complete.json"), "{truncated");
  assert.deepEqual(await discoverMalCatalog(() => { throw new Error("offline"); }, directory), original);
  assert.ok(JSON.parse(fs.readFileSync(path.join(directory, "last-complete.json"))).completedAt);
});

test("official client sends credentials only to MAL and fails immediately for invalid access", async () => {
  let calls = 0;
  const read = createMalClient("fixture-id", { pause: async () => {}, request: async (url, options) => {
    calls++;
    assert.equal(url.origin, "https://api.myanimelist.net");
    assert.equal(options.headers["X-MAL-CLIENT-ID"], "fixture-id");
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 401 });
  } });
  await assert.rejects(read("https://example.com/v2/anime"), /Untrusted/);
  await assert.rejects(read("https://api.myanimelist.net/v2/anime/1"), /HTTP 401/);
  assert.equal(calls, 1);
});

test("official redirects are reported without forwarding credentials", async () => {
  let calls = 0;
  const read = createMalClient("fixture", { pause: async () => {}, request: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "https://example.com/" } });
  } });
  await assert.rejects(read("https://api.myanimelist.net/v2/anime/1"), /HTTP 302/);
  assert.equal(calls, 1);
});

test("official client retries temporary failures without hiding final failure", async () => {
  let calls = 0;
  const read = createMalClient("fixture", { pause: async () => {}, request: async () => {
    calls++;
    return calls < 3 ? new Response(null, { status: 503 }) : Response.json({ id: 1 });
  } });
  assert.deepEqual(await read("https://api.myanimelist.net/v2/anime/1"), { id: 1 });
  assert.equal(calls, 3);
});

test("temporary redirects retry the original official URL without following Location", async () => {
  const requested = [];
  const read = createMalClient("fixture", { pause: async () => {}, request: async url => {
    requested.push(url.href);
    return requested.length === 1 ? new Response(null, { status: 307, headers: { location: "https://example.com" } }) : Response.json({ id: 1 });
  } });
  assert.deepEqual(await read("https://api.myanimelist.net/v2/anime/1"), { id: 1 });
  assert.deepEqual(requested, ["https://api.myanimelist.net/v2/anime/1", "https://api.myanimelist.net/v2/anime/1"]);
});

test("official records use MAL relation identities and preserve unknown metadata", () => {
  const record = malRecord({ id: 1, num_episodes: 0, related_anime: [
    { node: { id: 2 }, relation_type: "sequel" },
    { node: { id: 3 }, relation_type: "character" },
  ], related_manga: [{ node: { id: 2 }, relation_type: "adaptation" }] });
  assert.equal(record.m.episodes, null);
  assert.equal(record.m.seasonYear, null);
  assert.equal(record.mappedStatus, "UNKNOWN");
  assert.deepEqual(record.m.officialRelations, [{ mal_id: 2, type: "SEQUEL", source: "myanimelist" }]);
});
