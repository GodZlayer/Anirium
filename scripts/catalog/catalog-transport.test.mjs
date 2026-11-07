import test from "node:test";
import assert from "node:assert/strict";
import { catalogFetch } from "../../resources/js/lib/catalogTransport.mjs";

test("a named local candidate stays selected across manifest, partitions, lookup and feeds without rewriting personal APIs", async t => {
  const priorWindow = globalThis.window, priorFetch = globalThis.fetch, calls = [];
  t.after(() => { globalThis.window = priorWindow; globalThis.fetch = priorFetch; });
  globalThis.window = { location: { search: "?catalog=candidate&candidate=review-example" } };
  globalThis.fetch = async url => { calls.push(url); return {}; };
  for (const url of ["/data/catalog.manifest.json", "/data/catalog/v2/example/anime-00000.parquet", "/api/catalog/work/work:uuid", "/api/catalog/feed?view=home", "/api/account/library?view=bookmarks"]) await catalogFetch(url);
  for (const url of calls.slice(0, 4)) assert.equal(new URL(url, "https://local.example").searchParams.get("candidate"), "review-example");
  assert.equal(calls[4], "/api/account/library?view=bookmarks");
  globalThis.window.location.search = "?candidate=review-example";
  await catalogFetch("/data/catalog.manifest.json");
  assert.equal(calls[5], "/data/catalog.manifest.json");
});
