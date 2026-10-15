import assert from 'node:assert/strict';
import {serverLog} from './server-log-fixture.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const inputCode=ts.transpileModule(fs.readFileSync('src/lib/apiInput.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const inputModule=await import(`data:text/javascript;base64,${Buffer.from(inputCode).toString('base64')}`);
const {validateWatchProgressInput}=inputModule;
const base={animeId:1,seasonIdx:0,episode:1,progressSeconds:12.25,durationSeconds:100.5,seasonEntityId:"11111111-1111-4111-8111-111111111111"};
assert.deepEqual(validateWatchProgressInput(base),base);
const {seasonIdx,...withoutSeason}=base;
assert.equal(validateWatchProgressInput(withoutSeason).seasonIdx,0);
for(const [field,values] of Object.entries({seasonEntityId:[undefined,null,"","1:s0","invalid"],animeId:[0,-1,'1',1.2,null,2147483648],seasonIdx:[-1,'0',null,0.5],episode:[0,'1',NaN],progressSeconds:[-1,'12',Infinity,null,2147483648],durationSeconds:[-1,NaN,'100',null]})) {
  for(const value of values) assert.throws(()=>validateWatchProgressInput({...base,[field]:value}),error=>error.status===400&&error.reason==='invalid_watch_progress');
}
const exports={};let profileReads=0,queries=0,parameters;
const code=ts.transpileModule(fs.readFileSync('src/app/api/progress/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,URL,console,require(name){
  if(name==='@/lib/serverLog')return serverLog;
  if(name==='@/lib/apiInput')return inputModule;
  if(name==='@/lib/userProfiles')return{getActiveUserProfile:async()=>{profileReads++;return{id:'owner'};}};
  if(name==='@/lib/postgres')return{query:async(_sql,params)=>{queries++;parameters=params;return[];}};
  if(name==='@/lib/webSession')return{readWebSessionId:()=>null};
  if(name==='@/lib/privateActivity')return{projectActivity:row=>row};
  if(name==='@/lib/seasonProgressReader')return{getSeasonProgress:async(...params)=>{queries++;parameters=params;return[];}};
  return require(name);
}});
const {NextRequest}=require('next/server');
for(const query of ['', 'animeId=0','animeId=-1','animeId=1abc','animeId=1.2','animeId=01','animeId=1e3','animeId=2147483648','animeId=%20','animeId=1&animeId=2','animeId=1','animeId=1&seasonEntityId=1:s0','animeId=1&seasonEntityId=11111111-1111-4111-8111-111111111111&seasonEntityId=22222222-2222-4222-8222-222222222222']) {
  const response=await exports.GET(new NextRequest(`https://fixture.invalid/api/progress?${query}`));
  assert.equal(response.status,400);
}
assert.equal(profileReads,0);assert.equal(queries,0,'invalid IDs rejected before profile/database access');
const response=await exports.GET(new NextRequest('https://fixture.invalid/api/progress?animeId=2147483647&seasonEntityId=11111111-1111-4111-8111-111111111111'));
assert.equal(response.status,200);assert.equal(profileReads,1);assert.equal(queries,1);
assert.equal(parameters[1],2147483647);
console.log('Actual progress route + input validator: malformed/duplicate IDs and invalid telemetry rejected before database; integer boundaries and fractional seconds accepted.');
