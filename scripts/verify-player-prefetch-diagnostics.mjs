import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const effect = source.match(/useEffect\(\(\) => \{\s*if \(serviceManifest\?\.continuousBuffer \|\| !serviceWindow \|\| serviceWindow\.endOfEpisode[\s\S]*?\}, \[serviceWindow, playbackTicket, customMediaSrc, isServiceOnline, serviceEndpoint, serviceManifest\?\.continuousBuffer\]\);/)?.[0];
assert.ok(effect, 'Test actual prefetch effect');
for (const status of [202, 409]) {
  const logs = [];
  let requested;
  vm.runInNewContext(effect, {
    useEffect: callback => callback(),
    serviceWindow: {start:480,deliveredDuration:24,quality:'800p',endOfEpisode:false},
    playbackTicket:'private-fixture-ticket', customMediaSrc:'', isServiceOnline:true,
    serviceManifest:{continuousBuffer:false},
    serviceEndpoint:'http://127.0.0.1:4004', AbortController, URLSearchParams,
    performance: {now: () => 1},
    fetch: async url => {requested = url; return {status,ok:status===202};},
    console: {info: (...args) => logs.push(args)},
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(new URL(requested).searchParams.get('mode'), 'prefetch');
  assert.equal(new URL(requested).searchParams.get('position'), '504');
  const data = JSON.parse(logs[0][1]);
  assert.equal(data.status, status);
  assert.equal(data.accepted, status === 202);
  assert.equal(JSON.stringify(logs).includes('private-fixture-ticket'), false);
  assert.equal(JSON.stringify(logs).includes('127.0.0.1'), false);
  assert.equal('ready' in data, false, 'HTTP acceptance must not invent media readiness');
}
let scheduled = false;
vm.runInNewContext(effect, {
  useEffect: callback => callback(), serviceManifest:{continuousBuffer:true},
  serviceWindow:{}, playbackTicket:'fixture', customMediaSrc:'', isServiceOnline:true, serviceEndpoint:'fixture',
  fetch: () => {scheduled=true;},
});
assert.equal(scheduled,false,'Continuous session must let the Service own prefetch');
console.log('Actual prefetch effect: immediate successor, accepted/rejected diagnostics, no readiness claim or credential leakage.');
