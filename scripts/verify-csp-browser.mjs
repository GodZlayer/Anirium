import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import puppeteer from 'puppeteer-core';

const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false, output = '', browser;
server.stdout.on('data', chunk => { output = (output + chunk).slice(-2000); if (output.includes('Ready')) ready = true; });
server.stderr.on('data', chunk => { output = (output + chunk).slice(-2000); });
try {
  for (let attempt = 0; !ready && attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next exited ${server.exitCode}: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'owned isolated Next server must be ready');
  const snapshots = [];
  for (let i = 0; i < 2; i++) {
    const response = await fetch(origin, { headers: { 'x-nonce': 'attacker-selected', 'content-security-policy': "script-src 'unsafe-inline'" } });
    const policy = response.headers.get('content-security-policy');
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    assert.match(nonce, /^[A-Za-z0-9+/]{32}$/);
    assert.match(policy, /'strict-dynamic'/);
    const scripts = policy.split(';').find(part => part.trim().startsWith('script-src '));
    assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval/);
    assert.doesNotMatch(policy, /upgrade-insecure-requests/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const html = await response.text();
    const tags = [...html.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
    assert.ok(tags.length > 3, 'framework and Google scripts must render');
    for (const tag of tags) assert.ok(tag.includes(`nonce="${nonce}"`), 'every initial script needs the response nonce');
    snapshots.push({ html, nonce, policy });
  }
  assert.notEqual(snapshots[0].nonce, snapshots[1].nonce, 'nonce cannot be reused across documents');
  browser = await puppeteer.launch({ executablePath: process.env.ANIRIUM_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.__cspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
  });
  const errors = [], apiCalls = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  let inject = false;
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname.startsWith('/api/')) {
      apiCalls.push(url.pathname);
      // Deterministic guest/catalogue fixtures: no account or production DB access.
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname === '/api/user' ? { success: true, user: null } : { seasonal: [], popular: [], upcoming: [], all: [], universes: [], data: [] }) });
    }
    if (url.origin === origin && url.pathname === '/csp-probe.test.js') {
      return request.respond({ status: 200, contentType: 'text/javascript', body: 'window.__cspExternal = true;' });
    }
    if (inject && request.isNavigationRequest() && url.origin === origin && url.pathname === '/') {
      const { html, nonce, policy } = snapshots[1];
      const payload = `<button id="csp-attack" onclick="window.__cspEvent=true">probe</button>`
        + `<script>window.__cspInline=true</script><script src="/csp-probe.test.js"></script>`
        + `<script nonce="${nonce}">window.__cspTrusted=true;try{eval('window.__cspEval=true')}catch(e){window.__cspEvalBlocked=true}</script>`;
      return request.respond({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': policy, 'cache-control': 'no-store' }, body: html.replace('</body>', payload + '</body>') });
    }
    return request.continue();
  });
  await page.goto(origin, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => typeof window.google?.accounts?.id?.initialize === 'function', { timeout: 20000 });
  assert.ok(apiCalls.includes('/api/user') && apiCalls.includes('/api/catalog'), 'React effects must hydrate and request fixtures');
  assert.deepEqual(await page.evaluate(() => window.__cspViolations), [], 'normal initial document must have no CSP violations');
  assert.deepEqual(errors, [], 'normal hydration must have no browser errors');
  for (const path of ['/service', '/privacidade', '/csp-missing-page']) {
    const response = await page.goto(origin + path, { waitUntil: 'networkidle2' });
    assert.equal(response.status(), path === '/csp-missing-page' ? 404 : 200);
    const policy = response.headers()['content-security-policy'];
    assert.match(policy, /'nonce-[^']+'/);
    assert.deepEqual(await page.evaluate(() => window.__cspViolations), [], `${path} must render with its own CSP`);
  }
  await page.goBack({ waitUntil: 'networkidle2' });
  await page.goForward({ waitUntil: 'networkidle2' });
  assert.deepEqual(await page.evaluate(() => window.__cspViolations), [], 'history restoration must preserve a valid document policy');
  inject = true;
  await page.goto(origin, { waitUntil: 'networkidle2' });
  await page.click('#csp-attack');
  await page.waitForFunction(() => window.__cspViolations.some(event => event.directive === 'script-src-attr'));
  const observed = await page.evaluate(() => ({ trusted: window.__cspTrusted, inline: !!window.__cspInline, external: !!window.__cspExternal, event: !!window.__cspEvent, eval: !!window.__cspEval, evalBlocked: window.__cspEvalBlocked, violations: window.__cspViolations }));
  assert.equal(observed.trusted, true, 'matching nonce script must execute');
  for (const key of ['inline', 'external', 'event', 'eval']) assert.equal(observed[key], false, `${key} injection executed`);
  assert.equal(observed.evalBlocked, true);
  assert.ok(observed.violations.some(event => event.directive === 'script-src-attr'));
  assert.ok(observed.violations.some(event => event.blocked === `${origin}/csp-probe.test.js`));
  console.log('Real Edge + built Next: unique server-selected nonces, framework hydration and live Google client passed; parser-injected inline/external scripts, inline handlers and eval blocked. Guest APIs are fixtures; OAuth, Player media and visual acceptance remain separate gates.');
} finally {
  if (browser) await browser.close();
  server.kill();
  await new Promise(resolve => { if (server.exitCode !== null) return resolve(); server.once('exit', resolve); });
}
