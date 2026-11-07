import test from "node:test";
import assert from "node:assert/strict";
import { emptyRegistry } from "./work-registry.mjs";
import { consolidateSnapshot } from "./consolidate-snapshot.mjs";
import { malWorkRecord } from "./mal-work-record.mjs";
import { workReference } from "../../resources/js/lib/catalogIdentity.mjs";

const incoming = { entity_type: "NOVEL", mal_id: 9726, title: "Different source title", format: "NOVEL", metadata_source: "mangabaka",
  external_ids_json: JSON.stringify([{ provider: "mal", media: "manga", id: "9726" }, { provider: "mangabaka", media: "manga", id: "86209" }]) };
test("a written kind disagreement keeps identity, attaches explicit references and reports the disputed classification", () => {
  const registry = emptyRegistry();
  const before = consolidateSnapshot([{ entity_type: "MANGA", mal_id: 9726, title: "Original", format: "NOVEL" }], [], registry).rows[0];
  const result = consolidateSnapshot([before], [incoming], registry), after = result.rows[0];
  assert.equal(result.report.conflicts.length, 0);
  assert.ok(result.report.fieldConflicts > 0);
  assert.equal(after.work_id, before.work_id);
  assert.equal(after.entity_type, "MANGA");
  assert.equal(workReference(after), workReference(before));
  assert.equal(registry.references["mangabaka:manga:86209"], before.work_id);
  assert.equal(registry.aliases["novel:9726"], before.work_id);
  const direct = malWorkRecord({ id: 9726, title: "Verified", media_type: "light_novel", related_anime: [] }, "manga", "2026-10-22T00:00:00Z");
  const verified = consolidateSnapshot([after], [direct], registry).rows[0];
  assert.equal(verified.entity_type, "NOVEL");
  assert.equal(verified.work_id, before.work_id);
  assert.equal(workReference(verified), workReference(before));
});
test("label reconciliation never fuses established UUIDs or contradictory external granularities", () => {
  const registry = emptyRegistry();
  const first = consolidateSnapshot([{ entity_type: "MANGA", mal_id: 9726, title: "Original" }], [], registry).rows;
  const second = consolidateSnapshot(first, [{ entity_type: "NOVEL", title: "Separate", external_ids_json: '[{"provider":"mangabaka","media":"manga","id":"86209"}]' }], registry).rows;
  const result = consolidateSnapshot(second, [incoming], registry);
  assert.equal(result.rows.length, 2);
  assert.equal(result.report.conflicts[0].reason, "Conflicting established work identities");
  assert.ok(result.report.conflicts[0].references.includes("86209"));
});
