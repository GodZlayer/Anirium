import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyRegistry, registerWork } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { findCatalogWork, workReference } from "../../resources/js/lib/catalogIdentity.mjs";
import { publishCatalog } from "./publish-catalog.mjs";

const ref = (provider, media, id) => ({ provider, media, id: String(id) });
test("a source-only work retains UUID when MAL is attached and namespaces remain distinct", () => {
  const registry = emptyRegistry();
  const first = registerWork(registry, { references: [ref("kitsu", "anime", 1)] });
  const joined = registerWork(registry, { references: [ref("kitsu", "anime", 1), ref("mal", "anime", 11757)] });
  assert.equal(joined.work_id, first.work_id);
  const manga = registerWork(registry, { entity_type: "MANGA", references: [ref("mal", "manga", 11757)] });
  const novel = registerWork(registry, { entity_type: "NOVEL", references: [ref("kitsu", "manga", 11757)] });
  assert.equal(new Set([first.work_id, manga.work_id, novel.work_id]).size, 3);
  const independent = assignIdentity({ title: "Independent", external_ids_json: JSON.stringify([ref("kitsu", "anime", 100)]) }, registry);
  const associated = assignIdentity({ title: "Independent", mal_id: 999, external_ids_json: JSON.stringify([ref("kitsu", "anime", 100)]) }, registry);
  assert.equal(workReference(independent), workReference(associated));
  const before = JSON.stringify(registry);
  assert.throws(() => registerWork(registry, { references: [ref("mal", "anime", 1), ref("mal", "anime", 2)] }), /granularity/);
  assert.equal(JSON.stringify(registry), before);
  assert.throws(() => registerWork(registry, { references: [ref("kitsu", "anime", 999)], aliases: ["__proto__"] }), /Invalid work aliases/);
  assert.equal(JSON.stringify(registry), before);
});

test("identity migration preserves legacy navigation and can publish against the legacy snapshot", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-registry-"));
  const {loadRegistry,saveRegistry} = registryStorage(directory);
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const registry = emptyRegistry(), legacy = [{ mal_id: 1, title: "Anime" }, { mal_id: 1, entity_type: "MANGA", title: "Manga" }];
  const migrated = legacy.map(row => assignIdentity(row, registry));
  migrated.push(assignIdentity({ title: "Independent", external_ids_json: JSON.stringify([ref("kitsu", "anime", 10)]) }, registry));
  assert.equal(findCatalogWork(migrated, "1").title, "Anime");
  assert.equal(findCatalogWork(migrated, "manga:1").title, "Manga");
  assert.equal(findCatalogWork(migrated, workReference(migrated[2])).title, "Independent");
  assert.equal(workReference(migrated[0]), migrated[0].work_id);
  assert.equal((await publishCatalog(migrated, legacy, path.join(directory, "catalog.parquet"))).rows, 3);
  const file = path.join(directory, "registry.json");
  saveRegistry(file, registry); saveRegistry(file, registry);
  fs.writeFileSync(file, "truncated");
  const recovered = loadRegistry(file);
  assert.equal(recovered.recovered, false);
  saveRegistry(file, recovered.registry, recovered);
  assert.deepEqual(loadRegistry(file).registry, registry);
  fs.writeFileSync(file, "truncated"); fs.writeFileSync(file + ".previous", "truncated");
  assert.deepEqual(loadRegistry(file).registry, registry);
});

test("a legacy publication explicitly marked novel by MAL changes media without changing UUID or account references", () => {
  const registry = emptyRegistry();
  const before = assignIdentity({ mal_id: 21479, entity_type: "MANGA", format: "NOVEL", title: "Sword Art Online" }, registry);
  const after = assignIdentity({ ...before, metadata_source: "myanimelist" }, registry);
  assert.equal(after.entity_type, "NOVEL");
  assert.equal(after.work_id, before.work_id);
  assert.equal(workReference(after), workReference(before));
  assert.equal(findCatalogWork([after], "manga:21479").work_id, before.work_id);
  assert.equal(findCatalogWork([after], "novel:21479").work_id, before.work_id);
  assert.equal(registry.works[after.work_id].media_history[0].evidence.source, "myanimelist");
});

test("an identity keeps its linked MAL identifier when later source records omit that optional field", () => {
  const registry = emptyRegistry();
  const base = assignIdentity({ entity_type: "WORK", mal_id: 10, external_ids_json: '[{"provider":"anidb","media":"anime","id":"20"}]' }, registry);
  const later = assignIdentity({ entity_type: "WORK", external_ids_json: '[{"provider":"anidb","media":"anime","id":"20"}]' }, registry);
  assert.equal(later.mal_id, 10);
  assert.equal(later.work_id, base.work_id);
  assert.equal(later.account_reference, base.account_reference);
});
test("an external reference cannot identify anime and a written publication as the same work", () => {
  const registry = emptyRegistry();
  assert.throws(() => assignIdentity({ entity_type: "WORK", external_ids_json: '[{"provider":"mal","media":"manga","id":"10"}]' }, registry), /Cross-media/);
});
