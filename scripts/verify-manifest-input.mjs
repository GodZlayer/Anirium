import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  modules.set(path, exports);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code, {exports, URL, require(name) {
    if (name === '../apiInput') return load('src/lib/apiInput.ts');
    if (name === 'node:crypto' || name === 'crypto') return crypto;
    throw new Error('Unexpected import');
  }});
  return exports;
}
const {parseCommunityManifest: parse, parseRemoteManifestConfig} = load('src/lib/extensions/manifestInput.ts');
assert.equal(typeof parseRemoteManifestConfig, 'function');
const remote = parseRemoteManifestConfig('http://127.0.0.1:4001/manifest');
assert.match(remote.id, /^remote-[a-f0-9]{32}$/);
assert.equal(remote.kind, 'remote-manifest');
assert.equal(remote.manifestUrl, 'http://127.0.0.1:4001/manifest');
assert.throws(() => parseRemoteManifestConfig('https://user:pass@example.invalid/m'), e => e.status === 400 && e.reason === 'invalid_manifest_url');
const base = {id:'community.fixture',name:'Fixture'};
for (const patch of [{id:{}},{name:42},{name:' '},{id:'player-pro'},{id:'PLAYER-PRO'},
  {id:'a'.repeat(101)},{version:null},{author:false},{description:'a'.repeat(4001)},
  {capabilities:'magnet.search'},{capabilities:[{}]},{capabilities:Array(33).fill('magnet.search')},
  {permissions:['script\0']},{manifestUrl:'javascript:alert(1)'},{manifestUrl:'file:///secret'},
  {manifestUrl:'https://user:pass@example.invalid/manifest'},{manifestUrl:'https://example.invalid/#f'},
  {manifestUrl:'https://example.invalid/\\evil'},{serviceUrl:{}},{entrypoint:{}}]) {
  assert.throws(() => parse({...base,...patch}), e => e.status === 400 && e.reason === 'invalid_addon_manifest');
}
for (const value of [null, [], 'manifest', 42]) assert.throws(() => parse(value));
const nyaa = parse(JSON.parse(fs.readFileSync('community-plugins/nyaa-p2p-addon/manifest.json','utf8')));
assert.equal(nyaa.capabilities[0], 'magnet.search');
const valid = parse({...base,type:'official-plus',origin:'official',enabled:false,extra:'discarded',
  capabilities:['magnet.search','magnet.search','subtitles.search'],manifestUrl:'http://127.0.0.1:4001/manifest'});
assert.equal(valid.type,'community');assert.equal(valid.origin,'community');assert.equal(valid.enabled,true);
assert.equal(valid.capabilities.length,2);assert.equal(valid.extra,undefined);
console.log('Actual manifest validator: bounded typed metadata, reserved player identity, safe URL syntax and Nyaa protocol compatibility passed. Outbound authorization remains Service-owned.');
