import test from "node:test";
import assert from "node:assert/strict";
import { applyMalSourceHealth } from "./mal-source-health.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
const failed = (status = 404) => ({ media: "anime", id: 100130, checkedAt: null, failure: { status, attemptedAt: "2026-10-22T01:55:00Z" } });
function legacy() { return assignIdentity({ entity_type: "WORK", mal_id: 100130, title: "Legacy work" }, emptyRegistry()); }
test("an unsupported inherited MAL reference is quarantined after a real 404 without losing links or progress identity", () => {
  const row = legacy(), account = row.account_reference, aliases = row.aliases_json;
  const report = applyMalSourceHealth([row], [failed()]);
  assert.equal(report.quarantined, 1);
  assert.equal(row.catalog_visibility, "quarantined");
  assert.equal(row.account_reference, account);
  assert.equal(row.aliases_json, aliases);
  assert.equal(JSON.parse(row.provider_health_json).mal.status, 404);
});
test("maintenance and timeouts are not evidence that the inherited identity is wrong", () => {
  for (const code of [503, 429, null]) {
    const row = legacy(); applyMalSourceHealth([row], [failed(code)]);
    assert.equal(row.catalog_visibility, undefined);
  }
});
test("independent explicit references and prior verified cache prevent destructive quarantine", () => {
  const row = legacy();
  row.external_ids_json = JSON.stringify([...JSON.parse(row.external_ids_json), { provider: "anidb", media: "anime", id: "13479" }]);
  assert.equal(applyMalSourceHealth([row], [failed()]).quarantined, 0);
  const oldVerified = legacy();
  applyMalSourceHealth([oldVerified], [{ ...failed(), checkedAt: "2026-10-21T00:00:00Z" }]);
  assert.equal(oldVerified.catalog_visibility, undefined);
  assert.equal(JSON.parse(oldVerified.provider_health_json).mal.state, "unavailable");
});
test("valid evidence automatically restores discoverability and anime/manga IDs remain separate", () => {
  const row = legacy(), written = { ...legacy(), entity_type: "NOVEL" };
  applyMalSourceHealth([row, written], [failed()]);
  assert.equal(written.catalog_visibility, undefined);
  applyMalSourceHealth([row], [{ media: "anime", id: 100130, checkedAt: "2026-10-22T03:00:00Z", failure: null }]);
  assert.equal(row.catalog_visibility, "visible");
  assert.equal(row.catalog_visibility_reason, "verified-source-arrived");
  assert.equal(JSON.parse(row.provider_health_json).mal.state, "available");
});
