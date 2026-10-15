import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('src/context/UserContext.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function fixture(status, success, networkFailure=false) {
  const writes=[],requests=[];let index=0;
  const react={createContext:()=>({Provider:'fixture'}),useContext:()=>null,useState:initial=>{const current=index++;return[initial,value=>writes.push({index:current,value})];},useEffect(){},useRef:value=>({current:value}),useCallback:fn=>fn};
  const exports={};
  vm.runInNewContext(code,{exports,console:{error(){}},fetch:async(url,options)=>{requests.push({url,options});if(networkFailure)throw new Error("Fixture network failure");return new Response(JSON.stringify({success,user:success?{id:'owner',level_tier:1}:null}),{status});},require(name){
    if(name==='react')return{__esModule:true,default:react,...react};
    if(name==='react/jsx-runtime')return{jsx:(_type,props)=>props,jsxs:(_type,props)=>props};
    if(name==='@/lib/extensions/addonRegistry')return{addonRegistry:{getActivePlayerPlugin:()=>null}};
    if(name==='@/lib/extensions/pluginLoader')return{loadAccountPlugins:async()=>{}};
    throw new Error('Unexpected dependency '+name);
  }});
  const context=exports.UserProvider({children:null}).value;
  return{context,writes,requests};
}
for(const [status,success] of [[429,false],[500,false],[200,false]]) {
  const test=fixture(status,success);
  await assert.rejects(test.context.updateProfile({settings:{autoSkipIntro:true}}));
  assert.equal(test.requests.length,1,'denied profile update never retries automatically');
  assert.ok(!test.writes.some(write=>write.index===0),'denied update leaves user state unchanged');
}
const valid=fixture(200,true);
await valid.context.updateProfile({displayName:'Fixture'});
assert.ok(valid.writes.some(write=>write.index===0&&write.value.id==='owner'));
console.log('Actual React provider with fixture hooks: 429/500/failed responses reject without user state update or retry; successful response updates state. No rendered UI acceptance claimed.');

for(const [status,success,network] of [[403,false,false],[429,false,false],[500,false,false],[200,false,false],[200,true,true]]) {
 const test=fixture(status,success,network);
 assert.equal(await test.context.switchLevel(2),false,'Denied level change must return explicit failure');
 assert.ok(!test.writes.some(write=>write.index===0||write.index===1),'Denied level change leaves user/tier unchanged');
 assert.ok(test.writes.some(write=>write.value===true&&write.index>8),'Level failure becomes observable');
 assert.equal(test.requests.length,1,'Denied switch never retries or refreshes');
}
const levelSuccess=fixture(200,true);
assert.equal(await levelSuccess.context.switchLevel(1),true);
assert.ok(levelSuccess.writes.some(write=>write.index===1&&write.value===1));
console.log('Actual provider switchLevel returns false on denied/failed/network responses, leaves identity/tier unchanged, and returns true on confirmed success.');
