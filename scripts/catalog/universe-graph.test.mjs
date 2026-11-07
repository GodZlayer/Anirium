import assert from "node:assert/strict";
import test from "node:test";
import { aniListRelations, reconcileUniverses } from "./universe-graph.mjs";

const row = (id, edges = []) => [id, { mal_id: id, universe_id: `univ-${id}`, relations_json: JSON.stringify(edges) }];
const link = (mal_id, type = "SEQUEL", source = "anilist") => ({ mal_id, type, source });

test("manga identities remain separate even when their MAL number matches anime", () => {
  const manga = { mal_id: 1, entity_type: "MANGA", universe_id: "manga-1", relations_json: JSON.stringify([link(2)]) };
  const entities = new Map([row(1, [link(2)]), row(2), ["manga:1", manga]]);
  reconcileUniverses(entities);
  assert.equal(entities.get(1).universe_id, "univ-1");
  assert.equal(manga.universe_id, "manga-1");
  assert.equal(manga.universe_source, "unverified");
});

test("AniList IDs never substitute MAL IDs and manga cannot become anime", () => {
  assert.deepEqual(aniListRelations({ relations: { edges: [
    { relationType: "SEQUEL", node: { id: 20, idMal: null, type: "ANIME" } },
    { relationType: "ADAPTATION", node: { idMal: 20, type: "MANGA" } },
    { relationType: "SEQUEL", node: { id: 900, idMal: 269, type: "ANIME" } },
  ] } }), [link(269)]);
});

test("transitive grouping is independent of input order and relation direction", () => {
  for (const entries of [[row(30, [link(20)]), row(10), row(20, [link(10)])], [row(20, [link(30), link(10)]), row(10), row(30)]]) {
    const entities = new Map(entries); reconcileUniverses(entities);
    for (const entity of entities.values()) {
      assert.equal(entity.universe_id, "univ-10");
      assert.equal(entity.universe_source, "relations");
    }
  }
});

test("crossovers, adaptations, unknown IDs and untrusted sources cannot merge universes", () => {
  const entities = new Map([row(1, [link(2, "CHARACTER"), link(3, "ADAPTATION"), link(99), link(4, "SEQUEL", "title-guess")]), row(2), row(3), row(4)]);
  reconcileUniverses(entities);
  for (const [id, entity] of entities) {
    assert.equal(entity.universe_id, `univ-${id}`);
    assert.equal(entity.universe_source, "unverified");
  }
});
