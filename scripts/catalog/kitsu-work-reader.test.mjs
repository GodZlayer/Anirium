import test from "node:test";
import assert from "node:assert/strict";
import { readKitsuWork } from "./kitsu-work-reader.mjs";

const root = { data: { type: "anime", id: "1", attributes: { canonicalTitle: "Example" } } };
const mapping = { type: "mappings", id: "10", attributes: { externalSite: "myanimelist/anime", externalId: "20" } };
function reader(next = null) {
  const calls = [];
  return { calls, read: async value => {
    calls.push(value); const url = new URL(value);
    if (url.pathname === "/api/edge/anime/1") return root;
    if (url.pathname.endsWith("/mappings")) return { data: url.searchParams.get("page[offset]") === "0" ? [mapping] : [], links: { next: url.searchParams.get("page[offset]") === "0" ? next : null } };
    return { data: [] };
  } };
}
test("Kitsu work reads consume every mapping page before returning a normalized record", async () => {
  const client = reader("https://kitsu.app/api/edge/anime/1/mappings?page%5Blimit%5D=20&page%5Boffset%5D=20");
  const row = await readKitsuWork(client.read, "anime", "1");
  assert.equal(row.mal_id, 20);
  assert.equal(client.calls.length, 4);
  assert.deepEqual(JSON.parse(row.source_relations_json), []);
});
test("foreign, cross-work, repeated, duplicate-parameter and altered-include next links cannot be fetched", async () => {
  for (const next of ["https://example.com/mappings", "https://kitsu.app/api/edge/anime/2/mappings?page[limit]=20&page[offset]=20",
    "https://kitsu.app/api/edge/anime/1/mappings?page[limit]=20&page[offset]=0",
    "https://kitsu.app/api/edge/anime/1/mappings?page[limit]=20&page[offset]=20&page[offset]=40",
    "https://kitsu.app/api/edge/anime/1/mappings?page[limit]=20&page[offset]=20&include=item"]) {
    const client = reader(next);
    await assert.rejects(readKitsuWork(client.read, "anime", "1"), /Unsafe/);
    assert.equal(client.calls.length, 2);
  }
});
test("page exhaustion and mismatched response identity fail without publishing a partial record", async () => {
  const client = reader("https://kitsu.app/api/edge/anime/1/mappings?page[limit]=20&page[offset]=20");
  await assert.rejects(readKitsuWork(client.read, "anime", "1", { maxPages: 1 }), /budget exhausted/);
  await assert.rejects(readKitsuWork(async () => root, "manga", "1"), /identity mismatch/);
});
