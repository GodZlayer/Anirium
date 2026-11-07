import test from "node:test";
import assert from "node:assert/strict";
import { kitsuWorkRecord } from "./kitsu-work-record.mjs";

const observedAt = "2026-10-22T00:00:00Z";
function bundle(type = "anime") {
  return { data: { type, id: "6589", attributes: { canonicalTitle: "Example", subtype: type === "anime" ? "TV" : "novel", status: "current", averageRating: "99.9", episodeCount: 24, chapterCount: 0 },
    relationships: { mappings: { data: [{ type: "mappings", id: "1" }] }, mediaRelationships: { data: [{ type: "mediaRelationships", id: "2" }] } } },
    included: [{ type: "mappings", id: "1", attributes: { externalSite: `myanimelist/${type}`, externalId: "11757" } },
      { type: "mediaRelationships", id: "2", attributes: { role: "other" }, relationships: { destination: { data: { type: "manga", id: "11071" } } } }] };
}

test("Kitsu identities and relations preserve media, raw evidence and provider provenance", () => {
  const row = kitsuWorkRecord(bundle(), observedAt);
  assert.equal(row.mal_id, 11757);
  assert.equal(row.entity_type, "WORK");
  assert.equal(row.score, undefined);
  assert.equal(row.episodes_metadata_url, undefined);
  const edge = JSON.parse(row.source_relations_json)[0];
  assert.equal(edge.relation_type, "other");
  assert.deepEqual(edge.target, { provider: "kitsu", media: "manga", id: "11071" });
  assert.equal(edge.raw.attributes.role, "other");
  const provenance = JSON.parse(row.field_provenance_json);
  assert.equal(provenance.evidence[provenance.fields.title].provider, "kitsu");
  const novel = kitsuWorkRecord(bundle("manga"), observedAt);
  assert.equal(novel.entity_type, "NOVEL");
  assert.equal(novel.chapters_count, null);
  assert.equal(JSON.parse(novel.external_ids_json)[0].media, "manga");
});

test("works without MAL remain admissible and TVDB granularities never become work aliases", () => {
  const payload = bundle();
  payload.included[0].attributes = { externalSite: "thetvdb", externalId: "259640/1" };
  const row = kitsuWorkRecord(payload, observedAt);
  assert.equal(row.mal_id, undefined);
  assert.deepEqual(JSON.parse(row.external_ids_json), [{ provider: "kitsu", media: "anime", id: "6589" }]);
});

test("missing included data, pagination, cross-work ownership and conflicting mappings are rejected", () => {
  const missing = bundle(); missing.included.pop();
  assert.throws(() => kitsuWorkRecord(missing, observedAt), /Missing Kitsu/);
  const paged = bundle(); paged.data.relationships.mappings.links = { next: "https://kitsu.app/next" };
  assert.throws(() => kitsuWorkRecord(paged, observedAt), /Incomplete/);
  const wrong = bundle(); wrong.included[0].relationships = { item: { data: { type: "anime", id: "1" } } };
  assert.throws(() => kitsuWorkRecord(wrong, observedAt), /ownership/);
  const media = bundle(); media.included[0].attributes.externalSite = "myanimelist/manga";
  assert.throws(() => kitsuWorkRecord(media, observedAt), /namespace/);
  const duplicate = bundle(); duplicate.included.push(duplicate.included[0]);
  assert.throws(() => kitsuWorkRecord(duplicate, observedAt), /Duplicate/);
});

test("unknown roles survive while explicit spinoff maps to the existing grouping vocabulary", () => {
  const payload = bundle(); payload.included[1].attributes.role = "future_role";
  assert.equal(JSON.parse(kitsuWorkRecord(payload, observedAt).source_relations_json)[0].relation_type, "future_role");
  payload.included[1].attributes.role = "spinoff";
  const edge = JSON.parse(kitsuWorkRecord(payload, observedAt).source_relations_json)[0];
  assert.equal(edge.relation_type, "spin_off");
  assert.equal(edge.raw_type, "spinoff");
});
