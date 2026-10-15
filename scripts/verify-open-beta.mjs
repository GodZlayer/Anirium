import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ts from 'typescript';
import { createRequire } from 'node:module';
const { NextRequest } = createRequire(import.meta.url)('next/server');

const source = fs.readFileSync('src/app/api/user/route.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const env = { NODE_ENV: 'production', ANIRIUM_OPEN_BETA: 'true' };
let profile = null;
let writes = 0;
const exports = {};
const registry = { getActiveTheme: () => null };
const inputExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/apiInput.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: inputExports, TextDecoder, Uint8Array });
const sessionExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/webSession.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: sessionExports, process: { env }, require(name) { assert.equal(name, 'node:crypto'); return crypto; } });
const context = vm.createContext({ exports, process: { env }, crypto, console,
  require(name) {
    if (name === 'next/server') return { NextResponse: { json(body, options = {}) {
      return { body, status: options.status || 200, headers: new Headers(options.headers), cookies: { set() {} } };
    } } };
    if (name === '@/lib/userProfiles') return { getActiveUserProfile: async () => profile };
    if (name === '@/lib/postgres') return { query: async (sql, values) => {
      assert.match(sql, /WHERE id = \$1 AND level_tier = 1/);
      assert.deepEqual(Array.from(values), [profile.id]);
      writes++;
      profile = { ...profile, level_tier: 2, subscriptionPlan: 'open_beta', subscriptionExpiresAt: null };
    } };
    if (name === '@/lib/extensions/addonRegistry') return { addonRegistry: registry };
    if (name === '@/lib/serviceSessions') return {};
    if (name === '@/lib/apiInput') return inputExports;
    if (name === '@/lib/webSession') return sessionExports;
    throw new Error(`Unexpected dependency ${name}`);
  }, Headers });
vm.runInContext(compiled, context);
const request = (session, extras = {}) => new NextRequest('https://fixture.invalid/api/user', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: `${sessionExports.WEB_SESSION_COOKIE}=${session}` } : {}) },
  body: JSON.stringify({ action: 'activate_anirium_plus', ...extras }),
});
assert.equal((await exports.POST(request(null))).status, 401);
assert.equal((await exports.POST(request('unknown'))).status, 401);
profile = { id: 'authenticated-member', level_tier: 1 };
const verifiedCookie = crypto.randomBytes(32).toString('hex');
const activated = await exports.POST(request(verifiedCookie, { userId: 'someone-else', level: 3, plan: '10y' }));
assert.equal(activated.status, 200);
assert.equal(activated.body.user.id, 'authenticated-member');
assert.equal(activated.body.user.level_tier, 2);
assert.equal(activated.body.user.subscriptionPlan, 'open_beta');
assert.equal(activated.body.user.subscriptionExpiresAt, null);
assert.match(activated.headers.get('Cache-Control'), /no-store/);
await exports.POST(request(verifiedCookie));
assert.equal(writes, 1, 'Repeat activation must not rewrite entitlement');
profile = { id: 'admin', level_tier: 3, subscriptionPlan: 'admin_unlimited' };
await exports.POST(request(verifiedCookie));
assert.equal(writes, 1, 'Beta activation must not downgrade administrators');
env.ANIRIUM_OPEN_BETA = 'false';
assert.equal((await exports.POST(request(verifiedCookie))).status, 403);
assert.equal(writes, 1);
console.log('Open beta activation: authenticated account only, server-selected entitlement, idempotence, admin preservation and disabled-beta rejection passed.');
