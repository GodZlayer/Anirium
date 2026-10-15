import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const identity={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/profilePlaybackIdentity.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,identity);
const require=createRequire(import.meta.url),exports={};
let items=[];
const code=ts.transpileModule(fs.readFileSync('src/components/ContinueWatchingRow.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
vm.runInNewContext(code,{exports,require(name){if(name==='../lib/profilePlaybackIdentity')return identity.exports;if(name==='@/context/UserContext')return {useUser:()=>({level:2,watchHistory:items})};return require(name);}});
const item={canonicalEntityId:'11111111-1111-4111-8111-111111111111',seasonEntityId:'22222222-2222-4222-8222-222222222222',animeId:99,seasonIdx:0,episodeNumber:1,resumeAvailable:true,progressSeconds:1,durationSeconds:50,animeTitle:'Fixture'};
function buttons(node){if(!React.isValidElement(node))return [];return [...(node.props.role==='button'?[node]:[]),...React.Children.toArray(node.props.children).flatMap(buttons)];}
for(const patch of [{},{seasonEntityId:undefined},{canonicalEntityId:undefined},{animeId:null},{seasonIdx:null},{episodeNumber:null},{resumeAvailable:false}]) {
  items=[{...item,...patch}];const calls=[];
  const tree=exports.default({onPlayResume:(...args)=>calls.push(args),onOpenAnime(){}}),button=buttons(tree)[0];
  assert.ok(button);
  button.props.onClick();button.props.onKeyDown({key:'Enter',preventDefault(){}});
  const available=Object.keys(patch).length===0;
  assert.equal(button.props['aria-disabled'],!available);
  assert.equal(calls.length,available?2:0);
  if(available)assert.deepEqual(calls[0],[99,0,1,item.seasonEntityId,item.canonicalEntityId]);
  assert.match(renderToStaticMarkup(tree),/2%/,'actual percentage is not inflated to five percent');
}
items=[{...item,durationSeconds:0}];
const unknown=renderToStaticMarkup(exports.default({onPlayResume(){},onOpenAnime(){}}));
assert.match(unknown,/Duração indisponível/);
assert.ok(!unknown.includes('5%'));
console.log('Actual ContinueWatchingRow callbacks/SSR: only confirmed route/season/ordinal resume by click or keyboard; nullable context disables, actual 2% preserved, unknown duration has no invented denominator.');
