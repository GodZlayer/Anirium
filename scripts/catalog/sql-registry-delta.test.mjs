import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { registryConnection } from "./sql-registry-connection.mjs";

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"registry-delta-"));
  t.after(()=>fs.rmSync(root,{recursive:true}));
  return {...registryStorage(root),file:path.join(root,"registry.json")};
}
const row=id=>({title:"Work "+id,external_ids_json:JSON.stringify([{provider:"kitsu",media:"anime",id:String(id)}])});

test("saving an unchanged SQL registry performs no database write",t=>{
  const f=fixture(t), registry=emptyRegistry(); assignIdentity(row(1),registry);
  assert.deepEqual(f.saveRegistry(f.file,registry),{worksChanged:1,redirectsChanged:0,batches:1});
  const db=new DatabaseSync(f.database);
  try {db.exec("CREATE TRIGGER forbid_rewrite BEFORE UPDATE ON catalog_works BEGIN SELECT RAISE(ABORT,'unnecessary rewrite'); END");}
  finally {db.close();}
  assert.deepEqual(f.saveRegistry(f.file,registry),{worksChanged:0,redirectsChanged:0,batches:0});
  assert.deepEqual(f.saveRegistry(f.file,f.loadRegistry(f.file).registry),{worksChanged:0,redirectsChanged:0,batches:0});
});

test("adding a provider mapping does not rewrite an unchanged work",t=>{
  const f=fixture(t), registry=emptyRegistry(), original=assignIdentity(row(1),registry);
  f.saveRegistry(f.file,registry);
  const db=new DatabaseSync(f.database);
  try {db.exec("CREATE TRIGGER forbid_rewrite BEFORE UPDATE ON catalog_works BEGIN SELECT RAISE(ABORT,'unnecessary rewrite'); END");}
  finally {db.close();}
  assignIdentity({...row(1),mal_id:11757},registry);
  assert.equal(f.saveRegistry(f.file,registry).worksChanged,1);
  assert.equal(f.loadRegistry(f.file).registry.references["mal:anime:11757"],original.work_id);
});

test("interruption preserves committed UUID batches and releases the writer for account actions",t=>{
  const f=fixture(t), registry=emptyRegistry(), ids=[];
  for (let number=1;number<=501;number++) ids.push(assignIdentity(row(number),registry).work_id);
  const db=new DatabaseSync(f.database);
  try {
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,active_minutes INTEGER); INSERT INTO users VALUES(1,0)");
    db.exec(`CREATE TRIGGER interrupt_batch BEFORE INSERT ON catalog_works WHEN NEW.id='${ids[250]}' BEGIN SELECT RAISE(ABORT,'simulated interruption'); END`);
    assert.throws(()=>f.saveRegistry(f.file,registry),/simulated interruption/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM catalog_works").get().n,250);
    const account=new DatabaseSync(f.database);
    try {account.prepare("UPDATE users SET active_minutes=active_minutes+1 WHERE id=1").run();}
    finally {account.close();}
    db.exec("DROP TRIGGER interrupt_batch");
    assert.deepEqual(f.saveRegistry(f.file,registry),{worksChanged:251,redirectsChanged:0,batches:2});
    assert.equal(db.prepare("SELECT active_minutes FROM users WHERE id=1").get().active_minutes,1);
    const current=f.loadRegistry(f.file).registry;
    for (let index=0;index<ids.length;index++) assert.equal(current.references[`kitsu:anime:${index+1}`],ids[index]);
    assert.equal(Object.keys(current.works).length,501);
    assert.equal(db.prepare("SELECT count(*) AS n FROM catalog_works").get().n,501);
  } finally {db.close();}
});

test("a catalog read snapshot does not block an account write on another connection",t=>{
  const f=fixture(t), catalog=registryConnection(f.database), account=new DatabaseSync(f.database);
  try {
    catalog.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,active_minutes INTEGER); INSERT INTO users VALUES(1,0); BEGIN");
    assert.equal(catalog.prepare("SELECT active_minutes FROM users").get().active_minutes,0);
    account.prepare("UPDATE users SET active_minutes=1 WHERE id=1").run();
    assert.equal(catalog.prepare("SELECT active_minutes FROM users").get().active_minutes,0);
    catalog.exec("COMMIT");
    assert.equal(catalog.prepare("SELECT active_minutes FROM users").get().active_minutes,1);
  } finally {catalog.close();account.close();}
});
