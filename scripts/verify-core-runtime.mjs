import { spawn } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3198'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Core exited: ${server.exitCode}`);
    try {
      await fetch('http://127.0.0.1:3198/api/service/session/validate');
      ready = true;
      break;
    } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, 'Core did not start');
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
    const response = await fetch('http://127.0.0.1:3198/api/addons/community-fixture/search?title=Fixture', {
      method, ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
    });
    assert.equal(response.status, 410, 'Core must not proxy addon endpoints');
    if (method !== 'HEAD') assert.equal((await response.json()).error, 'addon_gateway_removed');
  }
  const invalidAddonRequest = await fetch('http://127.0.0.1:3198/api/addons/community-fixture/search', { method: 'POST' });
  assert.equal(invalidAddonRequest.status, 415, 'Invalid mutation content type must remain rejected before the removed gateway');
  for (const route of ['/api/service/session', '/api/service/session/validate']) {
    const response = await fetch(`http://127.0.0.1:3198${route}`);
    assert.equal(response.status, 401, `${route} must reject unauthenticated access`);
  }
  for (const action of ['switch_level', 'switch_user', 'google_login', 'activate_anirium_plus']) {
    const response = await fetch('http://127.0.0.1:3198/api/user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, level: 3, userId: 'fixture', googleId: 'fixture', email: 'fixture@example.invalid', plan: '10y' }),
    });
    if (action === 'activate_anirium_plus' && process.env.ANIRIUM_OPEN_BETA === 'true') {
      assert.equal(response.status, 401, 'Open beta activation still requires authentication');
      assert.equal((await response.json()).error, 'Não autenticado');
    } else {
      assert.equal(response.status, 403, `${action} must not create production identity/entitlements`);
      assert.equal((await response.json()).reason, 'trusted_account_flow_required');
    }
  }
  const profiles = await fetch('http://127.0.0.1:3198/api/user?action=list_profiles');
  assert.equal(profiles.status, 403, 'Production must not expose the demo profile directory');
  assert.equal((await profiles.json()).reason, 'trusted_account_flow_required');
  for (const method of ['GET', 'POST']) {
    const response = await fetch('http://127.0.0.1:3198/api/admin/users', {
      method, ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_tier', targetUserId: 'fixture', newTier: 3 }) } : {}),
    });
    assert.equal(response.status, 403, 'Admin must not use a global session for anonymous requests');
  }
  const toggle = await fetch('http://127.0.0.1:3198/api/sources?action=toggle_addon&addonId=fixture&enable=true');
  assert.equal(toggle.status, 405, 'GET must never mutate account addons');
  assert.equal(toggle.headers.get('allow'), 'POST');
  assert.equal((await toggle.json()).replacement, '/api/user');
  for (const action of ['install_manifest', 'uninstall_addon', 'register_manifest']) {
    const mutation = await fetch('http://127.0.0.1:3198/api/sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, addonId: 'fixture', manifest: { id: 'fixture', name: 'Fixture' } }),
    });
    assert.equal(mutation.status, 401, `${action} must require a request-scoped account session`);
  }
  const response = await fetch('http://127.0.0.1:3198/api/download/service');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /anirium-service\.exe/);
  const downloaded = Buffer.from(await response.arrayBuffer());
  const expected = fs.readFileSync('public/downloads/anirium-service.exe');
  const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
  assert.equal(hash(downloaded), hash(expected), 'HTTP download does not match packaged Service');
  assert.equal(response.headers.get('x-anirium-artifact-sha256'), hash(downloaded), 'Download fingerprint must identify the actual delivered bytes');
  assert.ok(response.headers.get('cache-control')?.split(',').map(value => value.trim().toLowerCase()).includes('no-store'), 'Mutable legacy download must not be cached');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(fs.existsSync('community-plugins/nyaa-p2p-addon'), false);
  console.log(`Core runtime passed: unauthorized sessions rejected, provider excluded, download SHA256=${hash(downloaded)}`);
} finally {
  server.kill();
}
