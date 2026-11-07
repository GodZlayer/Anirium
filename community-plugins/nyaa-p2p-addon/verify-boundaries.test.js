const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyBoundaries } = require('./verify-boundaries');

const fixture = () => ({
  manifest: { capabilities: ['magnet.search'] },
  pkg: {},
  server: "const http = require('node:http'); const manifest = require('./manifest.json');",
});

test('independent metadata provider is accepted', () => {
  assert.doesNotThrow(() => verifyBoundaries(fixture()));
});

test('provider cannot declare player responsibilities', () => {
  for (const capability of ['ui.player.render', 'ui.player.overlay', 'playback.client']) {
    const input = fixture();
    input.manifest.capabilities.push(capability);
    assert.throws(() => verifyBoundaries(input));
  }
  const input = fixture();
  input.manifest.capabilities = [];
  assert.throws(() => verifyBoundaries(input));
});

test('Core, torrent and media dependencies fail the build guard', () => {
  for (const server of [
    "require ( 'next/server' )", "require('webtorrent')", "require('node:fs')",
    "require('child_process')", "require('@/lib/catalog')",
    "import('node:fs')", 'eval("payload")', 'new Function("payload")',
    'file.createReadStream()', 'stream.pipe(res)', 'spawn("ffmpeg")',
  ]) {
    assert.throws(() => verifyBoundaries({ ...fixture(), server }), server);
  }
  const input = fixture();
  input.pkg.dependencies = { next: '1.0.0' };
  assert.throws(() => verifyBoundaries(input));
});
