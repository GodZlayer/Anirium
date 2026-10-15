import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/addons/player-pro/PlayerProComponent.tsx', import.meta.url), 'utf8');
const callback = source.match(/const requestServiceWindow = useCallback\(([\s\S]*?), \[playbackTicket, isServiceOnline, customMediaSrc, serviceEndpoint\]\);/)?.[1];
assert.ok(callback, 'Exercise the actual window request callback');
const code = ts.transpileModule(`const request = ${callback}; request(132, '800p', true);`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
let timer;
let error = '';
const pending = [];
const ref = { current: null };
const context = {
  playbackTicket: 'private-test-ticket', isServiceOnline: true, customMediaSrc: '', serviceEndpoint: 'http://127.0.0.1:4004',
  windowRequestRef: ref, windowTargetRef: { current: null }, videoRef: { current: { pause() {} } },
  playbackIntentRef: {current:false}, setIsPlaying() {},
  setWindowPending: value => pending.push(value), setPlaybackError: value => { error = value; },
  setServiceWindow() { throw new Error('A timed-out request must not attach media'); }, setWindowAttachmentRevision() {},
  performance: { now: () => 0 }, AbortController, URLSearchParams, DOMException, Date,
  console: { info() {}, warn() {} },
  setTimeout(fn, duration) { assert.equal(duration, 120000); timer = fn; return 1; }, clearTimeout() {},
  fetch: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })),
};
const result = vm.runInNewContext(code, context);
assert.equal(typeof timer, 'function', 'Timeout exists before the first HTTP response');
timer();
await result;
assert.match(error, /Tempo esgotado/);
assert.deepEqual(pending, [true, false]);
assert.equal(ref.current.signal.aborted, true);
assert.ok(source.includes('Preparando próximo trecho no Service…'));
console.log('Actual Player first-request timeout and pending cleanup verified; not live browser acceptance.');
