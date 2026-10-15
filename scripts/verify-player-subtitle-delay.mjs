import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const presentation = source.match(/useEffect\(\(\) => \{\s*(const subtitleTime = currentTime - subtitleDelay;[\s\S]*?)\n\s*\}, \[parsedCues, currentTime, subtitleDelay\]\)/)?.[1];
assert.ok(presentation, 'Actual subtitle presentation effect missing');
const parsedCues = [{ start: 10, end: 12, text: 'Speech' }];
for (const [currentTime, subtitleDelay, expected] of [[10, 0, 'Speech'], [12, 0, ''], [12, 2, 'Speech'], [8, -2, 'Speech'], [9, 2, '']]) {
  let rendered;
  vm.runInNewContext(presentation, { currentTime, subtitleDelay, parsedCues, setCurrentCueText: value => { rendered = value; } });
  assert.equal(rendered, expected, 'Offset must change cue presentation without moving media time');
}
const reset = source.match(/useEffect\(\(\) => \{\s*(setSubtitleDelay\(0\);[\s\S]*?)\n\s*\}, \[subtitleSrc\]\)/)?.[1];
assert.ok(reset);
let delay = 3, manual = true;
vm.runInNewContext(reset, { setSubtitleDelay: value => { delay = value; }, setSubtitleManualRequired: value => { manual = value; } });
assert.equal(delay, 0); assert.equal(manual, false);
assert.ok(source.includes('subtitleManualRequired && ('), 'Unverified-only controls must remain conditional');
const fallback = source.match(/useEffect\(\(\) => \{\s*\/\/ A later video fallback[\s\S]*?(if \(jointBuffer.state\?\.subtitleUnverified === true\) setSubtitleManualRequired\(true\);)\s*\}, \[jointBuffer.state\]\)/)?.[1];
assert.ok(fallback, 'Loaded subtitles must react to producer changes');
for (const [state, initial, expected] of [[{subtitleUnverified:true},false,true],[{subtitleUnverified:false},false,false],[{subtitleUnverified:false},true,true],[null,true,true]]) {
  let manual = initial;
  vm.runInNewContext(fallback, {jointBuffer:{state},setSubtitleManualRequired:value=>{manual=value;}});
  assert.equal(manual,expected,'Fallback must expose manual adjustment without clearing an uncertain alignment');
}
console.log('Actual subtitle effect: delay/advance, end-exclusive cues and track reset passed.');
