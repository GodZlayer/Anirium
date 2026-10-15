import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const helper = ts.transpileModule(fs.readFileSync('src/addons/player-pro/episodeClock.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(helper, { exports, Date, Number });
const clock = exports.episodeTimeFromProgramDate;
const epoch = Date.UTC(2000, 0, 1);
assert.equal(clock(null), null);
assert.equal(clock(new Date('invalid')), null);
assert.equal(clock(new Date()), null);
assert.equal(clock(new Date(epoch - 1)), null);
assert.equal(clock(new Date(epoch + 86400001)), null);
assert.equal(clock(new Date(epoch + 188023)), 188.023);

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const body = source.match(/const readEpisodeTime = \(\) => \{([\s\S]*?)\n  \};/)[1];
const context = { completedPositionRef: { current: null }, videoRef: { current: { currentTime: 1033.639625 } }, serviceManifest: { continuousBuffer: true }, customMediaSrc: '', hlsRef: { current: { playingDate: new Date(epoch + 1219000) } }, episodeOffsetRef: { current: 188 }, episodeTimeFromProgramDate: clock };
const read = vm.runInNewContext(`() => {${body}}`, context);
assert.equal(read(), 1219);
assert.equal(context.episodeOffsetRef.current, 1219 - 1033.639625);
// A later discontinuity changes decoder time without moving episode time.
context.videoRef.current.currentTime = 1036;
context.hlsRef.current.playingDate = new Date(epoch + 1220458);
assert.equal(read(), 1220.458);
context.hlsRef.current.playingDate = null;
assert.equal(read(), 1220.458);
context.customMediaSrc = 'local-file';
context.episodeOffsetRef.current = 0;
assert.equal(read(), 1036);
console.log('Actual Player clock: episode anchors, decoder drift, missing anchors and independent media verified.');

context.completedPositionRef.current = 1225.18;
context.videoRef.current.currentTime = 0;
assert.equal(read(), 1225.18);
context.completedPositionRef.current = null;
context.episodeOffsetRef.current = -65;
assert.equal(read(), 0);

const endedBody = source.match(/onEnded=\{\(\) => \{([\s\S]*?)\n\s*\}\}/)[1];
const terminal = {
  serviceWindow: { endOfEpisode: false }, serviceManifest: { continuousBuffer: true },
  currentTime: 1224.272, readEpisodeTime: () => 1225.18,
  completedPositionRef: { current: null }, playbackIntentRef: { current: true },
  setCurrentTime: value => { terminal.position = value; },
  setPlaybackEnded: value => { terminal.ended = value; },
  setIsPlaying: value => { terminal.playing = value; },
  requestServiceWindow: () => { throw new Error('Completed continuous episode requested another window'); },
};
vm.runInNewContext(`() => {${endedBody}}`, terminal)();
assert.equal(terminal.position, 1225.18);
assert.equal(terminal.completedPositionRef.current, 1225.18);
assert.equal(terminal.ended, true);
assert.equal(terminal.playing, false);
assert.equal(terminal.playbackIntentRef.current, false);
console.log('Actual ended handler: terminal position retained and playback intent closed.');
const toggleBody = source.match(/const togglePlay = \(\) => \{([\s\S]*?)\n  \};/)[1];
let replayRequest;
vm.runInNewContext(`() => {${toggleBody}}`, {
  serviceManifest: { continuousBuffer: true }, customMediaSrc: '',
  completedPositionRef: { current: 1225.18 }, videoRef: { current: null },
  selectedQuality: '800p', requestServiceWindow: (...args) => { replayRequest = args; },
})();
assert.deepEqual(replayRequest, [0, '800p', true]);
console.log('Actual replay handler requests fresh media even without a mounted decoder.');

