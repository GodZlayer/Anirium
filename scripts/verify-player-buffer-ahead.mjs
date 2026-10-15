import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync('src/addons/player-pro/bufferAhead.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context = {exports:{}};
vm.runInNewContext(code, context);
const ranges = values => ({length:values.length,start:i=>values[i][0],end:i=>values[i][1]});
const ahead = context.exports.bufferedAhead;
assert.equal(ahead(ranges([[0,10],[20,40]]),5),5);
assert.equal(ahead(ranges([[0,10],[20,40]]),15),0);
assert.equal(ahead(ranges([[0,10],[20,40]]),25),15);
assert.equal(ahead(ranges([[0,10]]),10),0);
assert.equal(ahead(ranges([]),0),0);
assert.equal(ahead(ranges([[0,10]]),NaN),0);
// Live Edge continuous 2.3.28 at t0: paused, readyState 4, buffered
// 0.083334-48.166666 while the decoder sits at position 0. The initial
// fragment offset is contiguous media and must count as playable ahead.
assert.equal(ahead(ranges([[0.083334,48.166666]]),0),48.166666);
// The tolerance bridges that offset only; future ranges stay disconnected.
assert.equal(ahead(ranges([[0.6,40]]),0),0);
assert.equal(ahead(ranges([[10,40]]),0),0);
console.log('Actual decoder buffer: disconnected future ranges and consumed media do not count as playable ahead.');
