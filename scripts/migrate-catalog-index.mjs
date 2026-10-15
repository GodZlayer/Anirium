import fs from 'node:fs';
import {projectTypescript} from './lib/project-typescript.mjs';

const args=process.argv.slice(2), options={apply:false,after:0,limit:100,pages:1};
const runtime=projectTypescript(),load=runtime.load;
try {
  for(let index=0;index<args.length;index++) {
    const arg=args[index];
    if(arg==='--apply'){options.apply=true;continue;}
    const key={'--after':'after','--limit':'limit','--pages':'pages'}[arg];
    const value=args[++index];
    if(!key || !value || !/^\d+$/.test(value))throw new Error('invalid_arguments');
    options[key]=Number(value);
  }
  if(!Number.isSafeInteger(options.after)||options.after>2147483647||!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>200||!Number.isSafeInteger(options.pages)||options.pages<1||options.pages>10000)throw new Error('invalid_arguments');
  if(fs.existsSync('.env'))process.loadEnvFile('.env');
  process.env.NODE_ENV='production';
  const database=load('src/lib/postgres.ts');
  if(!options.apply) {
    const preview=await database.withTransaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      return (await client.query('SELECT count(*)::text AS remaining FROM anime_catalog WHERE mal_id>$1',[options.after])).rows[0];
    });
    console.log(JSON.stringify({mode:'preview',after:options.after,limit:options.limit,pages:options.pages,...preview}));
  } else {
    const backfill=load('src/lib/catalogBackfill.ts').backfillCatalogWorks;
    let after=options.after;
    for(let index=0;index<options.pages;index++) {
      const page=await backfill({afterId:after,limit:options.limit});
      // The promise resolves after COMMIT; failed pages never publish a new cursor.
      console.log(JSON.stringify({mode:'committed',...page}));
      after=page.nextAfterId;
      if(page.exhausted)break;
    }
  }
} catch(error) {
  const code=error.message==='invalid_arguments' ? 'invalid_arguments' : error.message==='Database configuration unavailable' ? 'database_configuration_unavailable' : /^[A-Z0-9]{5}$/.test(error.code??'') ? error.code : 'migration_failed';
  console.error(JSON.stringify({mode:'failed',code}));process.exitCode=1;
} finally {await runtime.close();}
