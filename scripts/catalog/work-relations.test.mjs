import test from "node:test";
import assert from "node:assert/strict";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { resolveWorkRelations } from "./work-relations.mjs";

test("typed sequencing, adaptation and alternatives preserve separate works and continuity while other stays ungrouped", () => {
  const registry = emptyRegistry();
  const relation = (id, type, media = "anime") => ({ source: "myanimelist", target: { provider: "mal", media, id: String(id) }, relation_type: type });
  const rows = [
    { mal_id: 1, source_relations_json: JSON.stringify([relation(2, "sequel"), relation(3, "summary"), relation(4, "alternative_setting"), relation(5, "adaptation", "manga"), relation(6, "other"), relation(7, "future_type")]) },
    { mal_id: 2 }, { mal_id: 3 }, { mal_id: 4 }, { mal_id: 5, entity_type: "NOVEL" }, { mal_id: 6 },
  ].map(row => assignIdentity(row, registry));
  const pending = [], report = resolveWorkRelations(rows, registry, { onPending: edge => pending.push(edge) });
  assert.equal(report.resolved, 5); assert.equal(report.pending, 1);
  assert.equal(rows[0].universe_component_key, rows[4].universe_component_key);
  assert.equal(rows[0].continuity_root_work_id, rows[1].continuity_root_work_id);
  assert.equal(rows[0].continuity_root_work_id, rows[2].continuity_root_work_id);
  assert.notEqual(rows[0].continuity_root_work_id, rows[3].continuity_root_work_id);
  assert.notEqual(rows[0].continuity_root_work_id, rows[4].continuity_root_work_id);
  assert.notEqual(rows[0].universe_component_key, rows[5].universe_component_key);
  assert.equal(JSON.parse(rows[0].relations_v2_json).at(-1).relation_type, "other");
  assert.equal(pending[0].relation_type, "future_type");
  assert.equal(rows[0].arcs_json, undefined);
});

test("contradictory typed relations remain visible but cannot establish a grouping", () => {
  const registry = emptyRegistry();
  const rows = [assignIdentity({ mal_id: 1, source_relations_json: JSON.stringify(["sequel", "other"].map(relation_type => ({ source: "myanimelist", relation_type, target: { provider: "mal", media: "anime", id: "2" } }))) }, registry), assignIdentity({ mal_id: 2 }, registry)];
  const report = resolveWorkRelations(rows, registry);
  assert.equal(report.conflicts, 2);
  assert.notEqual(rows[0].universe_component_key, rows[1].universe_component_key);
  assert.equal(JSON.parse(rows[0].relations_v2_json).length, 2);
});

test("untyped and unknown relation kinds remain measurable while other is preserved separately", () => {
  const registry = emptyRegistry();
  const rows = [1, 2].map(id => assignIdentity({ entity_type: "WORK", mal_id: id, title: `Fixture ${id}` }, registry));
  rows[0].source_relations_json = JSON.stringify(["unspecified", "future_relation", "other"].map(relation_type => ({ source: "myanimelist", target: { provider: "mal", media: "anime", id: "2" }, relation_type })));
  const report = resolveWorkRelations(rows, registry);
  assert.equal(report.unknown, 2);
  assert.equal(report.other, 1);
  assert.equal(JSON.parse(rows[0].relations_v2_json).length, 3);
  assert.notEqual(rows[0].universe_component_key, rows[1].universe_component_key);
});
