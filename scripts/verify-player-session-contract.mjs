import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const statusSource = fs.readFileSync('src/addons/player-pro/playbackStatus.ts', 'utf8');
const exported = { exports: {} };
vm.runInNewContext(ts.transpileModule(statusSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, exported);
const { playbackFailureStatus, playbackStatusMessage } = exported.exports;
for (const reason of ['plus_required','session_in_use','token_expired','session_revoked','device_mismatch','account_mismatch','session_mismatch','session_invalid','core_unavailable']) {
  assert.equal(playbackFailureStatus({ status: 'unauthorized', reason }, 403), reason);
  assert.notEqual(playbackStatusMessage(reason).title, 'Nenhuma mídia pronta para reprodução');
}
assert.equal(playbackFailureStatus({ reason:'secret-injected-reason' },503),'service-error');

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx','utf8');
const response=(ok,status,data)=>({ok,status,json:async()=>data});
const prepareMatch=source.match(/const fetchSources = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[anime, currentEp, currentSeason, deviceId, isServiceOnline, serviceEndpoint\]\);/);
assert.ok(prepareMatch);
const prepareCode=ts.transpileModule(`(async()=>{${prepareMatch[1]}})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const denied of [false,true]) {
 const calls=[],states={};
 const prepare=vm.runInNewContext(prepareCode,{
  preparationRef:{current:null},AbortController,isServiceOnline:true,deviceId:'device',playerSessionRef:{current:'player-session'},
  serviceEndpoint:'http://127.0.0.1:4004',anime:{title:'Different parent work',title_english:'Parent English title'},currentSeason:{seasonNumber:2,title:'Episode context',title_english:'English title',idMal:1,episodes:26,format:'TV'},currentEp:7,playbackFailureStatus,
  fetch:async(url,options)=>{calls.push({url,options});return calls.length===1 ? response(!denied,denied?409:200,denied?{reason:'session_in_use'}:{status:'authorized',token:'core-token'}) : response(true,200,{status:'preparing',sources:1,playbackTicket:'service-ticket'});},
  setIsLoadingSources:value=>{states.loading=value;},setPlaybackTicket:value=>{states.ticket=value;},setServiceManifest:value=>{states.manifest=value;},setServiceToken:value=>{states.token=value;},setServiceStatus:value=>{states.status=value;},console,
 });
 await prepare();
 assert.equal(states.loading,false);
 assert.equal(calls.length,denied?1:2,'rejected Core session must never prepare');
 if(denied) assert.equal(states.status,'session_in_use');
 else {
  assert.equal(calls[1].url,'http://127.0.0.1:4004/playback/prepare');
  assert.deepEqual(JSON.parse(calls[1].options.body),{token:'core-token',deviceId:'device',title:'Episode context',titleEnglish:'English title',titleRomaji:'Episode context',season:2,episode:7,malId:1,episodeCount:26,format:'TV'});
  assert.equal(states.ticket,'service-ticket');
 }
}
const match = source.match(/useEffect\(\(\) => \{\n    if \(!playbackTicket[\s\S]*?\n  \}, \[playbackTicket, isServiceOnline, deviceId, serviceEndpoint\]\);/);
assert.ok(match, 'renewal effect missing');
assert.ok(!/window\.location|redirectGoogleLogin|accounts\.google\.com/.test(match[0]), 'Service renewal must never navigate to an external login');
const compiled=ts.transpileModule(match[0],{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const scenario of [
 { replies:[response(true,200,{status:'authorized',token:'new-token'}),response(true,200,{})], expected:'new-token', calls:2 },
 { replies:[response(false,403,{reason:'plus_required'})], expected:'plus_required',calls:1 },
 { replies:[response(false,409,{reason:'session_in_use'})],expected:'session_in_use',calls:1 },
 { replies:[response(true,200,{status:'authorized',token:'new-token'}),response(false,401,{reason:'session_revoked'})],expected:'session_revoked',calls:2 },
 { replies:[], expected:'core_unavailable', calls:1, throwAt:1, stage:'core-session' },
 { replies:[response(true,200,{status:'authorized',token:'new-token'})], expected:'core_unavailable', calls:2, throwAt:2, stage:'service-renew' },
]) {
 let cleanup,tick,listener; const calls=[],states={},diagnostics=[];
 vm.runInNewContext(compiled,{
  useEffect: effect=>{cleanup=effect();},playbackTicket:'ticket',isServiceOnline:true,deviceId:'device',serviceEndpoint:'http://127.0.0.1:4004',playerSessionRef:{current:'player-session'},AbortController,
  console:{info:(...args)=>diagnostics.push(args),warn:(...args)=>diagnostics.push(args)},
  setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{},
  document:{visibilityState:'visible',addEventListener:(_,fn)=>{listener=fn;},removeEventListener:()=>{}},
  fetch:async(url,options)=>{calls.push({url,options});if(calls.length===scenario.throwAt) throw new TypeError('private endpoint secret');return scenario.replies[calls.length-1];},playbackFailureStatus,
  setServiceStatus:value=>{states.status=value;},setServiceManifest:value=>{states.manifest=value;},setPlaybackTicket:value=>{states.ticket=value;},setServiceToken:value=>{states.token=value;},
 });
 await tick();
 assert.equal(calls.length,scenario.calls);
 assert.equal(calls[0].options.headers['x-anirium-player-session'],'player-session');
 if(scenario.expected==='new-token') {
  assert.equal(states.token,'new-token');
  assert.deepEqual(JSON.parse(calls[1].options.body),{playbackTicket:'ticket',token:'new-token',deviceId:'device'});
 } else {assert.equal(states.status,scenario.expected);assert.equal(states.ticket,'');assert.equal(states.manifest,null);}
 assert.equal(typeof listener,'function');
 assert.equal(diagnostics.length,scenario.throwAt?2:1);
 assert.ok(diagnostics.at(-1)[0].includes(scenario.expected==='new-token'?'Renovação confirmada':'Renovação rejeitada'));
 if(scenario.throwAt) {
  assert.equal(diagnostics[0][1].stage,scenario.stage);
  assert.equal(diagnostics[0][1].httpStatus,null);
  assert.equal(diagnostics[0][1].category,'transport');
  assert.ok(!JSON.stringify(diagnostics).includes('private endpoint secret'));
 }
 const diagnosticText=JSON.stringify(diagnostics);
 for(const secret of ['new-token','ticket','device','player-session','http://']) assert.ok(!diagnosticText.includes(secret),'diagnostics must not disclose credentials or private endpoints');
 cleanup();
 assert.ok(calls[0].options.signal.aborted,'cleanup must cancel in-flight renewal');
 await tick();assert.equal(calls.length,scenario.calls,'stale renewal must not continue');
}
assert.ok(!source.includes('/api/sources'));
assert.ok(!source.includes('/stream?magnet='));
assert.ok(source.includes('preparationRef.current?.abort()'));
console.log('Actual Player renewal effect: token/device/player binding, clear Core/Service errors, abort cleanup, visibility renewal hook and provider-free boundary passed.');
