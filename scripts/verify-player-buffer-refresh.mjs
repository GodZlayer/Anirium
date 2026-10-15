import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;

// Service snapshot from the live 2.3.28 continuous session: joint target
// 30s, common coverage 48s, ready.
const fixture={coverage:{videoAhead:48,audioAhead:48,subtitleAhead:40,audioRequired:true,subtitleRequired:true},buffer:{targetSeconds:30,commonAhead:40,ready:true},playlistUrl:'/hls/window-1-1-video/continuous-master.m3u8'};
const context={exports:{}};
vm.runInNewContext(compile('src/addons/player-pro/bufferAhead.ts'),context);
const {bufferedAhead}=context.exports;
vm.runInNewContext(compile('src/addons/player-pro/playbackBuffer.ts'),context);
const {parsePlaybackBuffer,canStartBufferedPlayback}=context.exports;

// Live Edge t0: paused, readyState 4, error null, buffered 0.083334-48.166666.
const liveRanges={length:1,start:()=>0.083334,end:()=>48.166666};
const browserAhead=bufferedAhead(liveRanges,0);
assert.ok(browserAhead>=30,'Paused decoder at position 0 must count loaded initial buffer');

// Subtitle silence: window start 0 delivered with HTTP 200 and 0 cues still
// covers 60s. The interval is loaded; cue presence is not part of the gate.
const subtitleAhead=Math.max(0,60-0);
assert.ok(canStartBufferedPlayback(parsePlaybackBuffer(fixture),browserAhead,subtitleAhead),'Gate must open for 48s browser buffer with a silent subtitle window');

// A genuinely future range stays disconnected even with the initial tolerance.
assert.equal(bufferedAhead({length:1,start:()=>10,end:()=>40},0),0);

// Player wiring: playback milestones refresh the browser reserve, and
// continuous mode polls it while the gate holds the decoder paused
// (a paused element fires no timeupdate; MSE progress is not guaranteed).
const source=fs.readFileSync('src/addons/player-pro/PlayerProComponent.tsx','utf8');
assert.ok(source.includes('onCanPlay={handleProgress}'),'canplay milestone must refresh the browser reserve');
assert.ok(source.includes('onCanPlayThrough={handleProgress}'),'canplaythrough milestone must refresh the browser reserve');
assert.ok(source.includes('const handleProgressRef = useRef(handleProgress);'),'Polling must invoke the latest progress handler');
assert.ok(source.includes('setInterval(() => handleProgressRef.current(), 1000)'),'Paused decoder must poll the browser reserve');
assert.ok(source.includes('else videoRef.current.pause();'),'Gate must still hold the decoder paused while not ready');
console.log('Player paused-buffer regression: t0 offset tolerance, subtitle silence and paused reserve refresh verified.');
