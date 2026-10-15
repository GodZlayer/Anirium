import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {projectTypescript} from './lib/project-typescript.mjs';
import {mediaDetailsFixture} from './fixtures/media-details.mjs';
const target=new URL(process.env.DATABASE_URL);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/anirium_security_fixture');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'anirium-refresh-process-'));
const requests=path.join(temporary,'requests.jsonl'),fixtureFile=path.join(temporary,'source.json');
fs.writeFileSync(requests,'');
const runtime=projectTypescript();let activeChild;
async function run(mode,interrupt=false,continuous=false) {
 fs.writeFileSync(fixtureFile,JSON.stringify({mode,requests}));
 const args=['--import',pathToFileURL(path.resolve('scripts/fixtures/media-refresh-process-source.mjs')).href,
  'scripts/run-media-refresh.mjs','--interval-ms','3600000'];
 if(!continuous)args.push('--once');
 const child=spawn(process.execPath,args,{env:{...process.env,ANIRIUM_TEST_MEDIA_SOURCE:fixtureFile},stdio:['ignore','pipe','pipe']});
 activeChild=child;let stdout='',stderr='';
 child.stdout.on('data',data=>{stdout+=data;if(continuous && stdout.includes('"status":"committed"'))child.kill();});child.stderr.on('data',data=>stderr+=data);
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,stdout,stderr}));});
 const timeout=setTimeout(()=>child.kill(),45000);
 try {
  if(interrupt) {
   const before=fs.readFileSync(requests,'utf8');let observed=false;
   for(let attempt=0;attempt<200;attempt++) {await delay(50);if(fs.readFileSync(requests,'utf8')!==before){observed=true;break;}}
   assert.ok(observed,'interrupt a live source request');child.kill();
  }
  return await done;
 } finally {clearTimeout(timeout);activeChild=undefined;}
}
try {
 process.env.NODE_ENV='production';
 const db=runtime.load('src/lib/postgres.ts'),ingest=runtime.load('src/lib/anilistMediaIngestion.ts');
 await db.ensurePostgresSchema();
 const seed=id=>db.withTransaction(client=>ingest.ingestAniListMediaSnapshot(client,{...mediaDetailsFixture(),id,idMal:null,type:'ANIME',format:'TV',episodes:12,status:'RELEASING',averageScore:5,countryOfOrigin:'JP',
  title:{romaji:'Título inicial',english:'Old title',native:null},relations:{pageInfo:{hasNextPage:false},edges:[]}},1000));
 await seed(970001);await seed(970002);
 assert.equal((await run('success')).code,0);
 assert.equal((await run('success')).code,0);
 const snapshot=()=>db.withTransaction(async client=>({jobs:(await client.query('SELECT * FROM canonical_media_refresh_jobs ORDER BY alias_id')).rows,
  receipts:(await client.query('SELECT * FROM canonical_media_refresh_receipts ORDER BY alias_id,revision')).rows}));
 const first=await snapshot();assert.equal(first.receipts.length,2);assert.ok(first.jobs.every(job=>Number(job.revision)===1));
 const before=fs.readFileSync(requests,'utf8');
 assert.equal((await run('success')).code,0);assert.equal(fs.readFileSync(requests,'utf8'),before,'not due after restart makes no source request');
 assert.deepEqual(await snapshot(),first);
 assert.equal(await db.withTransaction(async client=>(await client.query("SELECT COUNT(*)::int AS n FROM canonical_content_fact_heads h JOIN canonical_content_facts f USING(entity_id,alias_id,source_key,field,observed_at) WHERE h.field='media.episodes' AND h.source_key='anilist:media' AND f.value='13'::jsonb")).rows[0].n),2);
 await seed(970003);
 await run('blocked',true);
 const killed=await snapshot();assert.equal(killed.receipts.length,2);assert.equal(killed.jobs.filter(job=>Number(job.revision)===0).length,1);
 assert.equal((await run('success')).code,0,'restart resumes same pending identity');
 assert.equal((await snapshot()).receipts.length,3);
 await seed(970006);
 const continuous=await run('success',false,true);
 assert.match(continuous.stdout,/"status":"committed"/,'continuous loop commits before test interruption');
 assert.equal((await snapshot()).receipts.length,4);
 await seed(970004);
 assert.notEqual((await run('invalid')).code,0);
 const failed=await snapshot();assert.equal(failed.receipts.length,4);assert.equal(failed.jobs.filter(job=>Number(job.revision)===0).length,1);
 // Another identity remains eligible while the malformed identity waits.
 await seed(970005);
 assert.notEqual((await run('rate-limit')).code,0);
 const limited=await snapshot();assert.equal(limited.receipts.length,4);
 const limitedRequests=fs.readFileSync(requests,'utf8');
 assert.equal((await run('success')).code,0);assert.equal(fs.readFileSync(requests,'utf8'),limitedRequests,'source cooldown survives process restart');
 const schedule=runtime.load('src/lib/collectionSchedule.ts');
 await db.withTransaction(client=>schedule.registerCollectionSchedule(client,{id:crypto.randomUUID(),start:1000,windowMs:10000,intervalMs:3000,lookbackMs:0,dueAt:0}));
 assert.equal(await db.withTransaction(client=>schedule.readDueCollectionSchedule(client,Date.now())),null,'refresh source429 blocks airing source too');
 console.log('Actual metadata refresh process PostgreSQL: own source correction, per-identity restart/not-due no-fetch, in-flight interruption/resumption, continuous loop commit, malformed response no receipt, ordinary failure fairness and shared source429 persisted across restart passed. Controlled source; no production activation.');
} finally {
 if(activeChild)activeChild.kill();await runtime.close();fs.rmSync(temporary,{recursive:true,force:true});
}
