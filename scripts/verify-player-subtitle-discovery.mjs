import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/addons/player-pro/PlayerProComponent.tsx', import.meta.url), 'utf8');
const start = source.indexOf('// Efeito para sincronizar as seleções');
const effect = source.slice(start).match(/useEffect\(\(\) => \{[\s\S]*?\}, \[availableQualities, availableAudios, availableSubtitles, selectedQuality, selectedAudio, selectedSubtitle\]\);/)?.[0];
assert.ok(effect, 'Exercise actual discovery defaults');
for (const [inventory, selected, expected] of [
  [['Desativado'], '', null],
  [['Desativado', 'por', 'eng'], '', 'por'],
  [['Desativado', 'eng'], '', 'eng'],
  [['Desativado', 'por'], 'Desativado', null],
]) {
  let changed = null;
  vm.runInNewContext(ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, {
    useEffect: fn => fn(), availableQualities: [], availableAudios: [], availableSubtitles: inventory,
    selectedQuality: '', selectedAudio: '', selectedSubtitle: selected,
    setSelectedSubtitle: value => { changed = value; }, setSelectedQuality() {}, setSelectedAudio() {},
  });
  assert.equal(changed, expected);
}
assert.ok(source.includes('requestedWindow !== null ? "window-empty" : "empty"'));
assert.ok(source.includes('!cues.length && requestedWindow === null'));
assert.ok(source.includes('subtitleLoadStatus !== "window-empty"'));
console.log('Actual defaults survive pending inventory, prefer existing Portuguese, honor manual Off; empty-window UI guards verified.');
