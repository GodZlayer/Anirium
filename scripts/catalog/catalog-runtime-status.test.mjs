import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { observeCatalogRuntime, captureCatalogRuntime, catalogRuntimeStatus } from "./catalog-runtime-status.mjs";
import { writeJson } from "./mal-detail-cache.mjs";
test("runtime observations distinguish PID reuse and another host from an actual live run", () => {
  const runtime = { hostname: "worker", pid: 123, processStart: "111" };
  const options = { hostname: "worker", alive: () => true, start: () => "111" };
  assert.equal(observeCatalogRuntime(runtime, options), "running");
  assert.equal(observeCatalogRuntime(runtime, { ...options, start: () => "222" }), "stopped");
  assert.equal(observeCatalogRuntime(runtime, { ...options, alive: () => false }), "stopped");
  assert.equal(observeCatalogRuntime(runtime, { ...options, hostname: "other" }), "not-observed");
  assert.equal(observeCatalogRuntime({ ...runtime, processStart: null }, options), "alive-unverified");
});
test("stale running files are not proof of a live process or a current audit", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const runtime = { ...captureCatalogRuntime(), pid: 2147483647 };
  writeJson(path.join(root, "automation.json"), { state: "running", runtime });
  const publishedDirectory = path.join(root, "public"), privateDirectory = path.join(root, "private"), generation = randomUUID();
  writeJson(path.join(publishedDirectory, "catalog.manifest.json"), { generation, revision: "new", works: 1, publishedAt: "2026-10-21T00:00:00Z" });
  writeJson(path.join(privateDirectory, "audits", generation + ".json"), { generation, revision: "old", checkedAt: "2026-10-21" });
  let status = catalogRuntimeStatus(root, { publishedDirectory, privateDirectory, now: () => Date.parse("2026-10-22") });
  assert.equal(status.state, "interrupted");
  assert.equal(status.published.overdue, true);
  assert.equal(status.published.lastAudit, null);
  writeJson(path.join(privateDirectory, "audits", generation + ".json"), { generation, revision: "new", checkedAt: "2026-10-21" });
  status = catalogRuntimeStatus(root, { publishedDirectory, privateDirectory });
  assert.equal(status.published.lastAudit.state, "passed-at-publication");
  assert.equal(status.catalogComplete, false);
});
test("legacy run files without runtime identity remain explicitly unverified", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-runtime-legacy-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  writeJson(path.join(root, "automation.json"), { state: "running", startedAt: new Date().toISOString() });
  const status = catalogRuntimeStatus(root, { publishedDirectory: path.join(root, "none") });
  assert.equal(status.state, "run-unverified");
});

test("a new run never presents the previous run's ready checkpoint as its current phase", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-runtime-phase-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  writeJson(path.join(root, "automation.json"), { state: "running", startedAt: "2026-10-22T18:00:00Z", runtime: captureCatalogRuntime() });
  writeJson(path.join(root, "progress.json"), { phase: "candidate-ready", observedAt: "2026-10-22T16:30:00Z" });
  const options = { publishedDirectory: path.join(root, "none") };
  assert.equal(catalogRuntimeStatus(root, options).checkpoint, null);
  writeJson(path.join(root, "progress.json"), { phase: "refreshing-snapshots", observedAt: "2026-10-22T18:00:00Z" });
  assert.equal(catalogRuntimeStatus(root, options).checkpoint.phase, "refreshing-snapshots");
});
