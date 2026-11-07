const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Provider build requires Node.js 24 LTS');
const baseURL = 'http://127.0.0.1:3197';
const server = spawn(process.execPath, ['server.js'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, PORT: '3197', PROVIDER_PUBLIC_URL: '' },
});

(async () => {
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (server.exitCode !== null) throw new Error(`Provider exited: ${server.exitCode}`);
      try {
        const response = await fetch(`${baseURL}/health`);
        if (response.status === 200) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Provider did not start');
    const response = await fetch(`${baseURL}/manifest`);
    assert.equal(response.status, 200);
    const manifest = await response.json();
    assert.deepEqual(manifest, require('./manifest.json'));
    assert.equal(manifest.id, 'community.nyaa.p2p');
    assert.ok(manifest.capabilities.includes('magnet.search'));
    assert.equal(manifest.endpoints.search, '/search');
    const health = await (await fetch(`${baseURL}/health`)).json();
    assert.equal(health.service, manifest.name);
    assert.equal(health.version, manifest.version);
    assert.equal(health.type, 'community');
    assert.equal('activeEnginesCount' in health, false);
    assert.equal((await fetch(`${baseURL}/search`)).status, 400);
    assert.equal(manifest.version, '3.0.0');
    for (const query of ['q=', 'q=A&q=B', 'title=Example&ep=1', 'q=A&season=2']) {
      assert.equal((await fetch(`${baseURL}/search?${query}`)).status, 400);
    }
    assert.equal((await fetch(`${baseURL}/stream`)).status, 404);
    console.log('Provider runtime verified: manifest, invalid search and absence of streaming endpoint.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
