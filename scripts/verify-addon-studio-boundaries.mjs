import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/AddonDevStudio.tsx', 'utf8');
for (const obsolete of ['dev_inspect', 'runScraperTest', 'topSources', 'seeders', 'executionTimeMs', 'Sandboxed Environment', 'playback.source.provide']) {
  assert.ok(!source.includes(obsolete), `Studio still advertises or requests media execution: ${obsolete}`);
}
assert.ok(source.includes('Informações de arquitetura, não telemetria.'));
assert.ok(source.includes('install_manifest'), 'UI plugin registration lost');
assert.ok(source.includes('refreshUser()'), 'Account refresh lost');
console.log('Addon Studio: no simulated provider telemetry or sandbox claims; registration preserved.');
