import assert from 'node:assert/strict';
import { existingSubtitleOptions, nextSubtitleOption } from '../src/addons/player-pro/subtitleOptions.ts';

const tracks = [{id:'a',language:'por'},{id:'b',language:'por'},{id:'c',language:'eng'},{id:'a',language:'por'},{id:'',language:'fra'}];
assert.equal(existingSubtitleOptions(tracks,'por').length,2);
assert.deepEqual(existingSubtitleOptions(tracks).map(track=>track.id),['a','b','c']);
assert.equal(nextSubtitleOption('eng','por',1,2),0);
assert.equal(nextSubtitleOption('por','por',0,2),1);
assert.equal(nextSubtitleOption('por','por',1,2),0);
assert.equal(nextSubtitleOption('por','por',0,1),0);
assert.equal(nextSubtitleOption('por','Desativado',1,0),0);
assert.deepEqual(existingSubtitleOptions([]),[]);
console.log('Subtitle options verified: existing tracks only, distinct IDs, per-language cycling and disabled state.');
