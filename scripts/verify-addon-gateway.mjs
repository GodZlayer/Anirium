import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/api/addons/[...slug]/route.ts', import.meta.url), 'utf8');
const exports = {};
let networkCalls = 0;
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  exports, Response,
  fetch: () => { networkCalls++; throw new Error('Core addon gateway attempted network access'); },
  require: () => { throw new Error('Removed gateway must not import an addon registry or provider'); },
});
for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
  const response = await exports[method](new Request('https://core.example/api/addons/community-fixture/search?title=Fixture', {
    method, headers: { cookie: 'private-session', authorization: 'Bearer private-token' },
  }));
  assert.equal(response.status, 410);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.error, 'addon_gateway_removed');
  assert.equal(JSON.stringify(data).includes('private-'), false);
}
assert.equal(networkCalls, 0);
console.log('Actual Core addon gateway rejects all methods without network calls, registry access or credential forwarding.');
