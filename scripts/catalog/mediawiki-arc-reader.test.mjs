import test from "node:test";
import assert from "node:assert/strict";
import { readMediawikiArcs } from "./mediawiki-arc-reader.mjs";

const entity = { id: "Q20", lastrevid: 10, claims: { P4086: [{ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: "20" } } }] },
  sitelinks: { enwiki: { title: "Exact article", url: "https://en.wikipedia.org/wiki/Exact_article" } } };
const bindings = [{ item: { type: "uri", value: "http://www.wikidata.org/entity/Q20" }, article: { type: "uri", value: entity.sitelinks.enwiki.url } }];
test("the reader follows explicit Wikidata identity and never performs a title search or infers unsupported arcs", async () => {
  const urls = [];
  const result = await readMediawikiArcs({ entity_type: "WORK", mal_id: 20, episodes: 12 }, async url => {
    urls.push(url);
    if (urls.length === 1) return { results: { bindings } };
    if (urls.length === 2) return { entities: { Q20: entity } };
    return { parse: { title: "Exact article", revid: 11, wikitext: { "*": "No supported narrative table" } } };
  });
  assert.equal(result.outcome, "no-supported-evidence");
  assert.deepEqual(result.arcs, []);
  assert.equal(urls.length, 3);
  assert.equal(new URL(urls[0]).searchParams.get("query").includes('wdt:P4086 "20"'), true);
  assert.equal(new URL(urls[2]).searchParams.get("page"), "Exact article");
});
test("missing, conflicting or hostile mappings cannot redirect reads to another host", async () => {
  for (const values of [[], [...bindings, { ...bindings[0], item: { type: "uri", value: "http://www.wikidata.org/entity/Q21" } }],
    [{ ...bindings[0], item: { type: "uri", value: "https://example.com/private" } }]]) {
    let calls = 0;
    await assert.rejects(readMediawikiArcs({ entity_type: "WORK", mal_id: 20 }, async () => { calls++; return { results: { bindings: values } }; }));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(readMediawikiArcs({ entity_type: "MANGA", mal_id: 20 }, async () => { calls++; }));
  assert.equal(calls, 0);
});
