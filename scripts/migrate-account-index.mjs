import fs from 'node:fs';
import {projectTypescript} from './lib/project-typescript.mjs';

const options={apply:false,owner:'',scope:'',after:'',limit:100,pages:1};
const runtime=projectTypescript();
const scopes={
  identity:{},
  activities:{table:'user_entity_status',cursor:'id',module:'activityEntityIndex',helper:'backfillActivityEntities',option:'afterId',result:'nextAfterId'},
  comments:{table:'entity_comments',cursor:'id',module:'entityCommentWriter',helper:'backfillCommentEntities',option:'afterId',result:'nextAfterId'},
  addons:{table:'user_addons',cursor:'addon_id',module:'accountPluginIndex',helper:'backfillAccountPlugins',option:'afterAddonId',result:'nextAfterAddonId'},
};
try {
  const args=process.argv.slice(2);
  for(let index=0;index<args.length;index++) {
    const arg=args[index];if(arg==='--apply'){options.apply=true;continue;}
    const key={'--owner':'owner','--scope':'scope','--after':'after','--limit':'limit','--pages':'pages'}[arg];
    const value=args[++index];
    if(!key||value===undefined||value.startsWith('--'))throw new Error('invalid_arguments');
    if(key==='limit'||key==='pages'){if(!/^\d+$/.test(value))throw new Error('invalid_arguments');options[key]=Number(value);}else options[key]=value;
  }
  const scope=scopes[options.scope];
  if(!scope||!options.owner.trim()||options.owner.length>256||/[\u0000-\u001f\u007f]/.test(options.owner)||!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>200||!Number.isSafeInteger(options.pages)||options.pages<1||options.pages>10000)throw new Error('invalid_arguments');
  const cursorPattern=options.scope==='addons' ? /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/ : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(options.scope==='identity'&&options.after)throw new Error('invalid_arguments');
  if(options.after&&!cursorPattern.test(options.after))throw new Error('invalid_arguments');
  if(fs.existsSync('.env'))process.loadEnvFile('.env');process.env.NODE_ENV='production';
  if(!options.apply) {
    const database=runtime.load('src/lib/postgres.ts');
    const preview=await database.withTransaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      if(!(await client.query('SELECT id FROM users WHERE id=$1',[options.owner])).rows.length)throw new Error('account_unavailable');
      // table/cursor are from the fixed scope map, never user SQL.
      if(options.scope==='identity')return (await client.query("SELECT CASE WHEN canonical_account_id IS NULL THEN '1' ELSE '0' END AS remaining FROM users WHERE id=$1",[options.owner])).rows[0];
      return (await client.query(options.scope==='addons'
        ? 'SELECT count(*)::text AS remaining FROM user_addons WHERE user_id=$1 AND addon_id>$2'
        : `SELECT count(*)::text AS remaining FROM ${scope.table} WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid)`,
        [options.owner,options.after|| (options.scope==='addons'?'':null)])).rows[0];
    });
    console.log(JSON.stringify({mode:'preview',scope:options.scope,after:options.after,limit:options.limit,pages:options.pages,...preview}));
  } else {
    if(options.scope==='identity') {
      await runtime.load('src/lib/accountIdentity.ts').backfillAccountIdentity(options.owner);
      console.log(JSON.stringify({mode:'committed',scope:'identity',processed:1,exhausted:true}));
    } else {
    const backfill=runtime.load(`src/lib/${scope.module}.ts`)[scope.helper];
    let after=options.after;
    for(let index=0;index<options.pages;index++) {
      const page=await backfill(options.owner,{[scope.option]:after,limit:options.limit});
      console.log(JSON.stringify({mode:'committed',scope:options.scope,...page}));
      after=page[scope.result];if(page.exhausted)break;
    }
    }
  }
} catch(error) {
  const known=['invalid_arguments','account_unavailable'];
  const code=known.includes(error.message)?error.message:error.message==='Database configuration unavailable'?'database_configuration_unavailable':/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'migration_failed';
  console.error(JSON.stringify({mode:'failed',code}));process.exitCode=1;
} finally {await runtime.close();}
