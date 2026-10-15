import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const handler = source.match(/onEnded=\{\(\) => \{([\s\S]*?)\n\s*\}\}/)?.[1];
assert.ok(handler, 'Actual ended handler missing');
for (const continuous of [true, false]) {
  for (const finalWindow of [true, false]) {
    const intent = { current: true };
    let playing = true;
    const requests = [];
    vm.runInNewContext(`(() => {${handler}})()`, {
      serviceWindow: { start: 24, deliveredDuration: 24, endOfEpisode: finalWindow },
      serviceManifest: { continuousBuffer: continuous }, selectedQuality: '720p',
      playbackIntentRef: intent, setIsPlaying: value => { playing = value; },
      requestServiceWindow: (...args) => { requests.push(args); },
    });
    if (!continuous && !finalWindow) {
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0], [48, '720p', true]);
    } else {
      assert.equal(requests.length, 0, 'Completed media must not request another window');
      assert.equal(intent.current, false, 'Buffer updates must not restart completed media');
      assert.equal(playing, false, 'Completed media must show stopped transport');
    }
  }
}
console.log('Actual ended handler stops final/continuous playback and preserves legacy window continuation.');
