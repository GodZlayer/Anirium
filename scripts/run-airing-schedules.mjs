import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
  const args=process.argv.slice(2);let configPath;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--once')continue;
    if(args[i]==='--config' && !configPath && args[i+1]) {configPath=args[++i];continue;}
    throw new Error('invalid_arguments');
  }
  if(fs.existsSync('.env'))process.loadEnvFile('.env');
  process.env.NODE_ENV='production';
  const db=runtime.load('src/lib/postgres.ts'),schedule=runtime.load('src/lib/collectionSchedule.ts'),collector=runtime.load('src/lib/airingCollector.ts');
  await db.ensurePostgresSchema();
  if(configPath) {
    const input=JSON.parse(fs.readFileSync(configPath,'utf8'));
    await db.withTransaction(client=>schedule.registerCollectionSchedule(client,input));
  }
  do {
    const pending=await db.withTransaction(client=>schedule.readDueCollectionSchedule(client,Date.now()));
    let waitMs=pending?2100:10000;
    if(pending) {
      try {
        const result=await collector.collectAiringWindowPage(pending,(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)}));
        if(result.status==='complete')await db.withTransaction(client=>schedule.advanceCollectionSchedule(client,pending.id,pending.sequence,Date.now()));
        console.log(JSON.stringify({schedule:pending.id,sequence:pending.sequence,...result}));
      } catch(error) {
        const code=error.status===429?'source_rate_limited':'collection_failed';
        const retryAt=schedule.collectionRetryAt(Date.now(),error.status===429?error.retryAfter:undefined);
        await db.withTransaction(client=>schedule.deferCollectionSchedule(client,pending.id,pending.sequence,retryAt,code));
        console.error(JSON.stringify({schedule:pending.id,sequence:pending.sequence,status:'retry_pending',code,retryAt}));
        if(args.includes('--once'))throw error;
        waitMs=2100;
      }
    }
    if(process.argv.includes('--once'))break;
    await delay(waitMs);
  } while(true);
} catch(error) {
  console.error(JSON.stringify({status:'failed',code:error.message==='Database configuration unavailable'?'database_configuration_unavailable':'scheduled_collection_failed'}));
  process.exitCode=1;
} finally {await runtime.close();}
