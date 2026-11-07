import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { syncSqlWorkGraph } from "./sql-work-graph.mjs";
import { syncSqlChildren } from "./sql-children-sync.mjs";
import { SqlChildIdentities } from "./sql-child-identities.mjs";
import { SqlChildEpisodes } from "./sql-child-episodes.mjs";
import { randomUUID } from "node:crypto";

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"sql-children-"));t.after(()=>fs.rmSync(root,{recursive:true}));
  const storage=registryStorage(root), registry=emptyRegistry();
  const row=assignIdentity({title:"Sparse work",entity_type:"WORK",mal_id:1,episodes:24},registry);
  storage.saveRegistry(path.join(root,"registry.json"),registry);syncSqlWorkGraph([row],registry,storage);
  const db=new DatabaseSync(storage.database);t.after(()=>db.close());
  const document=(numbers,extra={})=>{
    const payload={mal_id:1,catalog_key:"anime:1",source:"anizip",source_url:"https://api.ani.zip/mappings?mal_id=1",checked_at:"2026-10-24T00:00:00Z",
      episodes:numbers.map(number=>({number,titles:{en:`Episode ${number}`},tvdb_season:1,tvdb_episode_id:100+number,...extra}))};
    const bytes=JSON.stringify(payload), hash=createHash("sha256").update(bytes).digest("hex");
    const directory=path.join(root,"episodes/anime/1");fs.mkdirSync(directory,{recursive:true});
    const file=path.join(directory,hash+".json");fs.writeFileSync(file,bytes);
    row.episodes_metadata_url=`/data/episodes/anime/1/${hash}.json`;return file;
  };
  return {row,db,document,sync:()=>syncSqlChildren([row],root,storage)};
}

test("sparse evidence creates permanent SQL children, never episodes from total, and repeats do no work",t=>{
  const f=fixture(t);assert.equal(f.sync().episodes,0);assert.equal(f.db.prepare("SELECT count(*) n FROM catalog_episodes").get().n,0);
  f.document([1,3]);assert.equal(f.sync().episodes,2);
  const before=f.db.prepare("SELECT id,number,season_id FROM catalog_episodes ORDER BY number").all();
  assert.deepEqual(before.map(item=>item.number),[1,3]);assert.equal(new Set(before.map(item=>item.season_id)).size,1);
  assert.equal(f.sync().skipped,1);
  f.document([1,3,4]);f.sync();
  assert.deepEqual(f.db.prepare("SELECT id,number,season_id FROM catalog_episodes WHERE number IN (1,3) ORDER BY number").all(),before);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
});

test("sourced arcs refer only to real episode IDs and range correction preserves the arc UUID",t=>{
  const f=fixture(t);f.document([1,3]);
  const arc={arcId:"published-arc",name:"Published",sourceWorkMalId:1,verification:"source-matched",source_url:"https://example.org/arcs",checked_at:"2026-10-24T00:00:00Z",startEp:1,endEp:3};
  f.row.arcs_json=JSON.stringify([arc]);f.sync();
  const id=f.db.prepare("SELECT id FROM catalog_arcs").get().id;
  assert.equal(f.db.prepare("SELECT count(*) n FROM catalog_arc_episodes").get().n,2);
  f.row.arcs_json=JSON.stringify([{...arc,startEp:3}]);f.sync();
  assert.equal(f.db.prepare("SELECT id FROM catalog_arcs").get().id,id);
  assert.equal(f.db.prepare("SELECT count(*) n FROM catalog_arc_episodes").get().n,1);
});

test("corrupt immutable input leaves the last successful child revision unchanged",t=>{
  const f=fixture(t);f.sync();const revision=f.db.prepare("SELECT input_sha256 FROM catalog_work_child_revisions").get();
  const file=f.document([1,3]);fs.appendFileSync(file," ");
  assert.throws(f.sync,/checksum mismatch/);
  assert.deepEqual(f.db.prepare("SELECT input_sha256 FROM catalog_work_child_revisions").get(),revision);
  assert.equal(f.db.prepare("SELECT count(*) n FROM catalog_episodes").get().n,0);
});

test("a providerless work gains MAL without changing its episode or user reference",t=>{
  const f=fixture(t), work=randomUUID(), now=new Date().toISOString();
  f.db.prepare("INSERT INTO catalog_entities VALUES(?,'work','verified',?,?)").run(work,now,now);
  f.db.prepare("INSERT INTO catalog_works(id,media,title) VALUES(?,'anime','No provider yet')").run(work);
  const identities=new SqlChildIdentities(f.db), episodes=new SqlChildEpisodes(f.db,identities);
  const episode=episodes.write(work,{number:1,titles:{en:'First'}},[`work:${work}`]);
  f.db.exec("CREATE TABLE test_progress(user_id INTEGER,episode_id TEXT REFERENCES catalog_episodes(id),position INTEGER)");
  f.db.prepare("INSERT INTO test_progress VALUES(1,?,120)").run(episode);
  identities.attach(work,'mal','anime:work','900');
  assert.equal(episodes.write(work,{number:1,tvdb_episode_id:991},[`work:${work}`,'anime:900']),episode);
  assert.equal(f.db.prepare("SELECT episode_id FROM test_progress").get().episode_id,episode);
  assert.equal(identities.alias.get('episode','anime:900:ep-1').entity_id,episode);
});

test("TVDB identities are scoped to the work and contradictory positions roll back",t=>{
  const f=fixture(t);f.document([1,3]);f.sync();
  const identities=new SqlChildIdentities(f.db), episodes=new SqlChildEpisodes(f.db,identities);
  const before=f.db.prepare("SELECT id FROM catalog_episodes WHERE number=1").get().id;
  f.db.exec("BEGIN");
  assert.throws(()=>episodes.write(f.row.work_id,{number:3,tvdb_episode_id:101},[]),/numbering conflicts/);
  f.db.exec("ROLLBACK");
  const other=randomUUID(), now=new Date().toISOString();
  f.db.prepare("INSERT INTO catalog_entities VALUES(?,'work','verified',?,?)").run(other,now,now);
  f.db.prepare("INSERT INTO catalog_works(id,media,title) VALUES(?,'anime','Other work')").run(other);
  const distinct=episodes.write(other,{number:1,tvdb_episode_id:101},[`work:${other}`]);
  assert.notEqual(distinct,before);
  assert.equal(f.db.prepare("SELECT count(*) n FROM catalog_external_identities WHERE provider='tvdb' AND external_id='101'").get().n,2);
});
