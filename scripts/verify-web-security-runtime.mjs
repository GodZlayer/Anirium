import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';

const origin = 'http://127.0.0.1:3197';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3197'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
let errors = '';
server.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-2000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Isolated Next server exited ${server.exitCode}: ${errors}`);
    try { await fetch(`${origin}/api/service/session/validate`); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(ready, 'isolated server did not start');
  const checks = [
    [{ 'Content-Type': 'application/json', Origin: 'https://hostile.example' }, 403],
    [{ 'Content-Type': 'application/json', Origin: 'null' }, 403],
    [{ 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, 403],
    [{ 'Content-Type': 'text/plain' }, 415],
  ];
  for (const [headers, expected] of checks) {
    const response = await fetch(`${origin}/api/user`, { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  const overflow = await fetch(`${origin}/api/user`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(65536) }) });
  assert.equal(overflow.status, 413);
  // Native HTTP writes guarantee Transfer-Encoding: chunked with no declared
  // length. Exercise the deployed route reader, not only the proxy header gate.
  const chunked = await new Promise((resolve, reject) => {
    const req = request(`${origin}/api/user`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked',
    } }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write('{"data":"');
    for (let i = 0; i < 17; i++) req.write('x'.repeat(4096));
    req.end('"}');
  });
  assert.equal(chunked.status, 413, 'chunked input must be bounded by the route');
  assert.equal(JSON.parse(chunked.body).error, 'request_body_too_large');
  for (const body of ['{', 'null', '[]']) {
    const invalid = await fetch(`${origin}/api/user`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(invalid.status, 400, 'invalid input must fail before database access');
  }
  const auth = await fetch(`${origin}/api/service/session`);
  assert.equal(auth.status, 401, 'normal unauthenticated route still owns auth');
  assert.equal(auth.headers.get('x-frame-options'), 'DENY');
  assert.equal(auth.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(auth.headers.get('x-powered-by'), null);
  assert.match(auth.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  console.log('Built Next runtime verified: rejected hostile mutations, oversized declared/chunked bodies and invalid JSON objects; unauthenticated access remains denied; security headers delivered. No production data mutated.');
} finally {
  server.kill();
  await new Promise(resolve => { if (server.exitCode !== null) return resolve(); server.once('exit', resolve); });
}
