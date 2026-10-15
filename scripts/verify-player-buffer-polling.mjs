import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const fixture={coverage:{videoAhead:48,audioAhead:48,subtitleAhead:40,audioRequired:true,subtitleRequired:true},buffer:{targetSeconds:30,commonAhead:40,ready:true},playlistUrl:'/hls/window-1-1-video/continuous-master.m3u8'};
for (const enabled of [false,true]) {
  let effect,dependencies,calls=0;
  const writes=[];
  const timers=new Map();let nextTimer=1;
  const context={exports:{},AbortController,URLSearchParams,
    setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
    fetch:async()=>{calls++;return{ok:true,json:async()=>({bufferState:fixture})}},
  };
  vm.runInNewContext(compile('src/addons/player-pro/playbackBuffer.ts'),context);
  const contract=context.exports;
  context.exports={};
  context.require=name=>name==='react'?{useRef:value=>({current:value}),useState:value=>[value,next=>writes.push(next)],useEffect:(fn,deps)=>{effect=fn;dependencies=deps}}:contract;
  vm.runInNewContext(compile('src/addons/player-pro/usePlaybackBuffer.ts'),context);
  context.exports.usePlaybackBuffer({enabled,endpoint:'http://localhost:4004',ticket:'fixture',timeline:'window-1',position:12,audio:'jpn',subtitle:'subtitle-1'});
  const cleanup=effect();
  for(let i=0;i<10;i++) await Promise.resolve();
  assert.equal(calls,enabled?1:0);
  assert.ok(!dependencies.includes(12),'Playback clock must not restart lifecycle each tick');
  if(enabled) {
    assert.ok(writes.includes(fixture));
    assert.equal([...timers.values()].filter(t=>t.ms===1000).length,1,'Only one next poll allowed');
    cleanup();assert.equal(timers.size,0,'Unmount leaves no deadline or poll timer');
  }
}
console.log('Actual Player buffer hook: capability gating, serialized polling, clock stability and unmount timer cleanup passed.');
