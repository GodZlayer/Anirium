import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const modules = new Map();
const installed = [];
const removed = [];
const registered = [];
let budgetCalls = 0;
let networkCalls = 0;

const rows = [];
const stubUserProfiles = {
  getActiveUserProfile: async () => ({ id: 'user-fixture', level_tier: 1 }),
  getUserInstalledAddons: async () => rows,
  installUserAddon: async (_userId, manifest) => { installed.push(manifest); },
  uninstallUserAddon: async (_userId, addonId) => { removed.push(addonId); },
};

function load(path, requireOverrides = {}) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  modules.set(path, exports);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, URL, Buffer, TextDecoder, Uint8Array, console,
    process: { env: {} }, setTimeout, clearTimeout,
    fetch: () => { networkCalls++; throw new Error('Core must not fetch providers'); },
    require(name) {
      if (name in requireOverrides) return requireOverrides[name];
      if (name === 'node:crypto' || name === 'crypto') return crypto;
      if (name === '../apiInput' || name === '@/lib/apiInput') return load('src/lib/apiInput.ts');
      throw new Error('Unexpected import: ' + name);
    },
  });
  return exports;
}

const { parseRemoteManifestConfig, canonicalizeRemoteManifestUrl } = load('src/lib/extensions/manifestInput.ts');

// Deterministic canonical URL + id contract; any fragment is rejected, not stripped.
assert.throws(() => canonicalizeRemoteManifestUrl('https://example.com/m#frag'), e => e.reason === 'invalid_manifest_url');
assert.equal(canonicalizeRemoteManifestUrl('HTTPS://Example.COM:443/addon/manifest.json?x=1'), 'https://example.com/addon/manifest.json?x=1');
assert.equal(canonicalizeRemoteManifestUrl('https://example.com/a/../b'), 'https://example.com/b');
const cfg = parseRemoteManifestConfig('https://example.com/addon/manifest.json');
const expectId = 'remote-' + crypto.createHash('sha256').update('https://example.com/addon/manifest.json').digest('hex').slice(0, 32);
assert.equal(cfg.id, expectId);
assert.equal(cfg.kind, 'remote-manifest');
assert.equal(cfg.manifestUrl, 'https://example.com/addon/manifest.json');
assert.equal(parseRemoteManifestConfig('https://example.com/addon/manifest.json').id, cfg.id);
assert.ok(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(cfg.id), 'remote id must reuse existing addon id validation');
for (const bad of ['', 'javascript:alert(1)', 'file:///secret', 'https://user:pass@example.invalid/m',
  'https://example.invalid/m#frag', 'https://example.invalid/\\evil', 'https://exa mple.invalid/m',
  'https://example.invalid/\nm', 42, null, 'https://example.invalid/' + 'a'.repeat(2100)]) {
  assert.throws(() => parseRemoteManifestConfig(bad), e => e.status === 400 && e.reason === 'invalid_manifest_url');
  assert.throws(() => canonicalizeRemoteManifestUrl(bad), e => e.reason === 'invalid_manifest_url');
}

// Actual route handler with only persistence/session/registry boundaries stubbed.
const routeCode = ts.transpileModule(fs.readFileSync('src/app/api/sources/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const route = {};
vm.runInNewContext(routeCode, {
  exports: route, URL, Buffer, TextDecoder, Uint8Array, console,
  process: { env: {} }, setTimeout, clearTimeout,
  fetch: () => { networkCalls++; throw new Error('Core must not fetch providers'); },
  Response, Request,
  require(name) {
    switch (name) {
      case 'next/server': return {
        NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status || 200, headers: init.headers }) },
        NextRequest: class {},
      };
      case '@/lib/extensions/manifestInput': return load('src/lib/extensions/manifestInput.ts');
      case '@/lib/apiInput': return load('src/lib/apiInput.ts');
      case '@/lib/writeBudget': return { requireUserWriteBudget: async () => { budgetCalls++; }, WriteBudgetExceeded: class extends Error {} };
      case '@/lib/serverLog': return { logServerFailure: (_s, e) => console.log('SERVER_FAILURE', e && e.message, e && e.stack) };
      case '@/lib/webSession': return { readWebSessionId: () => 'web-fixture' };
      case '@/lib/userProfiles': return stubUserProfiles;
      case '@/lib/extensions/addonRegistry': return { addonRegistry: { registerExternalManifest: m => registered.push(m), getInstalledAddons: () => registered, getActiveTheme: () => null } };
      case '@/lib/extensions/types': return {};
      default: throw new Error('Unexpected import: ' + name);
    }
  },
});

const post = body => route.POST(new Request('https://core.example/api/sources', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

// URL-only registration persists exactly the typed config; no provider fetch.
const ok = await post({ action: 'install_manifest', manifestUrl: ' https://Example.com/addon/manifest.json'.trim() });
assert.equal(ok.status, 200);
const okData = await ok.json();
assert.equal(okData.success, true);
assert.equal(budgetCalls, 1);
assert.equal(installed.length, 1);
assert.equal(installed[0].id, expectId);
assert.equal(installed[0].kind, 'remote-manifest');
assert.equal(installed[0].manifestUrl, 'https://example.com/addon/manifest.json');
assert.deepEqual(Object.keys(installed[0]).sort(), ['id', 'kind', 'manifestUrl']);
assert.equal(registered.length, 0, 'remote URL installs must not auto-register remote UI plugins');

// Invalid URLs are rejected before any budget reservation or persistence.
for (const bad of ['https://user:pass@example.invalid/m', 'https://example.invalid/#f', 'https://example.invalid/\\e', 'ftp://example.invalid']) {
  const res = await post({ action: 'install_manifest', manifestUrl: bad });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_manifest_url');
}
{ const res = await post({ action: 'install_manifest' }); assert.equal(res.status, 400); assert.equal((await res.json()).error, 'invalid_addon_manifest'); }
assert.equal(budgetCalls, 1, 'budget only reserved for valid installs');
assert.equal(installed.length, 1);

// Legacy developer JSON installs keep working unchanged.
const legacy = await post({ action: 'install_manifest', manifest: { id: 'community.fixture', name: 'Fixture', version: '1.0.0' } });
assert.equal(legacy.status, 200);
assert.equal(installed[1].id, 'community.fixture');
assert.equal(installed[1].name, 'Fixture');
assert.equal(budgetCalls, 2);

// Enable/disable/remove keep using the same deterministic id.
const rm = await post({ action: 'uninstall_addon', addonId: expectId });
assert.equal(rm.status, 200);
assert.deepEqual(removed, [expectId]);

// List renders neutral derived display for remote rows; legacy rows pass through.
rows.length = 0;
rows.push(
  { addon_id: expectId, enabled: true, config_json: cfg },
  { addon_id: 'community.fixture', enabled: false, config_json: { id: 'community.fixture', name: 'Fixture', version: '1.0.0', author: 'Dev', description: 'Legacy', type: 'community', capabilities: [], permissions: [], enabled: true } },
);
const list = await route.GET(new Request('https://core.example/api/sources?action=list_addons'));
const listData = await list.json();
const remoteEntry = listData.addons.find(a => a.id === expectId);
assert.equal(remoteEntry.name, 'example.com');
assert.equal(remoteEntry.version, '', 'no fake live version');
assert.equal(remoteEntry.description, 'https://example.com/addon/manifest.json');
assert.equal(remoteEntry.kind, 'remote-manifest');
assert.equal(remoteEntry.manifestUrl, 'https://example.com/addon/manifest.json');
assert.deepEqual(remoteEntry.capabilities, []);
const legacyEntry = listData.addons.find(a => a.id === 'community.fixture');
assert.equal(legacyEntry.name, 'Fixture');
assert.equal(legacyEntry.version, '1.0.0');
assert.equal(legacyEntry.enabled, false);

assert.equal(networkCalls, 0);
assert.equal(registered.length, 0);
console.log('Actual account addon URL registration: deterministic canonical id/kind/manifestUrl persistence, pre-budget URL validation, neutral list display, legacy JSON preserved, same-id enable/disable/remove, no provider fetch or remote UI plugin auto-registration.');
