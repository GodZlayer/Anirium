import fs from 'node:fs';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
  const args=process.argv.slice(2);
  if(args.length>1 || (args.length===1 && args[0]!=='--apply')) throw new Error('invalid_arguments');
  if(fs.existsSync('.env'))process.loadEnvFile('.env');
  process.env.NODE_ENV='production';
  const apply=args[0]==='--apply', database=runtime.load('src/lib/postgres.ts');
  const helper=runtime.load('src/lib/addonEnabledMigration.ts');
  const result=await database.withTransaction(async client=>{
    if(!apply)await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return apply ? helper.migrateAddonEnabledSchema(client) : helper.inspectAddonEnabledSchema(client);
  });
  console.log(JSON.stringify({mode:apply?'committed':'preview',...result}));
} catch(error) {
  const known=['invalid_arguments','unsupported_addon_enabled_schema','invalid_addon_enabled_values','addon_enabled_conversion_failed'];
  const code=known.includes(error.message)?error.message:error.message==='Database configuration unavailable'?'database_configuration_unavailable':/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'migration_failed';
  console.error(JSON.stringify({mode:'failed',code}));process.exitCode=1;
} finally {await runtime.close();}
