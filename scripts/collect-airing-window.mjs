import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
  const args=process.argv.slice(2),options={};
  for(let n=0;n<args.length;n++) {
    if(args[n]==='--once') {options.once=true;continue;}
    if(!['--scope','--start','--end'].includes(args[n]) || options[args[n].slice(2)]!==undefined || args[n+1]===undefined) throw new Error('invalid_arguments');
    options[args[n].slice(2)]=args[++n];
  }
  if(!options.scope || !/^\d+$/.test(options.start??'') || !/^\d+$/.test(options.end??'')) throw new Error('invalid_arguments');
  if(fs.existsSync('.env'))process.loadEnvFile('.env');
  process.env.NODE_ENV='production';
  const database=runtime.load('src/lib/postgres.ts');
  await database.ensurePostgresSchema();
  const collector=runtime.load('src/lib/airingCollector.ts');
  for(;;) {
    const result=await collector.collectAiringWindowPage({scope:options.scope,start:Number(options.start),end:Number(options.end)},
      (url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)}));
    console.log(JSON.stringify(result));
    if(result.status==='complete' || options.once)break;
    await delay(2100);
  }
} catch(error) {
  console.error(JSON.stringify({status:'failed',code:error.message==='Database configuration unavailable'?'database_configuration_unavailable':error.message==='invalid_arguments'?'invalid_arguments':error.status===429?'source_rate_limited':'collection_failed',retryAfter:error.status===429?error.retryAfter:undefined}));
  process.exitCode=1;
} finally {await runtime.close();}
