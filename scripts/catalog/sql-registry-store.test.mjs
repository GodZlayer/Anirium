import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { assertSqlRegistrySnapshot } from "./sql-registry-snapshot.mjs";
import { assertPublicationRegistryIdentity } from "./publication-registry-identity.mjs";
import { adoptRegistryMetadata } from "./adopt-registry-metadata.mjs";
import { addMangaBakaRedirect } from "./source-redirects.mjs";

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"sql-registry-"));
  t.after(()=>fs.rmSync(root,{recursive:true}));
  return {...registryStorage(root),file:path.join(root,"registry.json")};
}
const row = (id,extra={}) => ({title:"Same title",external_ids_json:JSON.stringify([{provider:"kitsu",media:"anime",id:String(id)}]),...extra});

test("SQL preserves identity without MAL and survives missing or corrupt JSON snapshots",t=>{
  const f=fixture(t), registry=emptyRegistry(), first=assignIdentity(row(1),registry);
  f.saveRegistry(f.file,registry);
  fs.unlinkSync(f.file);
  let current=f.loadRegistry(f.file).registry;
  assert.equal(assignIdentity(row(1,{mal_id:11757}),current).work_id,first.work_id);
  f.saveRegistry(f.file,current);
  fs.writeFileSync(f.file,"corrupted");
  current=f.loadRegistry(f.file).registry;
  assert.equal(assignIdentity(row(1),current).mal_id,11757);
  const second=assignIdentity(row(2),current);
  assert.notEqual(first.work_id,second.work_id);
});

test("an outdated collector cannot discard identities committed by another writer",t=>{
  const f=fixture(t), initial=emptyRegistry(); assignIdentity(row(1),initial); f.saveRegistry(f.file,initial);
  const stale=f.loadRegistry(f.file).registry, current=f.loadRegistry(f.file).registry;
  const added=assignIdentity(row(2),current); f.saveRegistry(f.file,current);
  assert.throws(()=>f.saveRegistry(f.file,stale),/remove an established SQL/);
  assert.ok(f.loadRegistry(f.file).registry.works[added.work_id]);
});

test("a valid-looking reference reassignment is rejected without partial changes",t=>{
  const f=fixture(t), registry=emptyRegistry();
  const first=assignIdentity(row(1,{mal_id:1}),registry), second=assignIdentity(row(2),registry);
  f.saveRegistry(f.file,registry);
  registry.works[first.work_id].references=registry.works[first.work_id].references.filter(ref=>ref.provider!=="mal");
  registry.works[second.work_id].references.push({provider:"mal",media:"anime",id:"1"});
  registry.references["mal:anime:1"]=second.work_id;
  const extra=assignIdentity(row(3),registry);
  assert.throws(()=>f.saveRegistry(f.file,registry),/reassign or discard SQL/);
  const saved=f.loadRegistry(f.file).registry;
  assert.equal(saved.references["mal:anime:1"],first.work_id);
  assert.equal(saved.works[extra.work_id],undefined);
});

test("UUID collisions with another entity kind roll back the whole write",t=>{
  const f=fixture(t), registry=emptyRegistry(), first=assignIdentity(row(1),registry);
  const collision=assignIdentity(row(2),registry), db=new DatabaseSync(f.database);
  db.prepare("INSERT INTO catalog_entities VALUES(?,'episode','verified',NULL,NULL)").run(collision.work_id); db.close();
  assert.throws(()=>f.saveRegistry(f.file,registry),/another entity type/);
  assert.equal(f.loadRegistry(f.file).registry.works[first.work_id],undefined);
});

test("an empty SQL database refuses to recreate identities from an existing JSON snapshot",t=>{
  const f=fixture(t), registry=emptyRegistry(); assignIdentity(row(1),registry);
  fs.writeFileSync(f.file,JSON.stringify(registry));
  assert.throws(()=>f.loadRegistry(f.file),/SQL catalog migration required/);
  assert.equal(fs.readFileSync(f.file,"utf8"),JSON.stringify(registry));
});

test("publication snapshots must match committed SQL identities in both directions",t=>{
  const f=fixture(t), registry=emptyRegistry(); assignIdentity(row(1),registry); f.saveRegistry(f.file,registry);
  assertSqlRegistrySnapshot(registry,f.database);
  assignIdentity(row(2),registry);
  assert.throws(()=>assertSqlRegistrySnapshot(registry,f.database),/remove an established SQL/);
});

test("a published row cannot attach another provider identity to a known UUID",t=>{
  const f=fixture(t), registry=emptyRegistry(), first=assignIdentity(row(1,{mal_id:1}),registry);
  f.saveRegistry(f.file,registry);
  const sql=f.loadRegistry(f.file).registry;
  assertPublicationRegistryIdentity(first,sql);
  assert.throws(()=>assertPublicationRegistryIdentity({...first,external_ids_json:'[{"provider":"kitsu","media":"anime","id":"999"}]'},sql),/provider reference differs/);
  assert.throws(()=>assertPublicationRegistryIdentity({...first,mal_id:999},sql),/alias differs|MAL identifier differs/);
});

test("legacy metadata adoption preserves source redirects but cannot create identities",t=>{
  const f=fixture(t), registry=emptyRegistry(); assignIdentity(row(1),registry); f.saveRegistry(f.file,registry);
  const legacy=structuredClone(registry);
  for (const value of Object.values(legacy.works)) delete value.title;
  addMangaBakaRedirect(legacy,{id:245,merged_with:234},{digest:`sha256:${"a".repeat(64)}`,sourceUpdatedAt:"2026-10-21",url:"https://api.mangabaka.org/v1/database/series.jsonl.tar.gz"});
  const db=new DatabaseSync(f.database);
  try {
    assert.deepEqual(adoptRegistryMetadata(db,legacy),{works:1,redirects:1});
    assert.deepEqual(adoptRegistryMetadata(db,legacy),{works:1,redirects:1});
    const unknown=assignIdentity(row(2),legacy);
    assert.throws(()=>adoptRegistryMetadata(db,legacy),/complete SQL work set/);
    assert.equal(db.prepare("SELECT id FROM catalog_works WHERE id=?").get(unknown.work_id),undefined);
  } finally {db.close();}
  assert.equal(Object.keys(f.loadRegistry(f.file).registry.source_redirects).length,1);
});

test("an existing internal UUID remains usable even without any provider identity",t=>{
  const f=fixture(t), id="59eff475-b7a0-4657-bf8f-c367fb1c3f8c", db=new DatabaseSync(f.database);
  db.prepare("INSERT INTO catalog_entities VALUES(?,'work','verified',NULL,NULL)").run(id);
  db.prepare("INSERT INTO catalog_works(id,media,title) VALUES(?,'anime','Internal work')").run(id); db.close();
  const current=f.loadRegistry(f.file).registry;
  const identified=assignIdentity({work_id:id,title:"Internal work",external_ids_json:"[]"},current);
  f.saveRegistry(f.file,current);
  assert.equal(identified.work_id,id);
  assert.equal(identified.mal_id,null);
  assert.equal(f.loadRegistry(f.file).registry.works[id].references.length,0);
});
