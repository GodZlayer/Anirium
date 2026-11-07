import test from "node:test";
import assert from "node:assert/strict";
import { refreshCatalogSources } from "../../resources/js/lib/catalogSourceRefresh.mjs";

test("a cold unified catalog never fetches legacy status or downloads the entire legacy snapshot", async () => {
  let refreshes = 0;
  const result = await refreshCatalogSources({ refreshUnified: async () => { refreshes++; }, legacyRevision: () => null,
    request: () => assert.fail("legacy status request"), loadLegacy: () => assert.fail("legacy download") });
  assert.equal(refreshes, 1); assert.equal(result.legacy, "not-loaded");
});

test("an already loaded legacy consumer still receives real revision updates", async () => {
  let revision = "a".repeat(64), loads = 0;
  const controller = new AbortController();
  const options = { refreshUnified: async ({ signal }) => assert.equal(signal, controller.signal), legacyRevision: () => revision,
    signal: controller.signal, request: async (url, options) => {
      assert.equal(url, "/data/catalog.parquet.status.json"); assert.equal(options.signal, controller.signal);
      return Response.json({ snapshotSha256: "b".repeat(64) });
    }, loadLegacy: async force => { assert.equal(force, true); loads++; revision = "b".repeat(64); } };
  assert.equal((await refreshCatalogSources(options)).legacy, "updated");
  assert.equal((await refreshCatalogSources(options)).legacy, "unchanged");
  assert.equal(loads, 1);
});

test("preview mode and unified failure cannot silently switch to an unloaded public legacy catalog", async () => {
  const unavailable = new Error("Candidate unavailable");
  const options = { refreshUnified: async () => { throw unavailable; }, legacyRevision: () => "a".repeat(64), allowLegacy: false,
    request: () => assert.fail("public fallback request"), loadLegacy: () => assert.fail("public fallback download") };
  await assert.rejects(refreshCatalogSources(options), error => error === unavailable);
  await assert.rejects(refreshCatalogSources({ ...options, allowLegacy: true, legacyRevision: () => null }), error => error === unavailable);
});

test("aborted polling cannot start a new legacy download after status parsing", async () => {
  const controller = new AbortController();
  await assert.rejects(refreshCatalogSources({ refreshUnified: async () => {}, legacyRevision: () => "a".repeat(64), signal: controller.signal,
    request: async () => ({ ok: true, json: async () => { controller.abort(); return { snapshotSha256: "b".repeat(64) }; } }),
    loadLegacy: () => assert.fail("late legacy download") }), { name: "AbortError" });
});
