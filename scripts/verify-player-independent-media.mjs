import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const inventory = source.slice(source.indexOf('const availableQualities ='), source.indexOf('// Efeito para sincronizar as seleções'));
for (const customMediaSrc of ['', 'blob:local-fixture', 'https://example.test/authorized.mp4']) {
  const result = vm.runInNewContext(ts.transpileModule(`${inventory}\n({ availableQualities, availableAudios, existingAudios, availableSubtitles });`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    customMediaSrc, useMemo: fn => fn(), serviceWindow: null,
    serviceManifest: { qualities: ['800p'], audios: ['zho'], audioTracks: [{ language: 'zho' }], subtitleTracks: [{ id: 'por-track', language: 'por' }] },
    existingSubtitleOptions: tracks => tracks,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), customMediaSrc ? {
    availableQualities: [], availableAudios: [], existingAudios: [], availableSubtitles: ['Desativado'],
  } : {
    availableQualities: ['800p'], availableAudios: ['zho'], existingAudios: ['zho'], availableSubtitles: ['Desativado', 'por'],
  });
}
const effect = source.match(/useEffect\(\(\) => \{\n    if \(customMediaSrc\) \{[\s\S]*?\}, \[fetchSources, isServiceOnline, customMediaSrc\]\);/)?.[0];
assert.ok(effect);
for (const customMediaSrc of ['', 'blob:local-fixture']) {
  let preparations = 0, aborted = false;
  const states = {};
  vm.runInNewContext(ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    useEffect: fn => fn(), customMediaSrc, isServiceOnline: true, fetchSources: () => { preparations++; },
    preparationRef: { current: { abort: () => { aborted = true; } } },
    setPlaybackTicket: value => { states.ticket = value; }, setServiceToken: value => { states.token = value; },
    setServiceManifest: value => { states.manifest = value; }, setIsLoadingSources: value => { states.loading = value; },
  });
  assert.equal(preparations, customMediaSrc ? 0 : 1);
  if (customMediaSrc) {
    assert.equal(aborted, true);
    assert.deepEqual(states, { ticket: '', token: '', manifest: null, loading: false });
  }
}
// Native independent MP4 must not be forced through CORS: crossOrigin is conditional on the render path.
const videoTagStart = source.search(/<video\s*\n\s*ref=\{videoRef\}/);
const videoEnd = source.indexOf('</video>', videoTagStart) + '</video>'.length;
const videoJsx = source.slice(videoTagStart, videoEnd);
assert.ok(videoTagStart > 0 && videoJsx.includes('crossOrigin'));
for (const customMediaSrc of ['', 'https://fixture3053.test/withoutCORS.mp4', 'blob:local-fixture']) {
  const props = vm.runInNewContext(
    ts.transpileModule(videoJsx, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText,
    {
      React: { createElement: (type, elementProps) => elementProps },
      videoRef: { current: null }, customMediaSrc, subtitleSize: 'md',
      handleTimeUpdate: () => {}, handleProgress: () => {},
      serviceManifest: null, serviceWindow: null,
    },
  );
  assert.equal(props.crossOrigin, customMediaSrc ? undefined : 'anonymous');
}

// Volume/mute must be applied to a freshly mounted <video>, not only on later UI events.
const mountEffect = source.match(/\/\/ Volume e mudo precisam valer[\s\S]*?\}, \[volume, isMuted, streamSrc, customMediaSrc, isServiceOnline\]\);/)?.[0];
assert.ok(mountEffect);
const runMountEffect = (context) => vm.runInNewContext(
  ts.transpileModule(mountEffect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
  { useEffect: fn => fn(), streamSrc: 'x', customMediaSrc: '', isServiceOnline: true, ...context },
);
for (const [volume, isMuted, expectedVolume, expectedMuted] of [
  [0, true, 0, true],
  [40, false, 0.4, false],
  [100, false, 1, false],
]) {
  const video = {};
  runMountEffect({ videoRef: { current: video }, volume, isMuted });
  assert.equal(video.volume, expectedVolume);
  assert.equal(video.muted, expectedMuted);
}
assert.doesNotThrow(() => runMountEffect({ videoRef: { current: null }, volume: 0, isMuted: true }));

console.log('Independent file/link inventory is isolated; pending Service preparation aborted and credentials cleared; crossOrigin is conditional and volume/mute apply on video mount.');
