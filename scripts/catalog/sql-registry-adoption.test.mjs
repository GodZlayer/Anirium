import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { addMangaBakaRedirect } from "./source-redirects.mjs";

test("the real adoption command requires completed SQL import and records an immutable metadata receipt",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"registry-adoption-"));
  t.after(()=>fs.rmSync(root,{recursive:true}));
  const storage=registryStorage(root), registry=emptyRegistry(), generation=randomUUID();
  const id=assignIdentity({title:"Actual title",mal_id:11757},registry).work_id;
  storage.saveRegistry(path.join(root,"registry.json"),registry);
  addMangaBakaRedirect(registry,{id:245,merged_with:234},{digest:`sha256:${"a".repeat(64)}`,sourceUpdatedAt:"2026-10-21",url:"https://api.mangabaka.org/v1/database/series.jsonl.tar.gz"});
  delete registry.works[id].title;
  const file=path.join(root,generation+".json");fs.writeFileSync(file,JSON.stringify(registry));
  const db=new DatabaseSync(storage.database);
  try {
    db.exec("DELETE FROM catalog_registry_metadata");
    db.prepare("INSERT INTO catalog_identity_imports VALUES(?,?,1,1,0,0,0)").run("a".repeat(64),generation);
    const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL("../adopt-catalog-registry.mjs",import.meta.url)),file],
      {env:{...process.env,CATALOG_IDENTITY_DATABASE:storage.database},encoding:"utf8",windowsHide:true,timeout:30000});
    let result=run(); assert.notEqual(result.status,0); assert.match(result.stderr,/completed SQL graph import/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM catalog_registry_adoptions").get().n,0);
    db.exec("UPDATE catalog_identity_imports SET complete=1");
    result=run(); assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),{works:1,redirects:1});
    assert.equal(db.prepare("SELECT works FROM catalog_registry_adoptions").get().works,1);
    assert.equal(db.prepare("SELECT id FROM catalog_works").get().id,id);
    fs.appendFileSync(file,"\n");
    result=run(); assert.notEqual(result.status,0); assert.match(result.stderr,/Immutable legacy registry snapshot changed/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM catalog_works").get().n,1);
  } finally {db.close();}
});
