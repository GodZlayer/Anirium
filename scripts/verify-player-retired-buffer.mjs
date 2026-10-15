import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx','utf8');
const handler = source.match(/hls\.on\(Hls\.Events\.ERROR, \(_, data\) => \{([\s\S]*?)\n      \}\);/)[1];
let errors = 0, destroyed = 0;
const context = {windowRequestRef:{current:new AbortController()}, setPlaybackError:()=>errors++,
  hls:{destroy:()=>destroyed++}, console:{warn(){}}, video:{currentTime:12,paused:true,readyState:4,buffered:{length:0}}};
const callback = vm.runInNewContext(`data => {${handler}}`,context);
callback({fatal:true,type:'networkError',details:'levelLoadError',response:{code:404}});
assert.equal(errors,0,'Retired loader must not overwrite the pending replacement state');
assert.equal(destroyed,0);
context.windowRequestRef.current=null;
callback({fatal:true,type:'networkError',details:'levelLoadError',response:{code:404}});
assert.equal(errors,1,'Active media failure must remain visible');
assert.equal(destroyed,1);
const commandPost = source.indexOf('let response = await fetch(sessionURL');
assert.ok(commandPost > 0 && source.indexOf('hlsRef.current?.stopLoad();') < commandPost);
const continuous = source.split('\n').find(line => line.includes('if (serviceManifest?.continuousBuffer) return serviceWindow?.continuousPlaylistUrl'));
assert.ok(continuous,'Continuous media attachment must exist');
assert.ok(continuous.includes('attachmentRevision=${windowAttachmentRevision}'),'Same-timeline retry must reattach its stopped loader');
console.log('Retired queue race, active fatal failure, stop-before-seek and retry reattachment verified.');
