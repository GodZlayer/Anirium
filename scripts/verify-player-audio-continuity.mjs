import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const callback = source.match(/const applyAudioSelection = \(\) => \{([\s\S]*?)\n\s*\};/);
assert.ok(callback, 'Actual HLS language-selection callback missing');
assert.match(source, /hls\.on\(Hls\.Events\.AUDIO_TRACKS_UPDATED, applyAudioSelection\)/);
const compiled = ts.transpileModule(`function applyAudioSelection() {${callback[1]}}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const selectedAudioRef = { current: 'por' };
const context = vm.createContext({ selectedAudioRef, hls: null });
vm.runInContext(compiled, context);
for (const tracks of [
  [{ lang: 'jpn' }, { lang: 'por' }],
  [{ lang: 'por' }, { lang: 'eng' }, { lang: 'jpn' }],
]) {
  context.hls = { audioTracks: tracks, audioTrack: -1 };
  context.applyAudioSelection();
  assert.equal(tracks[context.hls.audioTrack].lang, 'por', 'New window lost selected language');
}
selectedAudioRef.current = 'eng';
context.applyAudioSelection();
assert.equal(context.hls.audioTracks[context.hls.audioTrack].lang, 'eng');
context.hls = { audioTracks: [{ lang: 'jpn' }], audioTrack: 0 };
context.applyAudioSelection();
assert.equal(context.hls.audioTrack, 0, 'Unavailable language invented an audio index');
context.hls = null;
context.applyAudioSelection();
console.log('Actual Player HLS callback preserves selected language across reordered window tracks; no installed/browser playback proof.');
