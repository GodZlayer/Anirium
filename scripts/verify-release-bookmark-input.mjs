import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('src/lib/apiInput.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {validateBookmarkInput}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const request={action:'toggle_bookmark',entityType:'EPISODE',seasonEntityId:'11111111-1111-4111-8111-111111111111',parentSeriesId:920001,episodeNumber:1};
validateBookmarkInput(request);
const work={action:'toggle_bookmark',entityType:'SERIES',entityId:request.seasonEntityId};
validateBookmarkInput(work);
for (const invalid of [{entityId:'920001'},{entityId:920001},{entityId:undefined},{animeId:920001}]) assert.throws(()=>validateBookmarkInput({...work,...invalid}),e=>e.status===400);
assert.throws(()=>validateBookmarkInput({action:'toggle_bookmark',animeId:920001}),e=>e.status===400);
for(const entityType of ['UNIVERSE','SERIES','SEASON','EPISODE']) {
  validateBookmarkInput({action:'remove_bookmark',entityType,entityId:request.seasonEntityId});
  for(const entityId of ['99','99:s0','',undefined]) assert.throws(()=>validateBookmarkInput({action:'remove_bookmark',entityType,entityId}),e=>e.status===400);
}
for(const entityType of ['UNIVERSE','SEASON']) {
  const target={action:'toggle_bookmark',entityType,entityId:request.seasonEntityId};
  validateBookmarkInput(target);
  for(const invalid of [{entityId:'99:s0'},{entityId:'99'},{entityId:undefined},{animeId:99},{seasonEntityId:'22222222-2222-4222-8222-222222222222'}]) assert.throws(()=>validateBookmarkInput({...target,...invalid}),e=>e.status===400);
}
for(const invalid of [{entityId:'920001:s0:e1'},{entityId:request.seasonEntityId},{seasonEntityId:undefined},{seasonEntityId:null},{seasonEntityId:'invalid'},{episodeNumber:0},{episodeNumber:'1'},{parentSeriesId:0},{parentSeriesId:2147483648}]) assert.throws(()=>validateBookmarkInput({...request,...invalid}),e=>e.status===400);
console.log('Actual episode bookmark request validator: canonical release+ordinal accepted; old/ambiguous identity, missing season and invalid numeric inputs rejected.');
