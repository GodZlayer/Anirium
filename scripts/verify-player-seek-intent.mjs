import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx','utf8');
const handler=source.match(/const seekTo = \(position: number\) => \{([\s\S]*?)\n\t\};/)?.[1];
assert.ok(handler,'Test actual seek handler');
for (const playing of [true,false]) {
  let requested;
  vm.runInNewContext(`(position => {${handler}})(120)`,{
    videoRef:{current:{paused:true}},customMediaSrc:'',serviceManifest:{windowOnDemand:true,continuousBuffer:true},
    selectedQuality:'800p',windowTargetRef:{current:null},playbackIntentRef:{current:playing},
    requestServiceWindow:(...args)=>requested=args,
  });
  assert.deepEqual(Array.from(requested),[120,'800p',playing],'Automatic buffer pause must not change seek intent');
}
console.log('Seek preserves continuous playback intent while the buffer pauses the decoder.');
