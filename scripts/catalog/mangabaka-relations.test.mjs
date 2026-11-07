import test from "node:test";
import assert from "node:assert/strict";
import { mangaBakaRelation } from "./mangabaka-relations.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { resolveWorkRelations } from "./work-relations.mjs";

test("MangaBaka typed adaptation links media without interpreting volume ranges as narrative arcs", () => {
  const registry = emptyRegistry();
  const rows = [
    { entity_type: "NOVEL", external_ids_json: '[{"provider":"mangabaka","media":"manga","id":"85378"}]', source_relations_json: JSON.stringify([{ source: "mangabaka", raw: { id: "fixture", to_series_id: 627, relation_type: "adaptation", chronology: "unknown" } }]) },
    { entity_type: "MANGA", external_ids_json: '[{"provider":"mangabaka","media":"manga","id":"627"}]' },
  ].map(row => assignIdentity(row, registry));
  const report = resolveWorkRelations(rows, registry);
  assert.equal(report.resolved, 1);
  assert.equal(rows[0].universe_component_key, rows[1].universe_component_key);
  assert.notEqual(rows[0].continuity_root_work_id, rows[1].continuity_root_work_id);
  assert.equal(rows[0].arcs_json, undefined);
  assert.equal(mangaBakaRelation({ to_series_id: "not-an-id", relation_type: "future" }).target, undefined);
  assert.equal(mangaBakaRelation({ to_series_id: 627, relation_type: "future" }).relation_type, "future");
});
