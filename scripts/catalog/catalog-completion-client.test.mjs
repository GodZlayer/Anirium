import test from "node:test";
import assert from "node:assert/strict";
import { readCatalogCompletion, emptyCatalogCompletion } from "../../resources/js/lib/catalogCompletion.mjs";
import { createCanonicalPreferenceWriter } from "../../resources/js/lib/canonicalPreferenceWriter.mjs";

test("completion requires the SQL contract and coherent real universe UUIDs",()=>{
  const value=emptyCatalogCompletion();assert.deepEqual(readCatalogCompletion(value),value);
  assert.equal(readCatalogCompletion({...value,authority:"json"}),null);
  assert.equal(readCatalogCompletion({...value,counts:{...value.counts,episodes:-1}}),null);
  assert.equal(readCatalogCompletion({...value,counts:{...value.counts,universes:1},completed_universe_ids:["mal-269"]}),null);
});

test("preference writes remain ordered and a result from an old account cannot apply",async()=>{
  const writes=[], applied=[], errors=[];let account="first", release;
  const gate=new Promise(resolve=>{release=resolve;});
  const queue=createCanonicalPreferenceWriter({
    isCurrent:value=>value===account,
    write:async payload=>{writes.push(payload);if(payload===1)await gate;return payload;},
    apply:value=>applied.push(value),failed:error=>errors.push(error),
  });
  const first=queue(1,"first"), second=queue(2,"first");
  await Promise.resolve();assert.deepEqual(writes,[1]);
  account="second";release();await Promise.all([first,second]);
  assert.deepEqual(applied,[]);assert.deepEqual(writes,[1]);
  await queue(3,"second");assert.deepEqual(applied,[3]);assert.deepEqual(errors,[]);
});

test("a failed write is reported and does not prevent later writes",async()=>{
  const applied=[],errors=[];
  const queue=createCanonicalPreferenceWriter({isCurrent:()=>true,write:async value=>{if(value===1)throw Error("rejected");return value;},apply:value=>applied.push(value),failed:error=>errors.push(error.message)});
  await queue(1,"account");await queue(2,"account");
  assert.deepEqual(errors,["rejected"]);assert.deepEqual(applied,[2]);
});
