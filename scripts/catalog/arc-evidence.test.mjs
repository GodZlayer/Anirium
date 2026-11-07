import assert from "node:assert/strict";
import test from "node:test";
import { readArcEvidence } from "../../resources/js/lib/arcEvidence.mjs";

const arc = { arcId: "fixture-1", name: "Fixture arc", startEp: 1, endEp: 5, sourceWorkMalId: 269, source_url: "https://source.example/fixture", verification: "source-matched", checked_at: "2026-10-21T00:00:00Z" };
const work = records => ({ mal_id: 269, episodes_count: 12, arcs_json: JSON.stringify(records) });

test("episode counts never generate narrative arcs", () => {
  for (const episodes_count of [0, 12, 25, 366, 1000]) assert.deepEqual(readArcEvidence({ mal_id: 269, episodes_count }), []);
});

test("sourced arcs are bounded to the correct work and their actual range", () => {
  assert.equal(readArcEvidence(work([arc]))[0].episodesCount, 5);
  for (const patch of [{ sourceWorkMalId: 20 }, { endEp: 13 }, { source_url: "javascript:alert(1)" }, { verification: "unverified" }]) {
    assert.deepEqual(readArcEvidence(work([{ ...arc, ...patch }])), []);
  }
});

test("ambiguous overlapping or duplicate arc identities are rejected", () => {
  assert.deepEqual(readArcEvidence(work([arc, { ...arc, arcId: "fixture-2", startEp: 5, endEp: 8 }])), []);
  assert.deepEqual(readArcEvidence(work([arc, { ...arc, startEp: 6, endEp: 8 }])), []);
});
