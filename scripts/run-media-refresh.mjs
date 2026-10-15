import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
 const args=process.argv.slice(2);let intervalMs=86400000;
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--once')continue;
  if(args[i]==='--interval-ms' && /^[1-9][0-9]*$/.test(args[i+1]??'')) {intervalMs=Number(args[++i]);continue;}
  throw new Error('invalid_arguments');
 }
 if(!Number.isSafeInteger(intervalMs) || intervalMs<2100 || intervalMs>8640000000000000)throw new Error('invalid_arguments');
 if(fs.existsSync('.env'))process.loadEnvFile('.env');
 process.env.NODE_ENV='production';
 const db=runtime.load('src/lib/postgres.ts'),refresh=runtime.load('src/lib/mediaRefresh.ts'),schedule=runtime.load('src/lib/collectionSchedule.ts');
 await db.ensurePostgresSchema();
 let discoveryAt=0;
 do {
  const now=Date.now();
  if(now>=discoveryAt) {
   await db.withTransaction(client=>refresh.registerMediaRefreshJobs(client,intervalMs,now));
   discoveryAt=now+60000;
  }
  const job=await db.withTransaction(client=>refresh.readDueMediaRefresh(client,now));
  if(job) {
   try {
    const result=await refresh.collectMediaRefresh(job,(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)}));
    console.log(JSON.stringify({status:'committed',aliasId:job.aliasId,...result}));
   } catch(error) {
    const code=error.status===429?'source_rate_limited':'refresh_failed';
    const retryAt=schedule.collectionRetryAt(Date.now(),error.status===429?error.retryAfter:undefined);
    // Another process may have committed this observation while this request was pending.
    try {await db.withTransaction(client=>refresh.deferMediaRefresh(client,job,retryAt,code));}
    catch(conflict) {if(conflict.message!=='Stale media refresh')throw conflict;}
    console.error(JSON.stringify({status:'retry_pending',aliasId:job.aliasId,code,retryAt}));
    if(args.includes('--once'))throw error;
   }
  }
  if(args.includes('--once'))break;
  await delay(job?2100:10000);
 } while(true);
} catch(error) {
 console.error(JSON.stringify({status:'failed',code:error.message==='Database configuration unavailable'?'database_configuration_unavailable':error.message==='invalid_arguments'?'invalid_arguments':'media_refresh_failed'}));
 process.exitCode=1;
} finally {await runtime.close();}
