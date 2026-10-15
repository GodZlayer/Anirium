import fs from 'node:fs';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
  const args=process.argv.slice(2);
  if(args.length!==2 || args[0]!=='--id' || !/^[1-9][0-9]*$/.test(args[1]) || Number(args[1])>2147483647)throw new Error('invalid_arguments');
  if(fs.existsSync('.env'))process.loadEnvFile('.env');
  process.env.NODE_ENV='production';
  const db=runtime.load('src/lib/postgres.ts'),source=runtime.load('src/lib/anilistMediaIngestion.ts');
  await db.ensurePostgresSchema();
  const snapshot=await source.fetchAniListMediaSnapshot(Number(args[1]),(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)}));
  const result=await db.withTransaction(client=>source.ingestAniListMediaSnapshot(client,snapshot.media,snapshot.observedAt));
  console.log(JSON.stringify({status:'committed',...result}));
} catch(error) {
  console.error(JSON.stringify({status:'failed',code:error.message==='Database configuration unavailable'?'database_configuration_unavailable':error.status===429?'source_rate_limited':error.message==='invalid_arguments'?'invalid_arguments':'media_ingestion_failed'}));
  process.exitCode=1;
} finally {await runtime.close();}
