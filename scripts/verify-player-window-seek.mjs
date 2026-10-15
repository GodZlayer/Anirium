import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/addons/player-pro/PlayerProComponent.tsx', import.meta.url), 'utf8');
const seek = source.match(/const seekTo = \(position: number\) => \{[\s\S]*?\n\t\};/)?.[0];
const relative = source.match(/const seekRelative = \(sec: number\) => \{[\s\S]*?\n  \};/)?.[0];
assert.ok(seek && relative, 'Test actual seek handlers, not a duplicate implementation');
for (const local of [false, true]) {
  const video = { currentTime: 2, paused: false };
  const calls = [];
  const context = {
    videoRef: { current: video },
    episodeOffsetRef: { current: local ? 0 : 120 },
    readEpisodeTime: () => video.currentTime + (local ? 0 : 120),
    windowTargetRef: { current: null },
    customMediaSrc: local ? 'blob:local-file' : '',
    duration: 1440,
    selectedQuality: '720p',
	serviceManifest: { windowOnDemand: true },
    requestServiceWindow: (...args) => calls.push(args),
  };
  vm.runInNewContext(ts.transpileModule(`${seek}\n${relative}\nseekRelative(10);`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  if (local) {
    assert.equal(video.currentTime, 12);
    assert.equal(calls.length, 0);
  } else {
    assert.deepEqual(calls[0], [132, '720p', true]);
    assert.equal(video.currentTime, 2, 'Service seeks do not pretend missing media is already loaded');
  }
}
for (const available of [true, false]) {
  const video = { currentTime: 0, seekable: { length: available ? 1 : 0, start: () => 0, end: () => 20 } };
  let error = '';
  const context = {
    videoRef: { current: video }, customMediaSrc: '', serviceManifest: {},
    setPlaybackError: value => { error = value; },
    requestServiceWindow: () => { throw new Error('Older Service must not receive unsupported requests'); },
  };
  vm.runInNewContext(ts.transpileModule(`${seek}\nseekTo(10);`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  assert.equal(video.currentTime, available ? 10 : 0);
  assert.equal(Boolean(error), !available);
}
assert.ok(source.includes('const mediaTime = readEpisodeTime();'), 'Subtitle and progress clock must use episode coordinates');
assert.ok(source.includes('serviceWindow.start + serviceWindow.deliveredDuration'), 'Continuation must follow delivered media, not requested size');
assert.ok(source.includes('!serviceWindow.endOfEpisode'), 'Do not request windows past episode end');
assert.ok(source.includes('mode: "prefetch"'), 'The actual Player must request its immediate successor before window end');
assert.ok(source.includes('setWindowAttachmentRevision(revision => revision + 1)'), 'Ready repeated-window requests must reattach after seek or decoder failure');
assert.ok(source.includes('&attachmentRevision=${windowAttachmentRevision}'), 'Attachment revision must change the actual playlist source effect dependency');
const timeUpdate = source.match(/const handleTimeUpdate = \(\) => \{[\s\S]*?\n  \};/)?.[0];
assert.ok(timeUpdate, 'Verify the actual episode-clock handler');
let reportedTime;
const clockContext = {
  handleProgress() {},
  videoRef: { current: { currentTime: 8.083333, duration: 8.083333 } },
  episodeOffsetRef: { current: 8 },
  readEpisodeTime: () => 16.083333,
  windowTargetRef: { current: null }, windowRequestRef: { current: null },
  serviceWindow: { start: 8, deliveredDuration: 8 }, customMediaSrc: '',
  serviceManifest: { episodeDuration: 24 }, duration: 24,
  setCurrentTime: value => { reportedTime = value; },
  parsedCues: [], setCurrentCueText: () => {}, lastSavedTimeRef: { current: 16 },
};
vm.runInNewContext(ts.transpileModule(`${timeUpdate}\nhandleTimeUpdate();`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, clockContext);
assert.equal(reportedTime, 16, 'Browser decoder tail must not advance beyond delivered episode media');
console.log('Actual Player seek handlers verified for Service and independent local media. Not browser playback acceptance.');
