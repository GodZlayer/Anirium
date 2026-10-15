import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const deliverySource = readFileSync('src/addons/player-pro/subtitleDelivery.ts', 'utf8');
const delivery = ts.transpileModule(deliverySource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace('export ', '');
const section = source.slice(source.indexOf('// Sincronização e Parse de Legendas'));
const effect = section.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[subtitleSrc, subtitleRetry, playbackTicket\]\);/)?.[0];
assert.ok(effect);
for (const scenario of ['hung-fetch', 'hung-body', 'cleanup']) {
  let cleanup, signal, releaseBody;
  const states = [], warnings = [], infos = [], timers = new Map();
  vm.runInNewContext(ts.transpileModule(delivery + "\n" + effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    useEffect: fn => { cleanup = fn(); }, subtitleSrc: 'http://127.0.0.1:4004/subtitle?trackId=PRIVATE_TRACK&playbackTicket=PRIVATE_CREDENTIAL&start=0', subtitleRetry: 0, playbackTicket: 'fixture',
    loadedSubtitleTrackRef: { current: '' }, AbortController, URL, performance: { now: () => 0 },
    setSubtitleLoadStatus: value => states.push(value), setParsedCues() {}, setCurrentCueText() {}, setSubtitleCoverageEnd() {}, setSubtitleManualRequired() {},
    console: { info: (...args) => infos.push(args), warn: (...args) => warnings.push(args) },
    setTimeout: (fn, delay) => { timers.set(delay, fn); return delay; }, clearTimeout: id => timers.delete(id),
    fetch: async (_, options) => {
      signal = options.signal;
      if (scenario !== 'hung-body') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted'))));
      return { ok: true, status: 200, headers: { get: () => null }, text: () => new Promise(resolve => { releaseBody = resolve; }) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  const deadline = timers.get(930000);
  assert.equal(typeof deadline, 'function');
  if (scenario === 'cleanup') {
    cleanup(); deadline();
    assert.deepEqual(states, ['loading']); assert.equal(warnings.length, 0);
  } else {
    deadline();
    assert.equal(signal.aborted, true); assert.equal(states.at(-1), 'timeout');
    if (releaseBody) releaseBody('WEBVTT\n\n00:00.000 --> 00:01.000\nlate text');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(states.at(-1), 'timeout', 'late response must not overwrite timeout');
    assert.equal(warnings.length, 1);
    cleanup();
  }
  assert.equal(timers.size, 0, 'unmount clears all timers');
  assert.ok(!/PRIVATE_TRACK|PRIVATE_CREDENTIAL/.test(JSON.stringify([...infos,...warnings])), 'Subtitle diagnostics must omit track identity and credentials');
}
console.log('Actual subtitle effect bounds fetch and body, preserves timeout against late replies and distinguishes cleanup abort.');
