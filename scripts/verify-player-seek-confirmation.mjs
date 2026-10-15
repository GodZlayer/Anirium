import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx','utf8');
const metadata=source.match(/const restorePosition = \(\) => \{([\s\S]*?)\n    \};/)?.[1];
assert.ok(metadata && !metadata.includes('windowTargetRef.current = null'),'Metadata arrival alone must not confirm a seek');
const update=source.match(/const handleTimeUpdate = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
assert.ok(update);
for (const [time,seeking,pending,confirmed] of [[0,false,false,false],[2,true,false,false],[2,false,true,false],[2,false,false,true]]) {
  const target={current:{position:138,playing:true}};
  vm.runInNewContext(`(() => {${update}})()`,{
    videoRef:{current:{currentTime:time,seeking}},episodeOffsetRef:{current:136},windowTargetRef:target,
    readEpisodeTime:()=>time+136,
    windowRequestRef:{current:pending?{}:null},serviceWindow:{},customMediaSrc:'',
    serviceManifest:{continuousBuffer:true,episodeDuration:1220},duration:1220,
    setCurrentTime:()=>{},handleProgress:()=>{},lastSavedTimeRef:{current:0},onProgress:undefined,
  });
  assert.equal(target.current===null,confirmed,'Only the completed decoder seek may release the command target');
}
console.log('Seek target survives decoder reset, seeking and pending requests; confirmed episode position releases it.');
