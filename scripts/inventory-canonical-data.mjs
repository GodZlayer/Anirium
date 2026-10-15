import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),modules=new Map();
process.loadEnvFile('.env');
function load(file) {
  file=path.resolve(file);
  if(modules.has(file))return modules.get(file);
  const exports={};modules.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,process,global:globalThis,Buffer,URL,console:{...console,error(){}},require(name){
    if(name.startsWith('./')||name.startsWith('../')){
      const target=path.resolve(path.dirname(file),name);
      return name.endsWith('.json') ? JSON.parse(fs.readFileSync(target,'utf8')) : load(target+'.ts');
    }
    return require(name);
  }},{filename:file});
  return exports;
}
try {
  const database=load('src/lib/postgres.ts');
  const inventory=await database.withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const columns=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])",[['anime_catalog','user_entity_status','entity_comments','user_addons','users','canonical_entities']])).rows;
    const has=(table,column)=>columns.some(row=>row.table_name===table&&row.column_name===column);
    const counts={};
    for(const table of ['anime_catalog','user_entity_status','entity_comments','user_addons','users']) {
      if(!columns.some(row=>row.table_name===table)){counts[table]={present:false};continue;}
      counts[table]={rows:Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n)};
    }
    for(const [table,column] of [['anime_catalog','canonical_entity_id'],['anime_catalog','composition_season_id'],['user_entity_status','canonical_entity_id'],['entity_comments','canonical_entity_id'],['user_addons','canonical_plugin_id'],['users','canonical_account_id']]) {
      counts[table][column]=has(table,column) ? {missing:Number((await client.query(`SELECT count(*) AS n FROM ${table} WHERE ${column} IS NULL`)).rows[0].n)} : {columnPresent:false};
    }
    if(has('anime_catalog','source_nodes_json'))counts.anime_catalog.missingSourceSnapshot=Number((await client.query('SELECT count(*) AS n FROM anime_catalog WHERE source_nodes_json IS NULL OR source_relations_json IS NULL')).rows[0].n);
    const privateColumns={users:['id','profile_private','settings_json','display_name','avatar_url'],
      user_entity_status:['id','user_id','entity_type','entity_id','activity_private','watched_seconds','total_seconds','user_score','external_source_score','user_opinion','audio_track_used','subtitle_track_used'],
      user_addons:['user_id','addon_id','config_json','enabled']};
    const privateSchemaReady=Object.entries(privateColumns).every(([table,fields])=>fields.every(field=>has(table,field)));
    const privateData=privateSchemaReady ? await load('src/lib/privateDataInventory.ts').inspectPrivateData(client)
      : {inventory:'unavailable',code:'private_schema_incomplete',privateDataReady:false};
    const publicColumns={canonical_entities:['id','visibility','owner_id'],anime_catalog:['canonical_entity_id','composition_work_id','composition_season_id','composition_universe_id'],
      user_entity_status:['canonical_entity_id','release_entity_id'],entity_comments:['canonical_entity_id','release_entity_id'],user_addons:['canonical_plugin_id']};
    const publicSchemaReady=Object.entries(publicColumns).every(([table,fields])=>fields.every(field=>has(table,field)));
    const publicBindings=publicSchemaReady ? await load('src/lib/publicBindingInventory.ts').inspectPublicBindings(client)
      : {inventory:'unavailable',code:'public_binding_schema_incomplete',publicBindingsReady:false};
    return {observedAt:new Date().toISOString(),mode:'read-only repeatable-read',counts,privateData,publicBindings};
  });
  fs.writeFileSync('.agent-runtime/planning/data-live-inventory.json',JSON.stringify(inventory,null,2));
  console.log(JSON.stringify(inventory));
  process.exit(0);
} catch(error) {
  const failure={observedAt:new Date().toISOString(),inventory:'unavailable',mode:'read-only',code:error?.message==='Database configuration unavailable' ? 'database_configuration_unavailable' : error?.code??'configuration-or-connection'};
  fs.writeFileSync('.agent-runtime/planning/data-live-inventory.json',JSON.stringify(failure,null,2));
  console.error(JSON.stringify(failure));
  process.exit(1);
}
