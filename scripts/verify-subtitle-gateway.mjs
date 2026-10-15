import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/app/api/subtitles/route.ts', 'utf8');
const exports = {};
let networkCalls = 0;
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  exports, Response,
  fetch: () => { networkCalls++; throw new Error('Core must not proxy subtitle media'); },
  require: () => { throw new Error('Subtitle tombstone must not load a media runtime'); },
});
for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
  const response = await exports[method](new Request('https://core.example/api/subtitles?playbackTicket=private-ticket&trackId=fixture', {
    method, headers: { cookie: 'private-cookie', authorization: 'Bearer private-token' },
  }));
  assert.equal(response.status, 410);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const body = await response.json();
  assert.equal(body.error, 'subtitle_gateway_removed');
  assert.equal(JSON.stringify(body).includes('private-'), false);
}
assert.equal(networkCalls, 0);
console.log('Core subtitle gateway removed: all methods reject without media transport or credential forwarding.');
