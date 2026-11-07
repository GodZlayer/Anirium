import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { publishGeneration } from "./publish-generation.mjs";
import { writeJson } from "./mal-detail-cache.mjs";
import { promoteCandidate } from "./promote-candidate.mjs";
import { auditGeneration } from "./audit-generation.mjs";
import { auditCatalogContent } from "./content-audit.mjs";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { syncSqlWorkGraph } from "./sql-work-graph.mjs";
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-promotion-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const candidate = path.join(root, "candidate"), dataDirectory = path.join(root, "public/data"), privateDirectory = path.join(root, "private");
  const storage = registryStorage(root);
  const registry = emptyRegistry(), rows = [assignIdentity({ mal_id: 1, title: "Anime", entity_type: "WORK" }, registry)];
  const build = async items => {
    storage.saveRegistry(path.join(candidate, "registry.json"), registry);
    syncSqlWorkGraph(items,registry,{database:storage.database});
    return publishGeneration(items, [], path.join(candidate, "data"), { indexDirectory: path.join(candidate, "indexes"),identityDatabase:storage.database });
  };
  await build(rows);
  return { candidate, dataDirectory, privateDirectory, rows, build, registry, identityDatabase:storage.database };
}
test("promotion verifies copies, keeps the index private and retains a rollback pointer", async t => {
  const f = await fixture(t), first = await promoteCandidate(f.candidate, f);
  assert.equal(first.lossCheck, "verified");
  assert.equal((await auditGeneration(f.dataDirectory, { indexDirectory: path.join(f.privateDirectory, "indexes") })).works, 1);
  assert.equal(fs.existsSync(path.join(f.dataDirectory, `${first.generation}.sqlite`)), false);
  await f.build(f.rows);
  const second = await promoteCandidate(f.candidate, f);
  assert.notEqual(second.generation, first.generation);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDirectory, "catalog.manifest.json.previous"))).generation, first.generation);
});
test("an interrupted promotion keeps the old pointer and can be resumed", async t => {
  const f = await fixture(t), first = await promoteCandidate(f.candidate, f);
  await f.build(f.rows);
  const phases = [];
  await assert.rejects(promoteCandidate(f.candidate, { ...f, onProgress: value => phases.push(value), beforeCommit: () => { throw Error("interruption"); } }), /interruption/);
  assert.equal(phases.some(value => value.phase === "auditing-previous" && value.stage === "verified"), true);
  assert.equal(phases.some(value => value.phase === "auditing-destination" && value.stage === "verified"), true);
  assert.equal(phases.at(-1).phase, "committing-manifest");
  assert.equal(phases.some(value => value.phase === "manifest-published"), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDirectory, "catalog.manifest.json"))).generation, first.generation);
  const second = await promoteCandidate(f.candidate, { ...f, onProgress: value => {
    if (value.phase === "manifest-published") assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDirectory, "catalog.manifest.json"))).generation, value.generation);
  } });
  assert.notEqual(second.generation, first.generation);
});
test("record loss and corrupt assets cannot replace a good publication", async t => {
  const f = await fixture(t), first = await promoteCandidate(f.candidate, f);
  const other = assignIdentity({ mal_id: 2, title: "Other anime", entity_type: "WORK" }, f.registry);
  await f.build([other]);
  await assert.rejects(promoteCandidate(f.candidate, f), /remove existing work/);
  const manifest = await f.build(f.rows);
  fs.appendFileSync(path.join(f.candidate, "data", manifest.files[0].url.slice(6)), "corrupt");
  await assert.rejects(promoteCandidate(f.candidate, f), /checksum/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDirectory, "catalog.manifest.json"))).generation, first.generation);
});
test("content audit counts unknown fields without fabricating completeness", () => {
  const row = { mal_id: 1, entity_type: "WORK", title: "Anime" };
  const report = auditCatalogContent([row], [], {});
  assert.equal(report.coverage.anime, 1);
  assert.equal(report.coverage.withReleaseDate, 0);
  assert.equal(report.complete, false);
});

import { rollbackPublication } from "./rollback-publication.mjs";
import { normalizeAniZip } from "./anizip-record.mjs";
import { createHash } from "node:crypto";
test("rollback validates and restores the prior immutable generation", async t => {
  const f = await fixture(t), first = await promoteCandidate(f.candidate, f);
  await f.build(f.rows);
  await promoteCandidate(f.candidate, f);
  const restored = await rollbackPublication(f);
  assert.equal(restored.generation, first.generation);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDirectory, "catalog.manifest.json"))).generation, first.generation);
});
test("indexed episode loss blocks publication even if the record survives", async t => {
  const f = await fixture(t), row = { ...f.rows[0], episodes: 2 };
  const document = numbers => normalizeAniZip({ mappings: { mal_id: 1 }, episodes: Object.fromEntries(numbers.map(number => [String(number), { title: { en: `Episode ${number}` } }])) }, row, new Date().toISOString());
  const asset = (doc, directory) => {
    const content = JSON.stringify(doc), hash = createHash("sha256").update(content).digest("hex");
    const url = `/data/episodes/anime/1/${hash}.json`;
    fs.mkdirSync(path.join(directory, "episodes/anime/1"), { recursive: true });
    fs.writeFileSync(path.join(directory, url.slice(6)), content);
    return url;
  };
  row.episodes_metadata_url = asset(document([1, 2]), path.join(f.candidate, "data"));
  await f.build([row]);
  const first = await promoteCandidate(f.candidate, f);
  row.episodes_metadata_url = asset(document([1]), path.join(f.candidate, "data"));
  await f.build([row]);
  await assert.rejects(promoteCandidate(f.candidate, f), /lose indexed episodes/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDirectory, "catalog.manifest.json"))).generation, first.generation);
});


test("a genuine current-process audit can be reused but a serialized or stale report cannot bypass validation", async t => {
  const f = await fixture(t);
  const receipt = await auditGeneration(path.join(f.candidate, "data"), { registry: f.registry, indexDirectory: path.join(f.candidate, "indexes") });
  await assert.rejects(promoteCandidate(f.candidate, { ...f, registry: f.registry, auditReceipt: { ...receipt } }), /invalid candidate audit/);
  await promoteCandidate(f.candidate, { ...f, registry: f.registry, auditReceipt: receipt });
  await f.build(f.rows);
  await assert.rejects(promoteCandidate(f.candidate, { ...f, registry: f.registry, auditReceipt: receipt }), /invalid candidate audit/);
});
test("repeating a completed promotion does not replace its rollback pointer with the current version", async t => {
  const f = await fixture(t), first = await promoteCandidate(f.candidate, f);
  await f.build(f.rows);
  await promoteCandidate(f.candidate, f);
  await promoteCandidate(f.candidate, f);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDirectory, "catalog.manifest.json.previous"))).generation, first.generation);
});
