import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/addons/player-pro/PlayerProComponent.tsx', import.meta.url), 'utf8');
const handler = source.match(/const switchQuality = \(q: string\) => \{[\s\S]*?\n  \};/)?.[0];
assert.ok(handler, 'Actual Player quality handler must be tested');
assert.ok(source.includes('selectedQuality, qualityRequestRevision, playbackTicket'), 'Explicit retry must trigger the request effect');
for (const fixture of [
  { status: 'stalled', selected: '720p', requested: '720p', error: '', retries: 1 },
  { status: 'ready', selected: '720p', requested: '720p', error: '', retries: 0 },
  { status: 'preparing', selected: '720p', requested: '720p', error: '', retries: 0 },
  { status: 'ready', selected: '720p', requested: '720p', error: 'network error', retries: 1 },
  { status: 'stalled', selected: '720p', requested: '1080p', error: '', retries: 0 },
	{ status: 'ready', selected: '720p', requested: '720p', error: 'window failed', retries: 0, target: { position: 132.5, playing: false }, windowRequests: 1 },
	{ status: 'ready', selected: '720p', requested: '720p', error: 'window failed', retries: 0, window: true, windowRequests: 1 },
]) {
  let revision = 0;
  let selected;
  let menu;
	const windowCalls = [];
  const context = {
    selectedQuality: fixture.selected,
    playbackError: fixture.error,
    serviceManifest: { variants: [{ quality: '720p', status: fixture.status }] },
    setQualityRequestRevision: update => { revision = update(revision); },
    setPlaybackError: () => {},
    setSelectedQuality: value => { selected = value; },
    setShowQualityMenu: value => { menu = value; },
    requested: fixture.requested,
	windowTargetRef: { current: fixture.target || null },
	serviceWindow: fixture.window ? { start: 120 } : null,
	currentTime: 125,
	isPlaying: true,
	requestServiceWindow: (...args) => windowCalls.push(args),
  };
  vm.runInNewContext(ts.transpileModule(`${handler}\nswitchQuality(requested);`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  assert.equal(revision, fixture.retries);
  assert.equal(selected, fixture.requested);
  assert.equal(menu, false);
	assert.equal(windowCalls.length, fixture.windowRequests || 0);
	if (fixture.windowRequests) assert.deepEqual(windowCalls[0], [fixture.target?.position ?? 125, '720p', fixture.target?.playing ?? true]);
}
console.log('Actual Player quality handler verified: explicit retries, no automatic retry loop. Not browser playback acceptance.');
