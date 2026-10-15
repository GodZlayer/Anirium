import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {projectTypescript} from './lib/project-typescript.mjs';

const target=new URL(process.env.DATABASE_URL);
assert.equal(target.pathname,'/anirium_security_fixture');
assert.equal(target.hostname,'127.0.0.1');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'anirium-schedule-process-'));
const requests=path.join(temporary,'requests.jsonl'),fixtureFile=path.join(temporary,'source.json'),configFile=path.join(temporary,'schedule.json');
fs.writeFileSync(requests,'');
const runtime=projectTypescript();let activeChild;
async function run(mode,config=false,interrupt=false,continuous=false) {
  fs.writeFileSync(fixtureFile,JSON.stringify({mode,requests,initialCount:fs.readFileSync(requests,'utf8').split('\n').filter(Boolean).length}));
  const args=['--import',pathToFileURL(path.resolve('scripts/fixtures/airing-process-source.mjs')).href,'scripts/run-airing-schedules.mjs'];
  if(!continuous)args.push('--once');
  if(config)args.push('--config',configFile);
  const child=spawn(process.execPath,args,{env:{...process.env,ANIRIUM_TEST_AIRING_SOURCE:fixtureFile},stdio:['ignore','pipe','pipe']});
  activeChild=child;let stdout='',stderr='';
  child.stdout.on('data',data=>{stdout+=data;if(continuous && stdout.includes('"status":"complete"'))child.kill();});child.stderr.on('data',data=>stderr+=data);
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,stdout,stderr}));});
  const timeout=setTimeout(()=>child.kill(),continuous?120000:45000);
  try {
    if(interrupt) {
      const count=fs.readFileSync(requests,'utf8').trim().split('\n').length;
      let observed=false;
      for(let attempt=0;attempt<200;attempt++) {
        await delay(50);
        if(fs.readFileSync(requests,'utf8').trim().split('\n').length>count) {observed=true;break;}
      }
      assert.ok(observed,'interruption occurs during live source request');
      child.kill();
    }
    return await done;
  } finally {clearTimeout(timeout);activeChild=undefined;}
}
try {
  process.env.NODE_ENV='production';
  const database=runtime.load('src/lib/postgres.ts'),index=runtime.load('src/lib/entityIndex.ts'),schedule=runtime.load('src/lib/collectionSchedule.ts'),collection=runtime.load('src/lib/collectionWindow.ts');
  await database.ensurePostgresSchema();
  await database.withTransaction(async client=>{
    const season=await index.ensureEntity({namespace:'anilist:season',value:'900002',sourceKey:'fixture:verified-season'},{kind:'SEASON'},client);
    const work=await index.ensureEntity({namespace:'schedule-process-fixture',value:'work',sourceKey:'fixture'},{kind:'WORK'},client);
    const universe=await index.ensureEntity({namespace:'schedule-process-fixture',value:'universe',sourceKey:'fixture'},{kind:'UNIVERSE'},client);
    await index.linkContentEntities(client,work.id,season.id,0,'fixture');
    await index.linkContentEntities(client,universe.id,work.id,0,'fixture');
  });
  const id=crypto.randomUUID(),scope=`schedule:${id}:0`;
  fs.writeFileSync(configFile,JSON.stringify({id,start:1000,windowMs:10000,intervalMs:3600000,lookbackMs:2000,dueAt:0}));
  const initialRun=await run('success',true);
  assert.equal(initialRun.code,0,initialRun.stdout+'\n'+initialRun.stderr);
  const snapshot=()=>database.withTransaction(async client=>({window:(await client.query('SELECT * FROM canonical_collection_windows WHERE scope=$1',[scope])).rows[0],schedule:(await client.query('SELECT * FROM canonical_collection_schedules WHERE id=$1',[id])).rows[0]}));
  const first=await snapshot();assert.equal(first.window.next_page,2);assert.equal(Number(first.schedule.sequence),0);
  assert.notEqual((await run('rate-limit')).code,0);
  assert.deepEqual(await snapshot(),first,'HTTP429 process preserves exact persisted state');
  const limitedRequests=fs.readFileSync(requests,'utf8');
  assert.equal((await run('success')).code,0);
  assert.equal(fs.readFileSync(requests,'utf8'),limitedRequests,'restarted process respects persisted Retry-After without fetching');
  const retryDeadline=await database.withTransaction(async client=>Number((await client.query('SELECT retry_at FROM canonical_collection_retries WHERE schedule_id=$1 AND sequence=0',[id])).rows[0].retry_at));
  console.log('Actual process source cooldown persisted; waiting for the stored Retry-After deadline before restart.');
  while(Date.now()<retryDeadline)await delay(Math.min(1000,retryDeadline-Date.now()));
  await run('blocked',false,true);
  assert.deepEqual(await snapshot(),first,'killed in-flight process preserves committed page');
  assert.equal((await run('success')).code,0);
  const complete=await snapshot();assert.equal(complete.window.status,'complete');assert.equal(Number(complete.schedule.sequence),1);assert.equal(Number(complete.schedule.next_start),9000);
  const before=fs.readFileSync(requests,'utf8');
  assert.equal((await run('success')).code,0);
  assert.equal(fs.readFileSync(requests,'utf8'),before,'not-due process makes no source request');
  assert.deepEqual(before.trim().split('\n').map(line=>JSON.parse(line).page),[1,2,2,2]);
  const gapId=crypto.randomUUID(),gapScope=`schedule:${gapId}:0`;
  await database.withTransaction(async client=>{
    await schedule.registerCollectionSchedule(client,{id:gapId,start:1000,windowMs:10000,intervalMs:3600000,lookbackMs:0,dueAt:0});
    await collection.startAiringCollection(client,gapScope,1000,11000);
    await collection.acceptAiringCollectionPage(client,{scope:gapScope,page:1,observedAt:Date.now(),hasMore:false,entries:[]});
  });
  assert.equal((await run('success')).code,0);
  assert.equal(fs.readFileSync(requests,'utf8'),before,'completed page / unadvanced schedule resumes without fetching');
  assert.equal(await database.withTransaction(async client=>Number((await client.query('SELECT sequence FROM canonical_collection_schedules WHERE id=$1',[gapId])).rows[0].sequence)),1);
  const continuousId=crypto.randomUUID();
  fs.writeFileSync(configFile,JSON.stringify({id:continuousId,start:1000,windowMs:10000,intervalMs:3600000,lookbackMs:0,dueAt:0}));
  const continuousOffset=fs.readFileSync(requests,'utf8').split('\n').filter(Boolean).length;
  console.log('Testing continuous runner HTTP429 retry in the same process over the real stored cooldown.');
  const continuousRun=await run('rate-limit-once',true,false,true);
  assert.match(continuousRun.stderr,/retry_pending/);
  assert.match(continuousRun.stdout,/"status":"complete"/,'same process must recover and complete before test timeout');
  const continuousRequests=fs.readFileSync(requests,'utf8').split('\n').filter(Boolean).slice(continuousOffset).map(line=>JSON.parse(line));
  assert.deepEqual(continuousRequests.map(request=>request.page),[1,1,2]);
  assert.ok(continuousRequests[1].observedAt-continuousRequests[0].observedAt>=60000,'continuous loop honors source cooldown');
  assert.equal(await database.withTransaction(async client=>Number((await client.query('SELECT sequence FROM canonical_collection_schedules WHERE id=$1',[continuousId])).rows[0].sequence)),1);
  console.log('Actual scheduler process PostgreSQL: page1 commit, HTTP429 rollback, in-flight kill, page2 restart, due boundary and completion/advance crash gap passed. Upstream transport controlled; no live-source or production activation claim.');
} finally {
  if(activeChild)activeChild.kill();
  await runtime.close();
  fs.rmSync(temporary,{recursive:true,force:true});
}
