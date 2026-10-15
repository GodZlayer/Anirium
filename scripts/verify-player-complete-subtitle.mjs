import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx', 'utf8');
const match = source.match(/const subtitleSrc = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]+)\]\);/);
assert.ok(match, 'Selected subtitle URL must remain independently memoized');
const context = { selectedSubtitle: 'por', isServiceOnline: true, playbackTicket: 'test-ticket', serviceManifest: { subtitleTracks: [{}] },
  subtitleOption: 0, customMediaSrc: '', serviceEndpoint: 'http://127.0.0.1:4004',
  existingSubtitleOptions: () => [{id:'subtitle-1-2-3'}] };
const url = vm.runInNewContext(`(() => {${match[1]}})()`, context);
assert.equal(new URL(url).searchParams.get('trackId'), 'subtitle-1-2-3');
assert.equal(new URL(url).searchParams.has('start'), false, 'Whole subtitle request must not carry a window start');
assert.ok(!match[2].includes('currentTime') && !match[2].includes('subtitleWindowStart'), 'Seek must not invalidate the selected whole track');
context.selectedSubtitle = 'Desativado';
assert.equal(vm.runInNewContext(`(() => {${match[1]}})()`, context), '');
context.selectedSubtitle = 'por'; context.customMediaSrc = 'blob:fixture';
assert.equal(vm.runInNewContext(`(() => {${match[1]}})()`, context), '');
console.log('Complete subtitle URL, seek stability, disabled subtitles and independent-media isolation verified.');
