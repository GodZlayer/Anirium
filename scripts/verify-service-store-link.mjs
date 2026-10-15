import assert from 'node:assert/strict';
import fs from 'node:fs';

const player = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
assert.match(player, /<a\s+href="ms-windows-store:\/\/pdp\/\?productid=9MV35DDQ6SBD"/);
assert.match(player, /Abrir na Microsoft Store/);
assert.doesNotMatch(player, /\/api\/download\/service|Baixar anirium-service\.exe|handleDownloadService/);
const manifest = fs.readFileSync('anirium-service/msix/AppxManifest.xml', 'utf8');
assert.match(manifest, /Name="GodZlayer\.AniriumService"/);
assert.match(manifest, /Publisher="CN=27B01EF0-8B9B-4186-9321-D5C62004CBB6"/);
assert.match(manifest, /uap10:RuntimeBehavior="packagedClassicApp"/);
assert.match(manifest, /uap10:TrustLevel="mediumIL"/);
console.log('Player Store link and native package identity verified (not public availability or installed runtime).');
