import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const effect = source.match(/useEffect\(\(\) => \{\s*(if \(serviceWindow \|\| !serviceManifest\?\.qualityOnDemand[\s\S]*?)\n\s*const controller = new AbortController\(\);/);
assert.ok(effect, 'Initial demand effect missing');
for (const test of [
  { onDemand: true, window: null, target: null, expected: [0, '800p', true] },
  { onDemand: true, window: null, target: { position: 40, playing: false }, expected: [40, '800p', false] },
  { onDemand: false, window: null, target: null, expected: null },
  { onDemand: true, window: {}, target: null, expected: null },
]) {
  let called = null;
  const context = vm.createContext({ serviceWindow: test.window,
    serviceManifest: { qualityOnDemand: true, windowOnDemand: test.onDemand },
    selectedQuality: '800p', playbackTicket: 'fixture', isServiceOnline: true,
    customMediaSrc: '', windowTargetRef: { current: test.target },
    requestServiceWindow: (...args) => { called = args; },
  });
  vm.runInContext(`(() => { ${effect[1]} })()`, context);
  assert.deepEqual(called, test.expected);
}
console.log('Actual initial demand effect requests first window, preserves target and skips legacy/already-attached cases.');
