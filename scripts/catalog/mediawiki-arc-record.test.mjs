import test from "node:test";
import assert from "node:assert/strict";
import { mediawikiArcRecords, wikidataAnimeIdentity } from "./mediawiki-arc-record.mjs";
import { readArcEvidence } from "../../resources/js/lib/arcEvidence.mjs";

const observed = "2026-10-22T00:00:00Z", work = { entity_type: "WORK", mal_id: 20, episodes: 3 };
const entity = { id: "Q20", lastrevid: 7, claims: { P4086: [{ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: "20" } } }] },
  sitelinks: { enwiki: { title: "Example season", url: "https://en.wikipedia.org/wiki/Example_season" } } };
const text = `{{Episode table|overallT=Story|seriesT=Episode|episodes=
{{Episode table/part|subtitle=Story arc 1: First division}}
{{Episode list/sublist|EpisodeNumber=26|EpisodeNumber2=1|Title={{lang|ja|Nested title}}}}
{{Episode list/sublist|EpisodeNumber=27|EpisodeNumber2=2}}
{{Episode table/part|subtitle=Side Story 1: Second division}}
{{Episode list/sublist|EpisodeNumber=28|EpisodeNumber2=3}}
}}`;
const parsed = value => ({ title: "Example season", revid: 10, wikitext: { "*": value } });
test("only explicit narrative divisions and local episode numbers establish arcs, never absolute offsets or canon", () => {
  const arcs = mediawikiArcRecords(work, parsed(text), entity, observed);
  assert.deepEqual(arcs.map(arc => [arc.name, arc.startEp, arc.endEp, arc.classification]), [["First division", 1, 2, "unknown"], ["Second division", 3, 3, "unknown"]]);
  assert.equal(arcs[0].license, "CC-BY-SA-4.0");
  assert.equal(new URL(arcs[0].source_url).searchParams.get("oldid"), "10");
  assert.equal(readArcEvidence({ ...work, arcs_json: JSON.stringify(arcs) }).length, 2);
  assert.equal(mediawikiArcRecords(work, { ...parsed(text), revid: 11 }, entity, observed)[0].arcId, arcs[0].arcId);
});
test("cross-work mappings, missing identity, multiple MAL IDs and unrelated page titles are rejected", () => {
  assert.throws(() => mediawikiArcRecords({ ...work, mal_id: 21 }, parsed(text), entity, observed), /granularity/);
  assert.throws(() => mediawikiArcRecords(work, { ...parsed(text), title: "Other" }, entity, observed), /mismatch/);
  const ambiguous = structuredClone(entity); ambiguous.claims.P4086.push({ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: "21" } } });
  assert.throws(() => wikidataAnimeIdentity(ambiguous, 20), /granularity/);
  assert.throws(() => mediawikiArcRecords({ ...work, entity_type: "MANGA" }, parsed(text), entity, observed), /boundaries/);
});
test("holes, duplicate numbers, incomplete tables and ambiguous multiple tables never fabricate intervals", () => {
  for (const value of [text.replace("EpisodeNumber2=2", "EpisodeNumber2=1"), text.replace("EpisodeNumber2=2", "EpisodeNumber2=4"), text + text]) {
    assert.throws(() => mediawikiArcRecords(work, parsed(value), entity, observed));
  }
  assert.throws(() => mediawikiArcRecords(work, parsed(text.replace("EpisodeNumber2=3", "EpisodeNumber2=3.5")), entity, observed), /numbering/);
  assert.deepEqual(mediawikiArcRecords(work, parsed("<!--" + text + "-->"), entity, observed), []);
  assert.deepEqual(mediawikiArcRecords(work, parsed("<nowiki>" + text + "</nowiki>"), entity, observed), []);
  assert.deepEqual(mediawikiArcRecords(work, parsed(text.replace("seriesT=Episode", "seriesT=Unknown")), entity, observed), []);
});

test("deeply nested or oversized source markup is rejected within the supported parser budget", () => {
  assert.throws(() => mediawikiArcRecords(work, parsed("{{x|".repeat(65) + "}}".repeat(65)), entity, observed), /complexity/);
  assert.throws(() => mediawikiArcRecords(work, parsed("x".repeat(2_000_001)), entity, observed), /size/);
});
