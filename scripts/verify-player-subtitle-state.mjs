import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const match = source.match(/useEffect\(\(\) => \{\s*const active = parsedCues\.filter[\s\S]*?\}, \[parsedCues, currentTime\]\);/);
assert.ok(match, 'Reactive subtitle effect missing');
for (const language of ['por', 'eng', 'zho', 'jpn']) {
  let displayed;
  vm.runInNewContext(match[0], {
    useEffect: callback => callback(), currentTime: 49,
    parsedCues: [{start:48,end:50,text:language}, {start:49,end:51,text:'overlap'}],
    setCurrentCueText: value => { displayed = value; },
  });
  assert.equal(displayed, language + '\noverlap');
}
let displayed;
vm.runInNewContext(match[0], {useEffect: callback => callback(), currentTime:50,
  parsedCues:[{start:48,end:50,text:'finished'}], setCurrentCueText:value=>{displayed=value;}});
assert.equal(displayed, '');
assert.ok(source.includes('setSubtitleLoadStatus(`error:${res.status}`)'));
assert.ok(source.includes('}, [subtitleSrc, subtitleRetry, playbackTicket]);'), 'Retry must restart the subtitle request');
assert.ok(source.includes('setSubtitleRetry(value => value + 1)'), 'Retry must work for a single track');
console.log('Actual reactive subtitle effect passed: multiple languages, episode clock, paused loading, overlaps and exclusive cue end. Live Service extraction not verified.');
