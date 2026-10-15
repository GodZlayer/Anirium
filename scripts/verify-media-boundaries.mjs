import fs from 'node:fs';
import path from 'node:path';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : /\.(tsx?|json)$/.test(name) ? [name] : [];
  });
}
const forbidden = /NyaaP2PProvider|AniriumSourceProvider|\b(?:nyaa|1337x|thepiratebay|tpb)\b|aggregateSources|torrent-stream|webtorrent|magnetUri|magnet:\?|(?:udp|https?|wss?):\/\/[^\s"']*tracker[^\s"']*/i;
// Ensure the guard covers architecture regressions, not just today's spelling.
for (const example of ['AniriumSourceProvider', 'https://nyaa.tgdevs.pp.ua/manifest', 'https://1337x.example/search', 'https://thepiratebay.example', 'https://tracker.example/announce', 'udp://tracker.example:80/announce']) {
  if (!forbidden.test(example)) throw new Error(`Boundary guard does not detect fixture: ${example}`);
}
const errors = [];
const playerManifest = JSON.parse(fs.readFileSync('src/addons/player-pro/manifest.json', 'utf8'));
const distributedPlayerManifest = JSON.parse(fs.readFileSync('community-plugins/player-pro/manifest.json', 'utf8'));
if (JSON.stringify(playerManifest) !== JSON.stringify(distributedPlayerManifest)) errors.push('Player manifest copies diverge');
for (const capability of ['ui.player.render', 'ui.player.overlay', 'playback.client']) {
  if (!playerManifest.capabilities.includes(capability)) errors.push(`Missing Player capability: ${capability}`);
}
if (playerManifest.capabilities.some(value => ['provider.server', 'playback.source.provide', 'playback.engine.orchestrate'].includes(value))) errors.push('Player Pro must be a client, not a provider or media engine');
for (const file of files('src')) {
  if (forbidden.test(fs.readFileSync(file, 'utf8'))) errors.push(file);
}
if (forbidden.test(fs.readFileSync('next.config.ts', 'utf8'))) errors.push('next.config.ts');
for (const file of files('src/addons/player-pro').filter(file => file.endsWith('.tsx'))) {
  if (/\/api\/sources|\/stream\?/.test(fs.readFileSync(file, 'utf8'))) errors.push(file);
}
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const p2pDependencies = ['torrent-stream', 'webtorrent', 'bittorrent-protocol', 'bittorrent-dht', 'bittorrent-tracker', 'magnet-uri', 'parse-torrent', 'ut_pex'];
for (const dependency of p2pDependencies) {
  if (pkg.dependencies?.[dependency] || pkg.devDependencies?.[dependency]) errors.push(dependency);
}
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
for (const packagePath of Object.keys(lock.packages || {})) {
  if (p2pDependencies.some(dependency => packagePath.endsWith(`node_modules/${dependency}`))) errors.push(`Transitive P2P dependency: ${packagePath}`);
}
if (errors.length) throw new Error(`Media boundary violations: ${errors.join(', ')}`);
console.log('Core and Player media boundaries verified.');
