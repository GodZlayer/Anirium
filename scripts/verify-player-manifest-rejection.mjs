import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const match = source.match(/const loadManifest = async \(\) => \{([\s\S]*?)\n    \};\n    loadManifest\(\);/);
assert.ok(match);
const code = ts.transpileModule(`(async()=>{${match[1]}})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const statusContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/addons/player-pro/playbackStatus.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, statusContext);
for (const scenario of [
  { http: 503, reason: 'core_unavailable', expected: 'core_unavailable' },
  { http: 401, reason: 'token_expired', expected: 'token_expired' },
  { http: 403, reason: 'private-secret-reason', expected: 'unauthorized' },
]) {
  const states = {}, logs = [];
  await vm.runInNewContext(code, {
    mounted: true, loading: false, controller: new AbortController(),
    serviceEndpoint: 'http://private-endpoint', serviceToken: 'private-token', deviceId: 'private-device',
    playbackFailureStatus: statusContext.exports.playbackFailureStatus,
    fetch: async () => ({ ok: false, status: scenario.http, json: async () => ({ reason: scenario.reason }) }),
    setServiceManifest: value => { states.manifest = value; },
    setServiceStatus: value => { states.status = value; },
    setPlaybackTicket: value => { states.ticket = value; },
    setServiceToken: value => { states.token = value; },
    console: { warn: (...args) => logs.push(args) },
  })();
  assert.equal(states.status, scenario.expected);
  assert.equal(states.manifest, null);
  assert.equal(states.ticket, '');
  assert.equal(states.token, '');
  assert.equal(logs[0][1].httpStatus, scenario.http);
  assert.equal(logs[0][1].status, scenario.expected);
  assert.ok(!JSON.stringify(logs).includes('private-'));
}
console.log('PASS: manifest denials clear playback credentials and record only normalized diagnostics');
