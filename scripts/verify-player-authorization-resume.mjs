import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const reset = source.match(/useEffect\(\(\) => \{\s*(windowRequestRef\.current\?\.abort\(\);[\s\S]*?)\s*return \(\) => \{ windowRequestRef\.current\?\.abort\(\); \};\s*\}, \[playbackTicket, customMediaSrc\]\);/);
assert.ok(reset, 'Ticket lifecycle effect missing');
const target = { position: 364, playing: false };
const context = vm.createContext({
  playbackTicket: '', customMediaSrc: '', windowRequestRef: { current: null },
  windowTargetRef: { current: null }, authorizationResumeRef: { current: target },
  episodeOffsetRef: { current: 364 }, setServiceWindow() {}, setWindowPending() {},
});
vm.runInContext(reset[1], context);
assert.equal(context.authorizationResumeRef.current, target, 'Credential clearing must preserve the recovery target');
assert.equal(context.windowTargetRef.current, null);
context.playbackTicket = 'newly-authorized-ticket';
vm.runInContext(reset[1], context);
assert.equal(context.windowTargetRef.current, target, 'A newly authorized session must resume the failed position and paused intent');
assert.equal(context.authorizationResumeRef.current, null, 'Consume recovery target once');
vm.runInContext(reset[1], context);
assert.equal(context.windowTargetRef.current, null, 'Later tickets must not reuse a stale recovery target');
console.log('PASS: authorization recovery preserves position and playback intent across credential clearing, consumes target after a new ticket');
