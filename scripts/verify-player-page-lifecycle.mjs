import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/addons/player-pro/PlayerProComponent.tsx', import.meta.url), 'utf8');
const handler = source.match(/const handlePageHide = \(event: PageTransitionEvent\) => \{([\s\S]*?)\n    \};/);
assert.ok(handler, 'Player pagehide handler missing');
const compiled = ts.transpileModule(`(${handler[0].replace(/^const handlePageHide = /, '').replace(/;$/, '')})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
let releases = 0;
const onHide = runInNewContext(compiled, { release: () => { releases++; } });
onHide({ persisted: true });
assert.equal(releases, 0, 'BFCache suspension must preserve the Player instance');
onHide({ persisted: false });
assert.equal(releases, 1, 'Real departure must release the Player lease');
assert.ok(source.includes('window.removeEventListener("pagehide", handlePageHide)'), 'Cleanup must remove the registered handler');
console.log('Player lifecycle verified: cached suspension preserves the lease; real departure releases it.');
