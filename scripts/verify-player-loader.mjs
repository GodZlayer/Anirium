import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/extensions/pluginLoader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let finishImport;
const pending = new Promise(resolve => { finishImport = resolve; });
const registered = new Set();
let enabled = [];
const registry = {
  isPlayerPluginRegistered: id => registered.has(id),
  registerPlayerPlugin: plugin => registered.add(plugin.manifest.id),
  unregisterPlayerPlugin: id => registered.delete(id),
  enableAddon() {},
  syncUserAddons: ids => { enabled = [...ids]; },
};
const exports = {};
vm.runInNewContext(compiled, { exports, console, require: path => {
  if (path.endsWith('addonRegistry')) return { addonRegistry: registry };
  if (path.endsWith('manifest.json')) return { default: { id: 'player-pro' } };
  if (path.endsWith('PlayerProComponent')) return pending;
  throw new Error(`Unexpected dependency: ${path}`);
} });
const stale = exports.loadAccountPlugins(['player-pro'], 2);
await exports.loadAccountPlugins([], 2);
finishImport({ default: () => null });
await stale;
assert.equal(registered.has('player-pro'), false);
assert.deepEqual(enabled, []);
await exports.loadAccountPlugins(['player-pro'], 1);
assert.equal(registered.has('player-pro'), false);
await exports.loadAccountPlugins(['player-pro'], 2);
assert.equal(registered.has('player-pro'), true);
await exports.loadAccountPlugins([], 0);
assert.equal(registered.has('player-pro'), false);
console.log('Player loader verified: disabled preference, Plus eligibility, stale import and logout.');

const registrySource = fs.readFileSync(new URL('../src/lib/extensions/addonRegistry.ts', import.meta.url), 'utf8');
const registryCode = ts.transpileModule(registrySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const registryExports = {};
vm.runInNewContext(registryCode, { exports: registryExports, console });
const host = registryExports.addonRegistry;
const plugin = id => ({ manifest: { id, name: id, capabilities: ['ui.player.render'], enabled: true }, component: () => null });
host.registerPlayerPlugin(plugin('player-pro'));
host.registerPlayerPlugin(plugin('community.fixture'));
host.syncUserAddons(['player-pro', 'community.fixture']);
assert.equal(host.getActivePlayerPlugin().manifest.id, 'community.fixture');
host.syncUserAddons(['player-pro']);
assert.equal(host.getActivePlayerPlugin().manifest.id, 'player-pro');
host.syncUserAddons([]);
assert.equal(host.getActivePlayerPlugin(), null);
assert.equal(host.isAddonEnabled('community.fixture'), false);
console.log('Neutral player host verified: community selection, official fallback and no mandatory player.');
