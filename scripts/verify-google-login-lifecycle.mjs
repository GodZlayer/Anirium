import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('src/app/page.tsx');
const effect = page.slice(page.indexOf('// Google One Tap')).match(/useEffect\(\(\) => \{[\s\S]*?\}, \[user, isLoading, loginWithGoogle\]\);/)?.[0];
assert.ok(effect, 'Test real One Tap effect');
const code = ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
let initialized = 0, prompted = 0;
const context = {
  useEffect: fn => fn(), user: null, isLoading: true, googlePromptedRef: { current: false }, loginWithGoogle() {},
  process: { env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'test-client' } },
  window: { google: { accounts: { id: { initialize() { initialized++; }, prompt() { prompted++; } } } } },
};
vm.runInNewContext(code, context);
assert.equal(initialized, 0, 'Never prompt while account session is loading');
context.isLoading = false; context.user = { id: 'existing' };
vm.runInNewContext(code, context);
assert.equal(initialized, 0, 'Signed-in accounts must not open One Tap');
context.user = null;
vm.runInNewContext(code, context); vm.runInNewContext(code, context);
assert.equal(initialized, 1); assert.equal(prompted, 1);
for (const path of ['src/components/Navbar.tsx', 'src/components/LevelSwitcher.tsx']) {
  const source = read(path);
  assert.ok(source.includes('redirectGoogleLogin'));
  assert.ok(!source.includes('accounts.id.initialize'), 'UI buttons must not reset the shared Google SDK');
}
const redirect = ts.transpileModule(read('src/lib/googleLoginClient.ts').replace('export function', 'function') + '\nredirectGoogleLogin();', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const location = { origin: 'https://anirium.com.br', href: '' };
vm.runInNewContext(redirect, { process: context.process, window: { location }, URLSearchParams, Date, console });
const url = new URL(location.href);
assert.equal(url.origin, 'https://accounts.google.com');
assert.equal(url.searchParams.get('redirect_uri'), location.origin);
assert.equal(url.searchParams.get('response_type'), 'token id_token');
console.log('Real One Tap effect: loading/login gates and one initialization. Both UI buttons use existing official OAuth redirect. Not browser login acceptance.');
