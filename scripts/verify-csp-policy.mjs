import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync('src/lib/contentSecurityPolicy.ts', 'utf8'));
const { contentSecurityPolicy } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const nonce = Buffer.alloc(24, 7).toString('base64');
const production = contentSecurityPolicy(nonce);
const scripts = production.split(';').find(value => value.trim().startsWith('script-src '));
assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval|blob:|data:/);
assert.match(production, /script-src-attr 'none'/);
assert.match(production, /base-uri 'none'/);
assert.match(production, /worker-src 'self' blob:/);
assert.doesNotMatch(production, /upgrade-insecure-requests|ws:\/\//);
assert.match(contentSecurityPolicy(nonce, true), /'unsafe-eval'/);
for (const unsafe of ['', "nonce'; script-src 'unsafe-inline'", 'client-selected']) {
  assert.throws(() => contentSecurityPolicy(unsafe));
}
// Regression: media-src must accept direct loopback media on ANY port
// (CSP3 wildcard port grammar, e.g. http://127.0.0.1:3053/fixture.mp4),
// while connect-src keeps the fixed Service port 4004 only.
const mediaSrc = production.split(';').find(value => value.trim().startsWith('media-src '));
const connectSrc = production.split(';').find(value => value.trim().startsWith('connect-src '));
const sourceMatches = (source, url) => {
  const target = new URL(url);
  if (source.endsWith(':*')) {
    return `${target.protocol}//${target.hostname}` === source.slice(0, -2);
  }
  if (!/^https?:\/\//.test(source)) return false;
  return new URL(source).origin === target.origin;
};
const directiveAllows = (directive, url) =>
  directive.trim().split(/\s+/).slice(1).some(source => sourceMatches(source, url));
for (const mediaUrl of [
  'http://127.0.0.1:3053/fixture.mp4',
  'http://localhost:9/media.mp4',
  'http://[::1]:7/media.mp4',
  'http://127.0.0.1:4004/media.mp4',
]) {
  assert.ok(directiveAllows(mediaSrc, mediaUrl), `media-src must allow ${mediaUrl}`);
}
for (const connectUrl of ['http://127.0.0.1:3053/fixture.mp4', 'http://localhost:9/x', 'http://[::1]:7/x']) {
  assert.ok(!directiveAllows(connectSrc, connectUrl), `connect-src must block ${connectUrl}`);
}
assert.ok(directiveAllows(connectSrc, 'http://127.0.0.1:4004/ping'), 'connect-src must keep Service port 4004');
assert.ok(!directiveAllows(mediaSrc, 'http://example.test/authorized.mp4'), 'no global http: media grant');
assert.ok(!production.split(';').some(d => d.trim().split(/\s+/).slice(1).includes('http:')), 'no global http: scheme source');
console.log('CSP policy: production scripts forbid inline/eval, attribute handlers and base tags; development-only eval; malformed nonces rejected; media-src allows arbitrary loopback media ports while connect-src stays fixed to 4004.');
