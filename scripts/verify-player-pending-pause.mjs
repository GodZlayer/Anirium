import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const toggle = source.match(/const togglePlay = \(\) => \{[\s\S]*?\n  \};/)?.[0];
assert.ok(toggle, 'Test the actual Player handler');
for (const playing of [true, false]) {
  let state;
  let decoderCalls = 0;
  const target = {position: 552, playing};
  const context = {
    serviceManifest: null, customMediaSrc: '',
    videoRef: {current: {paused: true, currentTime: 24,
      play: () => {decoderCalls++; return Promise.resolve();}, pause: () => decoderCalls++}},
    windowTargetRef: {current: target}, setIsPlaying: value => {state = value;},
  };
  vm.runInNewContext(`${toggle}\ntogglePlay();`, context);
  assert.equal(target.playing, !playing);
  assert.equal(state, !playing);
  assert.equal(decoderCalls, 0, 'Pending pause/resume must not restart old media');
  assert.equal(context.videoRef.current.currentTime, 24);
  assert.equal(target.position, 552, 'Pending seek position must survive pause');
}
let pauses = 0;
vm.runInNewContext(`${toggle}\ntogglePlay();`, {
  serviceManifest: null, customMediaSrc: '',
  videoRef: {current: {paused: false, pause: () => pauses++}},
  windowTargetRef: {current: null}, setIsPlaying: () => {},
});
assert.equal(pauses, 1, 'Normal playback still pauses the actual decoder');
assert.ok(source.includes('playbackIntentRef.current : windowTargetRef.current?.playing ?? false'));
assert.ok(source.includes('if (target.playing && !serviceManifest?.continuousBuffer) video.play().catch(() => {});\n\t\t\telse video.pause();'));
for (const playing of [true,false]) {
  let calls=0,state;
  const intent={current:playing};
  vm.runInNewContext(`${toggle}\ntogglePlay();`,{serviceManifest:{continuousBuffer:true},customMediaSrc:'',playbackIntentRef:intent,windowTargetRef:{current:null},videoRef:{current:{play:()=>{throw Error('Buffer gate bypassed')},pause:()=>calls++}},setIsPlaying:value=>state=value});
  assert.equal(intent.current,!playing);assert.equal(state,!playing);assert.equal(calls,playing?1:0);
}
assert.ok(source.includes('aria-label={isPlaying ? "Pausar" : "Reproduzir"}'));
console.log('Actual Player handler: pending pause/resume preserves target without replay; normal pause and restore intent verified.');
