import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('src/addons/player-pro/subtitleDelivery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const responses = [202, 202, 200];
const requests = [], waits = [];
const exports = {};
vm.runInNewContext(code, { exports, Number, Promise,
  fetch: async (url, options) => { requests.push({ url, signal: options.signal }); return { status: responses.shift(), headers: { get: () => '2' } }; },
  setTimeout: (fn, delay) => { waits.push(delay); queueMicrotask(fn); return 1; }, clearTimeout: () => {},
});
const controller = new AbortController();
assert.equal((await exports.fetchPreparedSubtitle('owned-subtitle', controller.signal)).status, 200);
assert.equal(requests.length, 3);
assert.ok(requests.every(r => r.url === 'owned-subtitle' && r.signal === controller.signal));
assert.deepEqual(waits, [2000, 2000]);
responses.push(504);
assert.equal((await exports.fetchPreparedSubtitle('owned-subtitle', controller.signal)).status, 504);
assert.equal(requests.length, 4, 'Terminal errors must not silently restart extraction');
const cancelled = new AbortController();
cancelled.abort(new Error('retired'));
await assert.rejects(exports.fetchPreparedSubtitle('owned-subtitle', cancelled.signal), /retired/);
assert.equal(requests.length, 4);

let cleared = false;
const pendingExports = {};
vm.runInNewContext(code, { exports: pendingExports, Number, Promise,
  fetch: async () => ({ status: 202, headers: { get: () => 'invalid' } }),
  setTimeout: () => 42, clearTimeout: id => { cleared = id === 42; },
});
const pendingController = new AbortController();
const pending = pendingExports.fetchPreparedSubtitle('owned-subtitle', pendingController.signal);
await Promise.resolve();
pendingController.abort(new Error('track changed'));
await assert.rejects(pending, /track changed/);
assert.equal(cleared, true);
console.log('Subtitle delivery: repeated pending responses, complete response, terminal failure and cancellation verified.');
