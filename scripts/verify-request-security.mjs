import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(readFileSync('src/lib/requestSecurity.ts', 'utf8'));
const { checkApiRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const make = (headers, method = 'POST', url = 'https://anirium.com.br/api/user') => new Request(url, { method, headers });
const json = { 'content-type': 'application/json' };
assert.equal(checkApiRequest(make({ ...json, origin: 'https://anirium.com.br' }), true), null);
assert.equal(checkApiRequest(make(json), true), null, 'native JSON request still requires route auth');
for (const origin of ['null', 'https://attacker.example', 'https://anirium.com.br.attacker.example']) {
  assert.equal(checkApiRequest(make({ ...json, origin }), true).status, 403);
}
assert.equal(checkApiRequest(make({ ...json, 'sec-fetch-site': 'cross-site' }), true).status, 403);
assert.equal(checkApiRequest(make({ 'content-type': 'text/plain' }), true).status, 415);
assert.equal(checkApiRequest(make({ ...json, 'content-length': '65537' }), true).status, 413);
assert.equal(checkApiRequest(make({}, 'DELETE'), true), null);
assert.equal(checkApiRequest(make({ ...json, origin: 'http://localhost:3000' }, 'POST', 'http://localhost:3000/api/user'), false), null);
assert.equal(checkApiRequest(make({ ...json, origin: 'https://anirium.com.br' }), true, 'https://other.example').status, 403);
console.log('API provenance checks passed: hostile origins, forms, metadata and declared body size rejected. Native JSON and same-origin paths preserved.');
