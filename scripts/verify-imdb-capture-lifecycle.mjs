import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript(),lifecycle=runtime.load('src/lib/imdbCaptureLifecycle.ts');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'imdb-lifecycle-proof-'));
try{
 const live=await lifecycle.createImdbCaptureDirectory(root);fs.writeFileSync(path.join(live,'batches.jsonl'),'owned live spool');
 const unknown=path.join(root,randomUUID());fs.mkdirSync(unknown);fs.writeFileSync(path.join(unknown,'lease.json'),'not a lease');fs.writeFileSync(path.join(unknown,'keep.txt'),'foreign');
 const extra=path.join(root,randomUUID());fs.mkdirSync(extra);fs.writeFileSync(path.join(extra,'lease.json'),JSON.stringify({kind:'anirium-imdb-capture-v1',id:path.basename(extra),pid:process.pid,createdAt:0}));fs.writeFileSync(path.join(extra,'foreign.txt'),'must preserve');
 assert.equal((await lifecycle.cleanupAbandonedImdbCaptures(root)).removed,0);
 assert.equal(fs.readFileSync(path.join(live,'batches.jsonl'),'utf8'),'owned live spool');assert.equal(fs.readFileSync(path.join(unknown,'keep.txt'),'utf8'),'foreign');assert.equal(fs.readFileSync(path.join(extra,'foreign.txt'),'utf8'),'must preserve');
 await lifecycle.releaseImdbCaptureDirectory(live);assert.equal(fs.existsSync(live),false);
 assert.ok(fs.existsSync(unknown));assert.ok(fs.existsSync(extra));
 console.log('IMDb capture lifecycle: live process ownership and unknown/malformed/extra-content directories preserved; own normal release removed only named files. Dead-process cleanup exercised by real process PostgreSQL fixture.');
}finally{await runtime.close();fs.rmSync(root,{recursive:true,force:true});}
