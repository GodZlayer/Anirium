import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { publishGeneration } from "./publish-generation.mjs";
import { reprojectCandidate } from "./reproject-candidate.mjs";
import { loadGeneration } from "./load-generation.mjs";
import { writeJson } from "./mal-detail-cache.mjs";
import { digestFile } from "./download-snapshot.mjs";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { DatabaseSync } from "node:sqlite";
async function fixture(t) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-projection-"));
  t.after(() => fs.rmSync(output, { recursive: true }));
  const registry = emptyRegistry();
  const storage = registryStorage(output);
  const rows = [assignIdentity({ title: "Publication fixture", entity_type: "MANGA", mal_id: 41, format: "MANGA" }, registry)];
  storage.saveRegistry(path.join(output, "registry.json"), registry);
  const manifest = await publishGeneration(rows, [], path.join(output, "data"), { indexDirectory: path.join(output, "indexes") });
  return { output, registry, rows, manifest, identityDatabase:storage.database, cacheDirectory: path.join(output, "cache") };
}
test("offline projection applies cached evidence, changes media immediately and publishes a new immutable generation", async t => {
  const f = await fixture(t), oldIndex = path.join(f.output, "indexes", f.manifest.generation + ".sqlite");
  const digest = await digestFile(oldIndex);
  writeJson(path.join(f.cacheDirectory, "manga-details/41.json"), { checkedAt: "2026-10-21T00:00:00Z", payload: {
    id: 41, title: "Publication fixture", media_type: "light_novel", status: "currently_publishing", num_chapters: 0, related_anime: [], related_manga: [],
  } });
  const result = await reprojectCandidate(f.output, { cacheDirectory: f.cacheDirectory,identityDatabase:f.identityDatabase });
  assert.notEqual(result.generation, f.manifest.generation);
  assert.equal(result.projection.reclassified, 1);
  assert.equal(result.projection.cachedCoverage.manga.attempted, 0);
  assert.equal(await digestFile(oldIndex), digest);
  const after = await loadGeneration(path.join(f.output, "data"));
  assert.equal(after[0].entity_type, "NOVEL");
  assert.equal(after[0].work_id, f.rows[0].work_id);
  assert.equal(after[0].account_reference, f.rows[0].account_reference);
  assert.ok(JSON.parse(after[0].aliases_json).includes("manga:41"));
});
test("an interrupted offline projection leaves the previously audited pointer and index intact", async t => {
  const f = await fixture(t), manifestFile = path.join(f.output, "data/catalog.manifest.json"), previous = fs.readFileSync(manifestFile);
  await assert.rejects(reprojectCandidate(f.output, { identityDatabase:f.identityDatabase,includeCachedMetadata: false, beforePublish: () => { throw Error("interrupted"); } }), /interrupted/);
  assert.deepEqual(fs.readFileSync(manifestFile), previous);
  assert.equal((await loadGeneration(path.join(f.output, "data"))).length, 1);
});

test("an added work from the verified legacy publication retains its existing UUID when reconciled into SQL",async t=>{
  const f=await fixture(t);
  const added=assignIdentity({title:"Newly discovered novel",entity_type:"NOVEL",mal_id:42},f.registry);
  await publishGeneration([...f.rows,added],f.rows,path.join(f.output,"data"),{indexDirectory:path.join(f.output,"indexes")});
  const db=new DatabaseSync(f.identityDatabase);
  try {
    assert.equal(db.prepare("SELECT count(*) n FROM catalog_works").get().n,1);
    await reprojectCandidate(f.output,{identityDatabase:f.identityDatabase,includeCachedMetadata:false});
    assert.equal(db.prepare("SELECT id FROM catalog_works WHERE id=?").get(added.work_id).id,added.work_id);
    assert.equal(db.prepare("SELECT count(*) n FROM catalog_works").get().n,2);
  } finally {db.close();}
});

test("legacy input cannot reassign an external identity already established in SQL",async t=>{
  const f=await fixture(t), foreign=emptyRegistry();
  const conflicting=assignIdentity({title:"Conflicting UUID",entity_type:"MANGA",mal_id:41},foreign);
  await publishGeneration([conflicting],[],path.join(f.output,"data"),{indexDirectory:path.join(f.output,"indexes")});
  await assert.rejects(reprojectCandidate(f.output,{identityDatabase:f.identityDatabase,includeCachedMetadata:false}),/Conflicting established work identities/);
  const db=new DatabaseSync(f.identityDatabase);
  try {assert.equal(db.prepare("SELECT id FROM catalog_works").get().id,f.rows[0].work_id);assert.equal(db.prepare("SELECT count(*) n FROM catalog_works").get().n,1);}
  finally {db.close();}
});
