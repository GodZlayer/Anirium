import test from "node:test";
import assert from "node:assert/strict";
import { loadSqlUniverseWorks } from "../../resources/js/lib/loadSqlUniverseWorks.mjs";
import { catalogUniverseIds } from "../../resources/js/lib/catalogUniverseIdentity.mjs";
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const row=n=>({work_id:id(n),title:"Work "+n,universe_identity_version:1,universe_ids_json:JSON.stringify([id(9)]),universe_v2_id:id(9)});
const response=(works,page=1,next=false)=>({ok:true,json:async()=>({schema:1,entity:{kind:"universe",id:id(9)},page,has_next:next,work_ids:works.map(work=>work.work_id),works})});

test("universe loading follows SQL membership pages and does not query the catalog to infer groups",async()=>{
  const calls=[], signal=new AbortController().signal;
  const result=await loadSqlUniverseWorks(row(1),{signal,fetcher:async(url,options)=>{
    calls.push(url);assert.equal(options.signal,signal);
    assert.ok(url.startsWith(`/api/catalog/graph/universe/${id(9)}?`));
    return calls.length===1 ? response([row(1)],1,true) : response([row(2)],2,false);
  }});
  assert.deepEqual(result.map(work=>work.work_id),[id(1),id(2)]);
  assert.equal(calls.length,2);
});

test("a missing current work is not appended as fabricated membership",async()=>{
  const result=await loadSqlUniverseWorks(row(1),{fetcher:async()=>response([row(2)])});
  assert.deepEqual(result.map(work=>work.work_id),[id(2)]);
});

test("legacy roots and a work UUID do not prove universe identity",async()=>{
  assert.deepEqual(catalogUniverseIds({work_id:id(1),universe_v2_id:id(1)}),[]);
  assert.deepEqual(catalogUniverseIds({...row(1),universe_ids_json:JSON.stringify([id(1)])}),[]);
  await assert.rejects(loadSqlUniverseWorks(row(1),{universeId:id(1)}),/Invalid SQL universe/);
});

test("cross-universe or malformed page results are rejected",async()=>{
  await assert.rejects(loadSqlUniverseWorks(row(1),{fetcher:async()=>response([{...row(2),universe_ids_json:JSON.stringify([id(8)])}])}),/outside the SQL universe/);
  await assert.rejects(loadSqlUniverseWorks(row(1),{fetcher:async()=>response([row(2)],2)}),/Invalid SQL universe graph/);
});
