import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverMalReleases, releaseScopes } from "./mal-release-discovery.mjs";
const instant = Date.parse("2026-12-31T23:59:59Z");
function config(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-releases-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  return { directory, now: () => instant };
}
const page = (id, next) => ({ data: [{ node: { id, title: `Anime ${id}`, status: "not_yet_aired" } }], paging: next ? { next } : {} });
test("season rollover uses UTC and includes the full upcoming ranking", () => {
  assert.deepEqual(releaseScopes(instant).map(scope => scope.key), ["2026-fall", "2027-winter", "upcoming"]);
});
test("official release discovery resumes interrupted pagination without publishing partial scope", async t => {
  const options = config(t), requested = [];
  const read = async url => {
    const u = new URL(url); requested.push(u.pathname + u.searchParams.get("offset"));
    if (u.pathname.endsWith("2026/fall")) {
      if (u.searchParams.get("offset") === "0") return page(1, "https://api.myanimelist.net/v2/anime/season/2026/fall?offset=500");
      throw Object.assign(new Error("maintenance"), { status: 503 });
    }
    return page(3);
  };
  const first = await discoverMalReleases(read, options);
  assert.equal(first.sources["2026-fall"].stale, true);
  assert.equal(first.records.some(row => row.id === 1), false);
  requested.length = 0;
  const second = await discoverMalReleases(async url => { requested.push(url); return page(2); }, options);
  assert.equal(requested.length, 1);
  assert.equal(new URL(requested[0]).searchParams.get("offset"), "500");
  assert.deepEqual(second.records.map(row => row.id), [1, 2, 3]);
  assert.equal(second.sources["2026-fall"].stale, false);
});
test("hostile pagination and empty scopes remain unavailable", async t => {
  const result = await discoverMalReleases(async () => page(1, "https://example.org/?offset=500"), config(t));
  assert.equal(result.records.length, 0);
  assert.ok(Object.values(result.sources).every(source => source.stale));
});
