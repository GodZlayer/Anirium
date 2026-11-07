import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { syncSqlWorkGraph } from "./sql-work-graph.mjs";
import { assertSqlUniverseProjection } from "./sql-universe-verification.mjs";

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"sql-work-graph-"));t.after(()=>fs.rmSync(root,{recursive:true}));
  const storage=registryStorage(root), registry=emptyRegistry(), file=path.join(root,"registry.json");
  return {...storage,registry,file,add:(id,extra={})=>assignIdentity({title:"Fixture "+id,mal_id:id,...extra},registry),
    save:()=>storage.saveRegistry(file,registry),sync:rows=>syncSqlWorkGraph(rows,registry,{database:storage.database})};
}
const edge=(id,type,media="anime")=>({source:"myanimelist",target:{provider:"mal",media,id:String(id)},relation_type:type});

test("typed anime sequels, alternatives and adaptations share a SQL universe while other remains separate",t=>{
  const f=fixture(t), rows=[f.add(1,{source_relations_json:JSON.stringify([edge(2,"sequel"),edge(3,"alternative_setting"),edge(4,"adaptation","manga"),edge(5,"other"),edge(5,"future_relation")])}),f.add(2),f.add(3),f.add(4,{entity_type:"NOVEL"}),f.add(5)];
  f.save();const report=f.sync(rows);
  const universe=rows[0].universe_v2_id;
  assert.ok(rows.every(row=>row.work_id!==universe));
  for(const index of [1,2,3]) assert.equal(rows[index].universe_v2_id,universe);
  assert.notEqual(rows[4].universe_v2_id,universe);
  assert.equal(rows[0].continuity_root_work_id,rows[1].continuity_root_work_id);
  assert.notEqual(rows[0].continuity_root_work_id,rows[2].continuity_root_work_id);
  assert.equal(report.organization.universesCreated,2);
  assert.deepEqual(f.sync(rows).organization,{universesCreated:0,membershipsAdded:0,relationsAdded:0,conflicts:0});
  assertSqlUniverseProjection(rows,f.database);
  const db=new DatabaseSync(f.database);
  try {
    assert.equal(db.prepare("SELECT kind FROM catalog_entities WHERE id=?").get(universe).kind,"universe");
    assert.equal(db.prepare("SELECT count(*) AS n FROM catalog_work_relations WHERE relation_type IN ('other','future_relation')").get().n,2);
  } finally {db.close();}
});

test("a new season with a lower component root cannot change an established universe UUID",t=>{
  const f=fixture(t), first=f.add(1,{work_id:"ffffffff-ffff-4fff-afff-ffffffffffff"});f.save();f.sync([first]);
  const original=first.universe_v2_id;
  const next=f.add(2,{work_id:"00000000-0000-4000-8000-000000000001",source_relations_json:JSON.stringify([edge(1,"prequel")])});
  f.save();f.sync([next,first]);
  assert.equal(next.universe_v2_id,original);assert.equal(first.universe_v2_id,original);
  assert.equal(f.sync([first,next]).organization.universesCreated,0);
  assertSqlUniverseProjection([first,next],f.database);
});

test("joining established universes reports a conflict without changing either identity or membership",t=>{
  const f=fixture(t), rows=[f.add(1),f.add(2)];f.save();f.sync(rows);
  const before=rows.map(row=>row.universe_v2_id);
  rows[0].source_relations_json=JSON.stringify([edge(2,"sequel")]);
  const report=f.sync(rows);
  assert.deepEqual(rows.map(row=>row.universe_v2_id),before);
  assert.equal(report.organization.conflicts,1);assert.equal(rows[0].universe_reconciliation_pending,true);
  assertSqlUniverseProjection(rows,f.database);
});

test("a work UUID cannot masquerade as a universe and forged readmodels are rejected",t=>{
  const f=fixture(t), row=f.add(1);f.save();f.sync([row]);
  assert.throws(()=>assertSqlUniverseProjection([{...row,universe_v2_id:row.work_id}],f.database),/differs from canonical SQL/);
  assert.throws(()=>assertSqlUniverseProjection([{...row,universe_ids_json:'[]'}],f.database),/differs from canonical SQL/);
  const db=new DatabaseSync(f.database);
  try {db.prepare("INSERT INTO catalog_universes VALUES(?)").run(row.work_id);} finally {db.close();}
  assert.throws(()=>f.sync([row]),/SQL universe role mismatch/);
});

test("new work metadata reaches the playback SQL model without inventing episode identities",t=>{
  const f=fixture(t), row=f.add(1,{format:"MOVIE",status:"FINISHED",episodes:1});f.save();f.sync([row]);
  const db=new DatabaseSync(f.database);
  try {
    assert.deepEqual({...db.prepare("SELECT id,format,status,episode_count FROM catalog_works").get()},
      {id:row.work_id,format:"MOVIE",status:"FINISHED",episode_count:1});
    row.format="UNKNOWN";row.status="UNKNOWN";row.episodes=null;
    f.sync([row]);
    assert.equal(db.prepare("SELECT format FROM catalog_works").get().format,"MOVIE");
  } finally {db.close();}
});
