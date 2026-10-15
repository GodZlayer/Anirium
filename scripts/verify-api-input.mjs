import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync('src/lib/apiInput.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { readApiJson } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const request = body => new Request('http://fixture.invalid/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
assert.deepEqual(await readApiJson(request('{"action":"fixture"}')), { action: 'fixture' });
for (const [body, reason] of [['null', 'json_object_required'], ['[]', 'json_object_required'], ['"value"', 'json_object_required'], ['{broken', 'invalid_json']]) {
  await assert.rejects(readApiJson(request(body)), error => error.status === 400 && error.reason === reason);
}
await assert.rejects(readApiJson(new Request('http://fixture.invalid', { method: 'POST', body: '{}' })), error => error.status === 415);
await assert.rejects(readApiJson(request(new Uint8Array([0xff]))), error => error.status === 400 && error.reason === 'invalid_json');
let cancelled = false;
const stream = new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode('{"payload":"'));
  controller.enqueue(new Uint8Array(65536));
}, cancel() { cancelled = true; } });
const chunked = new Request('http://fixture.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' });
assert.equal(chunked.headers.get('content-length'), null);
await assert.rejects(readApiJson(chunked), error => error.status === 413);
assert.equal(cancelled, true, 'oversized stream cancelled before consuming more bytes');
for (const key of ['__proto__','constructor','prototype']) {
  await assert.rejects(readApiJson(request(JSON.stringify({nested: JSON.parse(`{"${key}": {"polluted": true}}`)}))), error => error.status === 400 && error.reason === 'reserved_json_key');
}
assert.equal({}.polluted, undefined);
await assert.rejects(readApiJson(request('{"number":1e400}')), error => error.reason === 'invalid_json_number');
await assert.rejects(readApiJson(request(JSON.stringify({list:Array(1025).fill(0)}))), error => error.reason === 'json_structure_too_complex');
await assert.rejects(readApiJson(request(JSON.stringify(Object.fromEntries(Array.from({length:257},(_,i)=>['k'+i,0]))))), error => error.reason === 'json_structure_too_complex');
let nested = 0;
for(let i=0;i<22;i++) nested={nested};
await assert.rejects(readApiJson(request(JSON.stringify({nested}))), error => error.reason === 'json_structure_too_complex');
await assert.rejects(readApiJson(request(JSON.stringify({groups:Array.from({length:8},()=>Array(600).fill(0))}))), error => error.reason === 'json_structure_too_complex');
assert.deepEqual(await readApiJson(request(JSON.stringify({preferences:{autoNextEpisode:true},items:[1,null,'a']}))),{preferences:{autoNextEpisode:true},items:[1,null,'a']});
const aborted = new AbortController();
let abortCancelled = false;
const abortedRequest = new Request('http://fixture.invalid', {method:'POST',headers:{'Content-Type':'application/json'},signal:aborted.signal,duplex:'half',body:new ReadableStream({cancel(){abortCancelled=true;}})});
const pendingAbort = readApiJson(abortedRequest);
aborted.abort();
await assert.rejects(pendingAbort, error => error.status === 400 && error.reason === 'request_aborted');
assert.equal(abortCancelled,true);
let timeoutCancelled = false;
let drip;
let receivedChunks = 0;
const stalled = new Request('http://fixture.invalid', {method:'POST',headers:{'Content-Type':'application/json'},duplex:'half',body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));drip=setInterval(()=>{receivedChunks++;controller.enqueue(new TextEncoder().encode(' '));},1000);},cancel(){timeoutCancelled=true;clearInterval(drip);}})});
try { await assert.rejects(readApiJson(stalled), error => error.status === 408 && error.reason === 'request_body_timeout'); }
finally { clearInterval(drip); }
assert.ok(receivedChunks > 1,'test sends chunks continuously without completing the body');
assert.equal(timeoutCancelled,true,'absolute deadline cancels body instead of resetting after chunks');
console.log('Actual API reader verified: byte limit without Content-Length, stream cancellation, malformed UTF-8/JSON and non-object input rejected.');
