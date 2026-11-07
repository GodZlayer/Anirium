import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ensureBootstrapInputs } from "./bootstrap-inputs.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { publishGeneration } from "./publish-generation.mjs";
import { loadGeneration } from "./load-generation.mjs";

function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-bootstrap-resume-"));
  t.after(() => fs.rmSync(root, { recursive: true })); return root;
}

test("a repeated bootstrap preserves its original zero-input evidence and isolated cache directory", t => {
  const root = directory(t), instant = Date.parse("2026-10-22T00:00:00Z");
  const first = ensureBootstrapInputs(root, { registryWorks: 0, retainedWorks: 0, now: () => instant });
  assert.equal(first.resumed, false); assert.equal(first.original.sourceCachePreexisting, false);
  const bytes = fs.readFileSync(path.join(root, "bootstrap-inputs.json"));
  fs.mkdirSync(path.join(root, "sources"));
  const resumed = ensureBootstrapInputs(root, { registryWorks: 10, retainedWorks: 10, now: () => instant + 3600000 });
  assert.equal(resumed.resumed, true); assert.deepEqual(resumed.original, first.original);
  assert.deepEqual(fs.readFileSync(path.join(root, "bootstrap-inputs.json")), bytes);
});

test("preexisting data without original proof, corrupted proof and proof from another directory are rejected", t => {
  const seeded = directory(t);
  assert.throws(() => ensureBootstrapInputs(seeded, { registryWorks: 1, retainedWorks: 0 }), /requires empty/);
  assert.equal(fs.existsSync(path.join(seeded, "bootstrap-inputs.json")), false);
  fs.writeFileSync(path.join(seeded, "bootstrap-inputs.json"), "corrupt");
  assert.throws(() => ensureBootstrapInputs(seeded, { registryWorks: 0, retainedWorks: 0 }), /Invalid original/);
  assert.equal(fs.readFileSync(path.join(seeded, "bootstrap-inputs.json"), "utf8"), "corrupt");
  const other = directory(t), valid = directory(t);
  ensureBootstrapInputs(valid, { registryWorks: 0, retainedWorks: 0 });
  fs.copyFileSync(path.join(valid, "bootstrap-inputs.json"), path.join(other, "bootstrap-inputs.json"));
  assert.throws(() => ensureBootstrapInputs(other, { registryWorks: 1, retainedWorks: 1 }), /Invalid original/);
  const original = JSON.parse(fs.readFileSync(path.join(valid, "bootstrap-inputs.json")));
  for (const change of [{ registryWorks: 1 }, { retainedWorks: 1 }, { legacyImported: true }, { schema: 2 }, { observedAt: 42 }]) {
    fs.writeFileSync(path.join(valid, "bootstrap-inputs.json"), JSON.stringify({ ...original, ...change }));
    assert.throws(() => ensureBootstrapInputs(valid, { registryWorks: 1, retainedWorks: 1 }), /Invalid original/);
  }
});

test("restart after candidate manifest publication retains audited generation identities under the same bootstrap", async t => {
  const root = directory(t);
  const {loadRegistry,saveRegistry} = registryStorage(root);
  ensureBootstrapInputs(root, { registryWorks: 0, retainedWorks: 0 });
  const registry = emptyRegistry(), row = assignIdentity({ mal_id: 11757, title: "Bootstrap publication" }, registry);
  saveRegistry(path.join(root, "registry.json"), registry);
  const manifest = await publishGeneration([row], [], path.join(root, "data"), { indexDirectory: path.join(root, "indexes") });
  // Simulate a new process after manifest commit but before outer completion.
  const reloaded = loadRegistry(path.join(root, "registry.json")).registry;
  const retained = await loadGeneration(path.join(root, "data"), reloaded);
  const resumed = ensureBootstrapInputs(root, { registryWorks: Object.keys(reloaded.works).length, retainedWorks: retained.length });
  assert.equal(resumed.resumed, true); assert.equal(retained[0].work_id, row.work_id);
  assert.equal(assignIdentity({ mal_id: 11757, title: "Same work" }, reloaded).work_id, row.work_id);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "data/catalog.manifest.json"))).generation, manifest.generation);
  fs.appendFileSync(path.join(root, "data", manifest.files[0].url.slice(6)), "corrupt");
  await assert.rejects(loadGeneration(path.join(root, "data"), reloaded), /checksum/);
});
