import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyRegistry, validateRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { addMangaBakaRedirect, resolveExternalReference } from "./source-redirects.mjs";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { resolveWorkRelations } from "./work-relations.mjs";
const provenance = { digest: `sha256:${"a".repeat(64)}`, url: "https://api.mangabaka.org/v1/database/series.jsonl.tar.gz", sourceUpdatedAt: "2026-10-21T14:28:41Z" };
const publication = (registry, id) => assignIdentity({ title: `Publication ${id}`, entity_type: "MANGA", external_ids_json: JSON.stringify([{ provider: "mangabaka", media: "manga", id: String(id) }]) }, registry);
test("explicit source merges resolve chained retired IDs and survive registry restart", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-redirects-"));
  const {loadRegistry,saveRegistry} = registryStorage(directory);
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const registry = emptyRegistry(), target = publication(registry, 234);
  addMangaBakaRedirect(registry, { id: 245, merged_with: 244 }, provenance);
  addMangaBakaRedirect(registry, { id: 244, merged_with: 234 }, provenance);
  validateRegistry(registry);
  saveRegistry(path.join(directory, "registry.json"), registry);
  const restarted = loadRegistry(path.join(directory, "registry.json")).registry;
  assert.equal(resolveExternalReference(restarted, "mangabaka:manga:245").work_id, target.work_id);
  assert.equal(Object.keys(restarted.source_redirect_evidence).length, 1);
  assert.equal(resolveExternalReference(restarted, "mal:anime:245").work_id, null);
});
test("retired references resolve typed relations without creating duplicate works or inferred canon", () => {
  const registry = emptyRegistry(), target = publication(registry, 234), from = publication(registry, 100);
  addMangaBakaRedirect(registry, { id: 245, merged_with: 234 }, provenance);
  from.source_relations_json = JSON.stringify([{ source: "mangabaka", target: { provider: "mangabaka", media: "manga", id: "245" }, relation_type: "adaptation" }]);
  const report = resolveWorkRelations([from, target], registry);
  assert.equal(report.resolved, 1);
  assert.equal(from.universe_component_key, target.universe_component_key);
  assert.equal(Object.keys(registry.works).length, 2);
  assert.equal(from.arcs_json, undefined);
});
test("two established UUIDs remain a conflict rather than silently losing history", () => {
  const registry = emptyRegistry(), old = publication(registry, 245), target = publication(registry, 234), from = publication(registry, 100);
  addMangaBakaRedirect(registry, { id: 245, merged_with: 234 }, provenance);
  assert.throws(() => resolveExternalReference(registry, "mangabaka:manga:245"), /Conflicting established/);
  from.source_relations_json = JSON.stringify([{ source: "mangabaka", target: { provider: "mangabaka", media: "manga", id: "245" }, relation_type: "sequel" }]);
  const report = resolveWorkRelations([from, old, target], registry);
  assert.equal(report.pending, 1);
  assert.equal(report.conflicts, 1);
  assert.notEqual(from.universe_component_key, target.universe_component_key);
  assert.equal(registry.works[old.work_id].account_reference, old.account_reference);
});
test("cycles, cross-media redirects and older contradictory snapshots are rejected", () => {
  const registry = emptyRegistry();
  addMangaBakaRedirect(registry, { id: 245, merged_with: 234 }, provenance);
  assert.throws(() => addMangaBakaRedirect(registry, { id: 245, merged_with: 999 }, { ...provenance, sourceUpdatedAt: "2026-10-20" }), /Contradictory/);
  registry.source_redirects["mangabaka:manga:245"].to = "mal:anime:234";
  assert.throws(() => validateRegistry(registry), /namespace/);
  registry.source_redirects["mangabaka:manga:245"].to = "mangabaka:manga:234";
  assert.throws(() => addMangaBakaRedirect(registry, { id: 234, merged_with: 245 }, provenance), /Cyclic/);
  registry.source_redirects["mangabaka:manga:234"] = { ...registry.source_redirects["mangabaka:manga:245"], to: "mangabaka:manga:245" };
  assert.throws(() => validateRegistry(registry), /Cyclic/);
  assert.throws(() => resolveExternalReference(registry, "mangabaka:manga:245"), /Cyclic/);
});
test("a redirect to an unknown canonical target remains pending", () => {
  const registry = emptyRegistry(); publication(registry, 245);
  addMangaBakaRedirect(registry, { id: 245, merged_with: 234 }, provenance);
  assert.equal(resolveExternalReference(registry, "mangabaka:manga:245").work_id, null);
});


test("contradictory relation types through old and canonical IDs cannot establish continuity", () => {
  const registry = emptyRegistry(), target = publication(registry, 234), from = publication(registry, 100);
  addMangaBakaRedirect(registry, { id: 245, merged_with: 234 }, provenance);
  from.source_relations_json = JSON.stringify(["245", "234"].map((id, i) => ({ source: "mangabaka", target: { provider: "mangabaka", media: "manga", id }, relation_type: i ? "alternative" : "sequel" })));
  const report = resolveWorkRelations([from, target], registry);
  assert.equal(report.conflicts, 2);
  assert.notEqual(from.universe_component_key, target.universe_component_key);
});
