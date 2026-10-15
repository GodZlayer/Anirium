const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

// Static isolation guard, not a licensing opinion or runtime security audit.
function verifyBoundaries({ manifest, pkg, server }) {
assert.ok(manifest.capabilities.includes('magnet.search'));
assert.ok(!manifest.capabilities.some(value => value.startsWith('ui.player.') || value === 'playback.client'));
assert.equal(Object.keys(pkg.dependencies || {}).length, 0, 'Provider must remain independently runnable with Node built-ins');
for (const match of server.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
  assert.ok(['http', 'node:http', './manifest.json'].includes(match[1]), `Provider imports unexpected module: ${match[1]}`);
}
assert.ok(!/next\/|@\/|anirium-service|src\/lib|torrent-stream|webtorrent|child_process/.test(server), 'Provider must not import Core or process media');
assert.ok(!/createReadStream|\.pipe\(res\)|execFile|spawn\(/.test(server), 'Provider must return metadata, not media streams');
assert.ok(!/validateTorrentTitle|matchesRequestedTitle|TRACKERS|\bresolution\b|\bcodec\b/.test(server), 'Provider must not identify episodes or infer media properties');
assert.ok(!/\.sort\(|new Map\(|new Set\(/.test(server), 'Provider must preserve upstream results; ranking/deduplication belongs to consumers');
assert.ok(!/\bimport\s*(?:\(|[{'"*])|\beval\s*\(|\bFunction\s*\(/.test(server), 'Provider must use auditable static CommonJS imports');
}

module.exports = { verifyBoundaries };
if (require.main === module) {
const root = __dirname;
verifyBoundaries({
  manifest: JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')),
  pkg: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
  server: fs.readFileSync(path.join(root, 'server.js'), 'utf8'),
});
console.log('Independent provider boundaries verified (static guard, not legal certification).');
}
