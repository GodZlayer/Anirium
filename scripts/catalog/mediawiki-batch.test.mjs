import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshMediawikiArcs } from "./mediawiki-batch.mjs";
import { readArcEvidence } from "../../resources/js/lib/arcEvidence.mjs";

function setup(t) {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-wiki-batch-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  let clock = Date.parse("2026-10-22T00:00:00Z"), requests = 0;
  const title = "Exact article", article = "https://en.wikipedia.org/wiki/Exact_article";
  const entity = { id: "Q20", lastrevid: 1, claims: { P4086: [{ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: "20" } } }] }, sitelinks: { enwiki: { title, url: article } } };
  let text = "{{Episode table|overallT=Story|seriesT=Episode|episodes={{Episode table/part|subtitle=Story arc 1: Published division}}{{Episode list|EpisodeNumber2=1}}{{Episode list|EpisodeNumber2=2}}}}";
  const request = async (url, options) => {
    requests++; assert.ok(options.headers["User-Agent"].includes("AniriumCatalog"));
    const value = String(url), payload = value.includes("/sparql?") ? { results: { bindings: [{ item: { type: "uri", value: "http://www.wikidata.org/entity/Q20" }, article: { type: "uri", value: article } }] } }
      : value.includes("Special:EntityData") ? { entities: { Q20: entity } } : { parse: { title, revid: 2, wikitext: { "*": text } } };
    return { ok: true, json: async () => payload };
  };
  return { directory, request, now: () => clock, pause: async ms => { clock += ms; }, requestBudget: 1,
    advance: ms => { clock += ms; }, calls: () => requests, unsupported: () => { text = "No supported narrative template"; } };
}
const row = () => ({ entity_type: "WORK", mal_id: 20, episodes: 2, status: "COMPLETED" });
test("sourced arcs persist, resume without network and never grant canon or filler classification", async t => {
  const options = setup(t), work = row();
  const first = await refreshMediawikiArcs([work], options);
  assert.equal(first.httpRequests, 3); assert.equal(first.applied, 1);
  assert.equal(readArcEvidence(work)[0].classification, "unknown");
  const second = await refreshMediawikiArcs([work], { ...options, request: async () => { throw Error("must use cache"); } });
  assert.equal(second.httpRequests, 0); assert.equal(second.fresh, 1);
  assert.equal(options.calls(), 3);
});
test("source outages and unsupported new layouts retain prior evidence and its original observation date", async t => {
  const options = setup(t), work = row();
  await refreshMediawikiArcs([work], options);
  const original = work.arcs_json;
  options.advance(31 * 86400000);
  const failed = await refreshMediawikiArcs([work], { ...options, request: async () => ({ ok: false, status: 503, headers: { get: () => null } }) });
  assert.equal(failed.stale, 1); assert.equal(work.arcs_json, original);
  assert.equal(failed.sourceError.status, 503);
  options.advance(8 * 86400000); options.unsupported();
  const unsupported = await refreshMediawikiArcs([work], options);
  assert.equal(unsupported.noSupportedEvidence, 1); assert.equal(work.arcs_json, original);
});
test("written media, unknown boundaries and quarantined references do not spend source queries", async t => {
  const options = setup(t);
  const result = await refreshMediawikiArcs([{ ...row(), entity_type: "NOVEL" }, { ...row(), episodes: null }, { ...row(), catalog_visibility: "quarantined" }], options);
  assert.equal(result.skipped, 3); assert.equal(result.httpRequests, 0);
});

test("a source time budget stops a multi-request work before another HTTP request", async t => {
  const options = setup(t), work = row();
  const result = await refreshMediawikiArcs([work], { ...options, timeBudgetMs: 1000 });
  assert.equal(result.httpRequests, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(work.arcs_json, undefined);
});

test("valid prior evidence from another provider is retained and the source conflict remains measurable", async t => {
  const options = setup(t), work = row();
  await refreshMediawikiArcs([work], options);
  const arcs = JSON.parse(work.arcs_json); arcs[0].source_provider = "franchise-wiki";
  work.arcs_json = JSON.stringify(arcs);
  const original = work.arcs_json;
  const result = await refreshMediawikiArcs([work], options);
  assert.equal(result.conflicts, 1);
  assert.equal(work.arcs_json, original);
});
