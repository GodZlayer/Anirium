import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { serverLog } from './server-log-fixture.mjs';
const source=fs.readFileSync('src/lib/catalog.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function counts(rows,{schemaFailure=false,queryFailure=false}={}) {
  const exports={}; let index=0;
  vm.runInNewContext(compiled,{exports,console,require:name=>name==='./serverLog'?serverLog:name==='./postgres'?{
    ensurePostgresSchema:async()=>{if(schemaFailure)throw new Error('fixture');},
    queryOne:async()=>{if(queryFailure)throw new Error('fixture');return rows[index++];},
  }:{} });
  return JSON.parse(JSON.stringify(await exports.getCatalogCounts()));
}
assert.deepEqual(await counts([{count:'123'},{count:'45'}]),{totalReleases:123,totalFranchises:45});
assert.deepEqual(await counts([{count:'0'},{count:'0'}]),{totalReleases:0,totalFranchises:0},'Real empty catalog must remain zero');
for(const options of [{schemaFailure:true},{queryFailure:true}]) assert.deepEqual(await counts([],options),{totalReleases:null,totalFranchises:null});
for(const count of [undefined,'-1','1junk','1.5','9007199254740992','NaN','']) {
  assert.deepEqual(await counts([{count},{count}]),{totalReleases:null,totalFranchises:null},`Invalid count ${count}`);
}
assert.deepEqual(await counts([null,null]),{totalReleases:null,totalFranchises:null});
const page=fs.readFileSync('src/app/page.tsx','utf8');
assert.ok(!/11879|8177/.test(source+page),'Invented counts must not return');
assert.ok(page.includes('catalogCounts.totalReleases === null ? "Contagem indisponível"'));
console.log('Real catalog module distinguishes measured totals, zero, missing/invalid rows and database/schema failure without invented counts. UI null state is explicit; browser acceptance remains pending.');
