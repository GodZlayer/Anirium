import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const body = source.match(/const seekRelative = \(sec: number\) => \{([\s\S]*?)\n  \};/)[1];
const target = { current: null };
const video = { current: { currentTime: 112 } };
const positions = [];
const context = { videoRef: video, episodeOffsetRef: { current: 0 }, windowTargetRef: target, duration: 1220,
  readEpisodeTime() { return video.current.currentTime + context.episodeOffsetRef.current; },
  seekTo(position) { positions.push(position); target.current = { position, playing: false }; video.current.currentTime = 0; } };
const seek = vm.runInNewContext(`sec => {${body}}`, context);
for (let i = 0; i < 6; i++) seek(10);
assert.deepEqual(positions, [122, 132, 142, 152, 162, 172]);
assert.equal(target.current.playing, false);
seek(-10);
assert.equal(target.current.position, 162);
target.current.position = 1215;
seek(10);
assert.equal(target.current.position, 1219.95);
target.current.position = 5;
seek(-10);
assert.equal(target.current.position, 0);
target.current = null;
context.episodeOffsetRef.current = 200;
video.current.currentTime = 3;
seek(10);
assert.equal(target.current.position, 213);
console.log('Pending seek: repeated advances, backwards seek, episode bounds and offset verified.');
