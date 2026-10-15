import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
import {historicalActivityFixture} from './historical-activity-fixture.mjs';
const require=createRequire(import.meta.url),modules=new Map();
const pools=[];
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/anirium_security_fixture');
assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1');
process.env.NODE_ENV='production';
function load(file) {
  file=path.resolve(file);
  if(modules.has(file))return modules.get(file);
  const exports={};modules.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,process,Buffer,URL,global:globalThis,console,require(name){
    if(name==='pg')return {...pg,Pool:class extends pg.Pool {constructor(config){super(config);pools.push(this);}}};
    if(name.startsWith('./')||name.startsWith('../')){
      const target=path.resolve(path.dirname(file),name);
      return name.endsWith('.json') ? JSON.parse(fs.readFileSync(target,'utf8')) : load(target+'.ts');
    }
    return require(name);
  }},{filename:file});return exports;
}
let server;
try {
  const database=load('src/lib/postgres.ts');
  const seedHistoricalActivity=historicalActivityFixture({database,activity:load('src/lib/privateActivity.ts'),privateData:load('src/lib/privateData.ts'),activityIndex:load('src/lib/activityEntityIndex.ts')});
  await database.ensurePostgresSchema();
  const privateData=load('src/lib/privateData.ts'),profile=load('src/lib/privateProfile.ts');
  const cookies={};
  for(const owner of ['runtime-owner','runtime-other','runtime-empty']) {
    await database.query(`INSERT INTO users(id,username,display_name,avatar_url,level_tier,badge_label,created_at,settings_json,profile_private)
      VALUES($1,$1,'Conta','',3,'Membro',$2,$3::jsonb,$4::jsonb)`,[owner,Date.now(),JSON.stringify(privateData.encryptPrivateJson({theme:'default'},privateData.profileSettingsPrivateContext(owner))),JSON.stringify(profile.encodeProfile(owner,'Runtime fixture',''))]);
    const session=load('src/lib/webSession.ts').createWebSession();
    await database.query('INSERT INTO active_session(key,user_id,updated_at) VALUES($1,$2,$3)',[session.sessionId,owner,Date.now()]);
    cookies[owner]=`__Host-anirium_web_session=${session.cookieValue}`;
  }
  const source=fs.readFileSync('src/lib/catalog.ts','utf8'),ast=ts.createSourceFile('catalog.ts',source,ts.ScriptTarget.Latest,true);
  const writer=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='saveAnimesToCatalog');
  const catalog={ensurePostgresSchema:database.ensurePostgresSchema,withTransaction:database.withTransaction,
    registerCatalogWork:load('src/lib/catalogSourceIdentity.ts').registerCatalogWork,indexCatalogHierarchy:load('src/lib/catalogHierarchyIndex.ts').indexCatalogHierarchy,
    indexCatalogTexts:load('src/lib/catalogTextVariants.ts').indexCatalogTexts,indexCatalogAssets:load('src/lib/catalogAssets.ts').indexCatalogAssets,logServerFailure:(_scope,error)=>{throw error;},Date,JSON};
  vm.runInNewContext(ts.transpileModule(writer.getText(ast),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText,catalog);
  await catalog.saveAnimesToCatalog([{mal_id:920001,idAnilist:920001,title:'Runtime fixture',images:{},genres:[],episodes:2,
    sourceNodes:[{namespace:'anilist:media',id:'920001',type:'ANIME',format:'TV',episodes:2},{namespace:'anilist:media',id:'930001',type:'ANIME',format:'TV',episodes:1}],
    sourceRelations:[{namespace:'anilist:media',fromId:'920001',fromType:'ANIME',toId:'930001',toType:'ANIME',relationType:'SEQUEL'}],
    seasons:[{id:920001},{id:930001}]}],'fixture');
  const backfill=load('src/lib/catalogBackfill.ts').backfillCatalogWorks;
  await database.query("INSERT INTO anime_catalog(mal_id,title,images_json,updated_at) VALUES(920002,'Legacy runtime fixture','{}',0)");
  async function migrationCommand(args,script='scripts/migrate-catalog-index.mjs',extraEnv={}) {
    const child=spawn(process.execPath,[script,...args],{env:{...process.env,...extraEnv},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.resume();
    const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    assert.equal(exitCode,0,'operational migration command succeeds');
    return output.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  }
  const enabledSchema='addon_enabled_cli_fixture';
  await database.query(`CREATE SCHEMA ${enabledSchema}`);
  try {
    await database.query(`CREATE TABLE ${enabledSchema}.user_addons(user_id TEXT,addon_id TEXT,enabled INTEGER NOT NULL DEFAULT 1,config_json JSONB)`);
    await database.query(`INSERT INTO ${enabledSchema}.user_addons VALUES ('cli-owner','disabled',0,'{"preserved":true}'),('cli-owner','enabled',1,'{}')`);
    const schemaEnv={PGOPTIONS:`-c search_path=${enabledSchema}`};
    const [enabledPreview]=await migrationCommand([],'scripts/migrate-addon-enabled.mjs',schemaEnv);
    assert.equal(enabledPreview.mode,'preview');assert.equal(enabledPreview.type,'integer');assert.equal(enabledPreview.rows,2);
    assert.equal((await database.queryOne(`SELECT enabled FROM ${enabledSchema}.user_addons WHERE addon_id='disabled'`)).enabled,0,'CLI preview leaves historical schema unchanged');
    const [enabledApply]=await migrationCommand(['--apply'],'scripts/migrate-addon-enabled.mjs',schemaEnv);
    assert.equal(enabledApply.changed,true);assert.equal(enabledApply.type,'boolean');
    assert.equal((await migrationCommand(['--apply'],'scripts/migrate-addon-enabled.mjs',schemaEnv))[0].changed,false);
    const enabledRows=await database.query(`SELECT addon_id,enabled,config_json FROM ${enabledSchema}.user_addons ORDER BY addon_id`);
    assert.deepEqual(enabledRows,[{addon_id:'disabled',enabled:false,config_json:{preserved:true}},{addon_id:'enabled',enabled:true,config_json:{}}]);
    console.log('Addon boolean migration CLI: actual read-only preview, integer-to-boolean apply, preserved disabled grant/config and replay passed.');
  } finally {await database.query(`DROP SCHEMA ${enabledSchema} CASCADE`);}
  const preview=await migrationCommand(['--limit','1']);
  assert.equal(preview[0].mode,'preview'); assert.equal(preview[0].remaining,'2');
  assert.equal((await database.queryOne('SELECT canonical_entity_id FROM anime_catalog WHERE mal_id=920002')).canonical_entity_id,null,'default preview never indexes records');
  const [firstPage]=await migrationCommand(['--apply','--limit','1']);
  assert.equal(firstPage.nextAfterId,920001); assert.equal(firstPage.exhausted,false);
  const identityBefore=await database.queryOne('SELECT canonical_entity_id,composition_season_id FROM anime_catalog WHERE mal_id=920001');
  await migrationCommand(['--apply','--limit','1']);
  assert.deepEqual(await database.queryOne('SELECT canonical_entity_id,composition_season_id FROM anime_catalog WHERE mal_id=920001'),identityBefore);
  const [lastPage]=await migrationCommand(['--apply','--after',String(firstPage.nextAfterId),'--limit','1']);
  assert.equal(lastPage.nextAfterId,920002); assert.equal(lastPage.exhausted,true);
  await database.query("INSERT INTO anime_catalog(mal_id,title,images_json,updated_at) VALUES(919999,'Late runtime fixture',$1::jsonb,0)",[JSON.stringify({jpg:{image_url:'https://example.invalid/late-cover.jpg'}})]);
  assert.equal((await backfill({afterId:lastPage.nextAfterId,limit:1})).processed,0);
  let cursor=0,exhausted=false;
  while(!exhausted) {const page=await backfill({afterId:cursor,limit:1});cursor=page.nextAfterId;exhausted=page.exhausted;}
  const migrated=await database.queryOne('SELECT canonical_entity_id,text_variants_json,asset_refs_json FROM anime_catalog WHERE mal_id=919999');
  assert.ok(migrated.canonical_entity_id);
  assert.ok(migrated.text_variants_json.some(v=>v.value==='Late runtime fixture'&&v.locale==='und'));
  assert.equal(migrated.asset_refs_json.length,1);
  await database.query("UPDATE anime_catalog SET synopsis='Legacy fixture description',score=0 WHERE mal_id=919999");
  await database.withTransaction(client=>load('src/lib/catalogTextVariants.ts').indexCatalogTexts(client,919999,[
    {field:'description',locale:'pt-br',form:'full',sourceKey:'fixture:verified-locale',value:'Descrição canônica da obra de teste.'},
    {field:'title',locale:'ja',form:'native',sourceKey:'fixture:verified-locale',value:'架空の作品'},
  ]));
  const black=JSON.parse(fs.readFileSync('src/lib/builtinBlackTheme.json','utf8'));
  const themeRelease=await database.queryOne('SELECT r.tokens,r.version FROM users u JOIN canonical_theme_releases r ON r.id=u.theme_release_id WHERE u.id=$1',['runtime-owner']);
  assert.deepEqual(themeRelease.tokens,black.tokens);assert.equal(themeRelease.version,black.version);
  const root=await database.queryOne('SELECT * FROM anime_catalog WHERE mal_id=920001');
  if(process.argv.includes('--sql-seed-only')) {
    await database.withTransaction(client=>load('src/lib/canonicalWatchProgress.ts').saveCanonicalWatchProgress(client,'runtime-owner',920001,root.composition_season_id,1,25,100));
    const seeded=await database.queryOne("SELECT * FROM user_entity_status WHERE user_id='runtime-owner' AND entity_type='EPISODE'");
    assert.equal(load('src/lib/privateActivity.ts').readActivity(seeded).watched_seconds,25);
    console.log('SQL-only restore baseline: native current schema/catalog/identity/texts/assets, private profiles/settings and encrypted episode progress populated; no Next process or HTTP request.');
  } else {
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p',String(port)],{env:{...process.env,NODE_ENV:'production',ANIRIUM_PUBLIC_ORIGIN:origin},stdio:['ignore','ignore','ignore'],windowsHide:true});
  let ready=false;
  for(let attempt=0;attempt<100;attempt++) {
    if(server.exitCode!==null)throw new Error('Isolated Next process exited');
    try {await fetch(origin+'/api/service/session/validate');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,200));}
  }
  assert.ok(ready,'isolated Next runtime ready');
  async function call(url,owner='runtime-owner',body,expected=200) {
    const response=await fetch(origin+url,{headers:{...(owner ? {Cookie:cookies[owner]} : {}),...(body ? {'Content-Type':'application/json',Origin:origin} : {})},...(body ? {method:'POST',body:JSON.stringify(body)} : {})});
    assert.equal(response.status,expected,`HTTP contract ${url}`);
    return {data:await response.json(),headers:response.headers};
  }
  const progressBody={action:'save_progress',animeId:920001,seasonIdx:0,episode:1,progressSeconds:25,durationSeconds:100,seasonEntityId:root.composition_season_id};
  await call('/api/user','runtime-owner',{action:'toggle_addon',addonId:'player-pro',enabled:1},400);
  await call('/api/user','runtime-owner',{action:'toggle_addon',addonId:'player-pro',enabled:false});
  assert.equal((await database.queryOne("SELECT enabled FROM user_addons WHERE user_id='runtime-owner' AND addon_id='player-pro'")).enabled,false);
  assert.equal((await call('/api/sources?action=list_addons','runtime-owner')).data.addons.find(addon=>addon.id==='player-pro').enabled,false);
  assert.equal((await call('/api/sources?action=list_addons','runtime-other')).data.addons.find(addon=>addon.id==='player-pro').enabled,true,'disabled preference belongs only to its account');
  await call('/api/user','runtime-owner',{action:'toggle_addon',addonId:'player-pro',enabled:true});
  assert.equal((await call('/api/sources?action=list_addons','runtime-owner')).data.addons.find(addon=>addon.id==='player-pro').enabled,true);
  console.log('Addon boolean HTTP: integer mutation rejected, native false/true stored and displayed, other account isolated.');
  await database.query("DELETE FROM user_addons WHERE user_id='runtime-owner' AND addon_id='player-pro'");
  const {seasonEntityId: omittedSeason,...oldProgressBody}=progressBody;
  await call('/api/user','runtime-owner',oldProgressBody,400);
  assert.equal((await database.queryOne("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='runtime-owner'")).n,0,'missing canonical season rejected without activity writes');
  const publicCatalog=(await call('/api/catalog',null)).data;
  const recovered=publicCatalog.all.find(anime=>anime.mal_id===919999);
  assert.ok(recovered,'migrated low-ID record is visible through actual catalog HTTP reader');
  assert.equal(recovered.assetRefs[0].assetId,migrated.asset_refs_json[0].assetId);
  const movedVisual=await database.withTransaction(client=>load('src/lib/assetLocations.ts').registerAssetLocation(client,{logicalKey:JSON.stringify([919999,'cover.jpg.image_url']),sourceKey:'catalog:visual',backend:'https',locator:'https://example.org/runtime-current-cover.jpg',entityId:migrated.composition_season_id,slot:'cover.jpg.image_url'}));
  const currentVisual=(await call('/api/catalog',null)).data.all.find(anime=>anime.mal_id===919999);
  assert.equal(currentVisual.images.jpg.image_url,'https://example.org/runtime-current-cover.jpg','HTTP catalog resolves current location without raw image update');
  assert.equal(currentVisual.assetRefs.find(ref=>ref.assetId===movedVisual.assetId).revision,movedVisual.revision);
  assert.equal(recovered.synopsis,'Descrição canônica da obra de teste.');assert.equal(recovered.title_japanese,'架空の作品');assert.equal(recovered.score,0);
  assert.equal((await call('/api/user','runtime-owner',progressBody)).data.success,true);
  const status=await database.queryOne("SELECT * FROM user_entity_status WHERE user_id='runtime-owner' AND entity_type='EPISODE'");
  const bookmarkBody={action:'toggle_bookmark',entityType:'EPISODE',parentSeriesId:920001,seasonIdx:0,episodeNumber:1,seasonEntityId:root.composition_season_id};
  await call('/api/user','runtime-owner',{...bookmarkBody,entityId:'920001:s0:e1'},400);
  for (const invalid of [{seasonEntityId:null},{episodeNumber:0},{episodeNumber:'1'},{parentSeriesId:0}]) await call('/api/user','runtime-owner',{...bookmarkBody,...invalid},400);
  assert.equal((await call('/api/user','runtime-owner',bookmarkBody)).data.isBookmarked,true);
  await database.query('UPDATE anime_catalog SET seasons_json=$1::jsonb WHERE mal_id=920001',[JSON.stringify([{id:930001,title:'Runtime second release',seasonNumber:1,episodes:1,format:'TV'},{id:920001,title:'Runtime first release',seasonNumber:2,episodes:2,format:'TV'}])]);
  const progressUrl=`/api/progress?animeId=920001&seasonIdx=1&seasonEntityId=${root.composition_season_id}`;
  const progress=await call(progressUrl);
  assert.equal(progress.data.episodes.length,1);assert.equal(progress.data.episodes[0].watchedSeconds,25);
  const exactProgressUrl=progressUrl+`&episodeEntityId=${status.canonical_entity_id}`;
  const exactProgress=(await call(exactProgressUrl)).data.episodes;
  assert.equal(exactProgress.length,1);assert.equal(exactProgress[0].canonicalEntityId,status.canonical_entity_id);
  assert.equal(exactProgress[0].seasonEntityId,root.composition_season_id);assert.equal(exactProgress[0].number,1);
  assert.equal((await call(exactProgressUrl,'runtime-other')).data.episodes.length,0);
  assert.equal((await call(progressUrl+`&episodeEntityId=${crypto.randomUUID()}`)).data.episodes.length,0);
  await call(progressUrl+'&episodeEntityId=920001:s0:e1','runtime-owner',undefined,400);
  await call(exactProgressUrl+`&episodeEntityId=${crypto.randomUUID()}`,'runtime-owner',undefined,400);
  assert.match(progress.headers.get('cache-control'),/private.*no-store/);
  assert.equal((await call(progressUrl,'runtime-other')).data.episodes.length,0);
  const ownContext=(await call('/api/user')).data;
  assert.equal(ownContext.bookmarkItems[0].seasonIdx,1);assert.equal(ownContext.bookmarkItems[0].seasonEntityId,root.composition_season_id);
  assert.equal((await call('/api/user?action=get_all_statuses&entity_type=EPISODE')).data.statuses[0].season_idx,1);
  const assessment={action:'save_entity_status',entityType:'EPISODE',entityId:status.entity_id};
  const assessmentUrl=`/api/user?action=get_entity_status&entity_type=EPISODE&entity_id=${status.entity_id}`;
  await call('/api/user','runtime-owner',{...assessment,entityId:'920001:s0:e1'},400);
  await call('/api/user?action=get_entity_status&entity_type=EPISODE&entity_id=920001:s0:e1','runtime-owner',undefined,400);
  await call('/api/user','runtime-owner',{...assessment,status:'on_hold',containsSpoilers:true,userScore:0,externalScore:8,userOpinion:'Private fixture assessment'});
  let assessed=(await call(assessmentUrl)).data.status;
  assert.equal(assessed.user_score,0);assert.equal(assessed.external_source_score,8);assert.equal(assessed.user_opinion,'Private fixture assessment');
  await call('/api/user','runtime-owner',{...assessment,userOpinion:'Changed fixture assessment'});
  assessed=(await call(assessmentUrl)).data.status;
  assert.equal(assessed.status,'on_hold');assert.equal(assessed.contains_spoilers,true);assert.equal(assessed.user_score,0);
  assert.equal((await call(assessmentUrl,'runtime-other')).data.status,null);
  await call('/api/user','runtime-owner',{...assessment,userScore:null,externalScore:null,userOpinion:''});
  assessed=(await call(assessmentUrl)).data.status;
  assert.equal(assessed.user_score,null);assert.equal(assessed.external_source_score,null);assert.equal(assessed.user_opinion,'');
  assert.equal(assessed.status,'on_hold');assert.equal(assessed.contains_spoilers,true);assert.equal(assessed.watched_seconds,25);
  const assessedRaw=await database.queryOne('SELECT user_score,user_opinion,activity_private FROM user_entity_status WHERE id=$1',[status.id]);
  assert.equal(assessedRaw.user_score,null);assert.equal(assessedRaw.user_opinion,null);assert.equal(assessedRaw.activity_private._anirium_private,1);
  let pendingActivity;
  try {
    await database.withTransaction(async holder=>{
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
      pendingActivity=load('src/lib/privateActivity.ts').writeActivity('runtime-owner','EPISODE',status.entity_id,{},{});
      let waiting=false;
      for(let attempt=0;attempt<100&&!waiting;attempt++) {
        waiting=!!await database.queryOne("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'SELECT pg_advisory_xact_lock_shared%' LIMIT 1");
        if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.ok(waiting,'actual activity writer waits for the held hierarchy lock');
      await holder.query('SELECT id FROM user_entity_status WHERE id=$1 FOR UPDATE NOWAIT',[status.id]);
    });
  } finally {if(pendingActivity)await pendingActivity;}
  const commentBody={action:'add_comment',entityType:'EPISODE',entityId:status.entity_id,content:'Public fixture comment'};
  await call('/api/user','runtime-owner',{...commentBody,entityId:'920001:s0:e1'},400);
  const comment=(await call('/api/user','runtime-owner',commentBody)).data;
  assert.ok(comment.commentId);
  await database.query("UPDATE entity_comments SET entity_id='920001:s0:e1' WHERE id=$1",[comment.commentId]);
  await call('/api/user','runtime-other',{...commentBody,parentCommentId:comment.commentId,content:'Public fixture reply'});
  const discussion=`/api/user?action=get_entity_status&entity_type=EPISODE&entity_id=${status.entity_id}&limit=1`;
  const first=(await call(discussion)).data;
  assert.equal(first.status.watched_seconds,25);assert.equal(first.comments.length,1);assert.ok(first.nextCommentCursor);
  assert.equal(first.status.entity_id,status.canonical_entity_id);
  assert.equal(first.comments[0].entity_id,status.canonical_entity_id,'migrated discussion returns canonical public identity');
  assert.equal(first.comments[0].id,comment.commentId,'comment record identity is preserved');
  const second=(await call(discussion+'&cursor='+encodeURIComponent(first.nextCommentCursor))).data;
  assert.equal(second.comments.length,1);assert.notEqual(second.comments[0].id,first.comments[0].id);
  assert.equal((await call(discussion,'runtime-other')).data.status,null,'HTTP account state isolation');
  const otherSeason=root.composition_seasons_json['930001'];
  assert.equal((await call(`/api/progress?animeId=920001&seasonIdx=0&seasonEntityId=${otherSeason}`)).data.episodes.length,0);
  assert.equal((await call(`/api/progress?animeId=920001&seasonIdx=0&seasonEntityId=${otherSeason}&episodeEntityId=${status.canonical_entity_id}`)).data.episodes.length,0,'episode proof cannot cross into another release');
  await call('/api/user','runtime-owner',{...bookmarkBody,seasonIdx:1});
  assert.equal((await call('/api/user')).data.bookmarkItems.length,0,'HTTP removal does not resurrect aliases');
  await call('/api/user','runtime-owner',bookmarkBody);
  const beforeRemoval=await database.queryOne("SELECT activity_private,completed,status FROM user_entity_status WHERE id=$1",[status.id]);
  await call('/api/user','runtime-other',{action:'remove_bookmark',entityType:'EPISODE',entityId:status.canonical_entity_id});
  assert.equal((await call('/api/user')).data.bookmarkItems.length,1,'other account cannot remove own canonical favorite');
  await call('/api/user','runtime-owner',{action:'remove_bookmark',entityType:'EPISODE',entityId:'920001:s0:e1'},400);
  for(let replay=0;replay<2;replay++) await call('/api/user','runtime-owner',{action:'remove_bookmark',entityType:'EPISODE',entityId:status.canonical_entity_id});
  assert.equal((await call('/api/user')).data.bookmarkItems.length,0);
  assert.deepEqual(await database.queryOne("SELECT activity_private,completed,status FROM user_entity_status WHERE id=$1",[status.id]),beforeRemoval,'canonical removal preserves progress and assessment');
  const nativeActivity=load('src/lib/privateActivity.ts');
  const latestStored=await database.queryOne('SELECT * FROM user_entity_status WHERE id=$1',[status.id]);
  await seedHistoricalActivity('runtime-owner','EPISODE','920001:s1:e1',{parentSeriesId:920001,seasonIdx:1,episodeNumber:1,status:latestStored.status,completed:latestStored.completed,containsSpoilers:latestStored.contains_spoilers},nativeActivity.readActivity(latestStored));
  const historicalState=await database.queryOne("SELECT * FROM user_entity_status WHERE user_id='runtime-owner' AND entity_id='920001:s1:e1'");
  assert.equal(historicalState.canonical_entity_id,status.canonical_entity_id);
  const historicalResponse=(await call(assessmentUrl)).data.status;
  assert.equal(historicalResponse.entity_id,status.canonical_entity_id,'public status identity is canonical after decrypting original AAD');
  assert.equal(historicalResponse.id,historicalState.id);
  assert.equal(historicalResponse.watched_seconds,25);
  assert.deepEqual((await database.queryOne('SELECT activity_private FROM user_entity_status WHERE id=$1',[historicalState.id])).activity_private,historicalState.activity_private,'read normalization never rewrites ciphertext');
  await database.query('UPDATE user_entity_status SET parent_series_id=2147483000,episode_number=99 WHERE id=$1',[historicalState.id]);
  const canonicalList=(await call('/api/user?action=get_all_statuses&entity_type=EPISODE&limit=20')).data.statuses;
  assert.equal(canonicalList.length,1,'status listing contains one canonical launch');
  assert.equal(canonicalList[0].entity_id,status.canonical_entity_id);
  assert.equal(canonicalList[0].id,historicalState.id);
  assert.equal(canonicalList[0].watched_seconds,25);
  assert.equal(canonicalList[0].parent_series_id,920001,'HTTP status derives route from canonical release rather than stale metadata');
  assert.equal(canonicalList[0].episode_number,1,'HTTP episode ordinal comes from canonical membership');
  await database.query('UPDATE user_entity_status SET is_favorite=TRUE WHERE id=$1',[historicalState.id]);
  const projectedFavorite=(await call('/api/user')).data.bookmarkItems.find(item=>item.entityId===status.canonical_entity_id);
  assert.ok(projectedFavorite);
  assert.equal(projectedFavorite.animeId,920001,'HTTP favorite route ignores stale metadata');
  assert.equal(projectedFavorite.episodeNumber,1,'HTTP favorite ordinal follows canonical membership');
  const resumeHistory=(await call('/api/user?action=get_history')).data.history;
  assert.equal(resumeHistory.length,1);
  assert.equal(resumeHistory[0].animeId,920001,'HTTP history ignores old route');
  assert.equal(resumeHistory[0].episodeNumber,1,'HTTP history derives canonical ordinal');
  assert.equal(resumeHistory[0].seasonIdx,1,'HTTP history follows reordered release');
  assert.equal(resumeHistory[0].resumeAvailable,true);
  assert.equal(resumeHistory[0].progressSeconds,25);
  assert.equal((await call('/api/user?action=get_history','runtime-other')).data.history.length,0);
  await database.query('UPDATE user_entity_status SET is_favorite=FALSE WHERE id=$1',[historicalState.id]);
  assert.deepEqual((await database.queryOne('SELECT activity_private FROM user_entity_status WHERE id=$1',[historicalState.id])).activity_private,historicalState.activity_private);
  await database.query('UPDATE user_entity_status SET parent_series_id=920001,episode_number=1 WHERE id=$1',[historicalState.id]);
  const rootWork=(await database.queryOne('SELECT composition_work_id FROM anime_catalog WHERE mal_id=920001')).composition_work_id;
  await call('/api/user','runtime-owner',{action:'save_entity_status',entityType:'SERIES',entityId:rootWork,userScore:0});
  await seedHistoricalActivity('runtime-owner','SERIES','historical-work-fixture',{}, {user_score:0,user_opinion:'Historical bound work opinion'});
  await database.query("UPDATE user_entity_status SET canonical_entity_id=$1 WHERE user_id='runtime-owner' AND entity_id='historical-work-fixture'",[rootWork]);
  const storedAggregate=await database.queryOne("SELECT * FROM user_entity_status WHERE user_id='runtime-owner' AND entity_id='historical-work-fixture'");
  const aggregateResponse=(await call(`/api/user?action=get_entity_status&entity_type=SERIES&entity_id=${rootWork}`)).data.status;
  assert.equal(aggregateResponse.id,storedAggregate.id,'HTTP canonical work read selects bound aggregate record');
  assert.equal(aggregateResponse.entity_id,rootWork);
  assert.equal(aggregateResponse.user_opinion,'Historical bound work opinion');
  assert.equal((await call(`/api/user?action=get_entity_status&entity_type=SERIES&entity_id=${rootWork}`,'runtime-other')).data.status,null);
  assert.deepEqual((await database.queryOne('SELECT activity_private FROM user_entity_status WHERE id=$1',[storedAggregate.id])).activity_private,storedAggregate.activity_private);
  await call('/api/user','runtime-owner',{action:'save_entity_status',entityType:'SERIES',entityId:rootWork,userScore:0});
  const updatedAggregate=(await call(`/api/user?action=get_entity_status&entity_type=SERIES&entity_id=${rootWork}`)).data.status;
  assert.equal(updatedAggregate.id,storedAggregate.id,'HTTP partial assessment reuses latest bound aggregate');
  assert.equal(updatedAggregate.user_opinion,'Historical bound work opinion','partial assessment preserves omitted private opinion');
  assert.equal(updatedAggregate.user_score,0);
  assert.equal((await database.queryOne('SELECT entity_id FROM user_entity_status WHERE id=$1',[storedAggregate.id])).entity_id,storedAggregate.entity_id,'HTTP write preserves original AAD identity');
  const workList=(await call('/api/user?action=get_all_statuses&entity_type=SERIES&limit=20')).data.statuses;
  const listedWork=workList.find(row=>row.entity_id===rootWork);
  assert.ok(listedWork);assert.equal(listedWork.parent_series_id,920001,'HTTP work navigation derives actual catalog route from canonical index');
  assert.equal(listedWork.user_score,0);
  const workFavorite={action:'toggle_bookmark',entityType:'SERIES',entityId:rootWork};
  await call('/api/user','runtime-owner',{action:'toggle_bookmark',animeId:920001},400);
  await call('/api/user','runtime-owner',{...workFavorite,entityId:'920001'},400);
  const favoritedWork=(await call('/api/user','runtime-owner',workFavorite)).data;
  assert.equal(favoritedWork.isBookmarked,true);
  assert.ok(favoritedWork.bookmarks.includes(920001),'HTTP UUID work favorite returns canonical catalog navigation');
  const unfavoritedWork=(await call('/api/user','runtime-owner',workFavorite)).data;
  assert.equal(unfavoritedWork.isBookmarked,false);
  assert.equal(unfavoritedWork.bookmarks.includes(920001),false,'HTTP unfavorite removes work from navigation');
  for(const [entityType,entityId] of [['UNIVERSE',root.composition_universe_id],['SERIES',rootWork],['SEASON',root.composition_season_id]]) {
    await nativeActivity.writeActivity('runtime-owner',entityType,entityId,{}, {watched_seconds:8,user_opinion:'Private removal fixture'});
    await database.query("UPDATE user_entity_status SET is_favorite=TRUE WHERE user_id='runtime-owner' AND entity_type=$1 AND canonical_entity_id=$2",[entityType,entityId]);
    const listed=(await call('/api/user')).data.bookmarkItems.filter(item=>item.entityType===entityType&&item.entityId===entityId);
    assert.equal(listed.length,1,'HTTP all degree favorite projection supplies canonical deletion target');
    await call('/api/user','runtime-owner',{action:'remove_bookmark',entityType,entityId:'old-coordinate'},400);
    for(let replay=0;replay<2;replay++) {
      const removed=(await call('/api/user','runtime-owner',{action:'remove_bookmark',entityType,entityId})).data;
      assert.equal(removed.bookmarkItems.some(item=>item.entityType===entityType&&item.entityId===entityId),false);
    }
    const preserved=await database.queryOne("SELECT * FROM user_entity_status WHERE user_id='runtime-owner' AND entity_type=$1 AND canonical_entity_id=$2 ORDER BY COALESCE(updated_at,TIMESTAMPTZ '1970-01-01') DESC,id DESC LIMIT 1",[entityType,entityId]);
    assert.equal(nativeActivity.readActivity(preserved).watched_seconds,8);
    assert.equal(nativeActivity.readActivity(preserved).user_opinion,'Private removal fixture');
    if(entityType!=='SERIES') {
      const toggle={action:'toggle_bookmark',entityType,entityId};
      await call('/api/user','runtime-owner',{...toggle,entityId:'old-coordinate'},400);
      await call('/api/user','runtime-owner',{...toggle,seasonEntityId:crypto.randomUUID()},400);
      assert.equal((await call('/api/user','runtime-owner',toggle)).data.isBookmarked,true);
      assert.equal((await call('/api/user','runtime-owner',toggle)).data.isBookmarked,false);
      assert.equal(nativeActivity.readActivity(await database.queryOne("SELECT * FROM user_entity_status WHERE user_id='runtime-owner' AND entity_type=$1 AND entity_id=$2",[entityType,entityId])).user_opinion,'Private removal fixture');
    }
  }
  await call('/api/user','runtime-owner',{...progressBody,seasonEntityId:crypto.randomUUID()},409);
  const accountScript='scripts/migrate-account-index.mjs';
  const longOwner='legacy-'+ 'a'.repeat(120);
  await database.query("INSERT INTO users(id,username,display_name,created_at,settings_json,profile_private) VALUES($1,'runtime-long-owner','Conta',0,$2::jsonb,$3::jsonb)",[longOwner,JSON.stringify(privateData.encryptPrivateJson({},privateData.profileSettingsPrivateContext(longOwner))),JSON.stringify(profile.encodeProfile(longOwner,'Long owner fixture',''))]);
  for(const scope of ['identity','activities','comments','addons']) {
    const args=['--scope',scope,'--owner',longOwner];
    assert.equal((await migrationCommand(args,accountScript))[0].mode,'preview');
    const applied=await migrationCommand([...args,'--apply'],accountScript);
    assert.equal(applied.at(-1).exhausted,true,'all operational scopes accept the existing long owner contract');
  }
  const emptyBefore=await database.queryOne("SELECT profile_private,settings_json FROM users WHERE id='runtime-empty'");
  const identityArgs=['--scope','identity','--owner','runtime-empty'];
  assert.equal((await migrationCommand(identityArgs,accountScript))[0].remaining,'1');
  assert.equal((await database.queryOne("SELECT canonical_account_id FROM users WHERE id='runtime-empty'")).canonical_account_id,null);
  await migrationCommand([...identityArgs,'--apply'],accountScript);
  const emptyIdentity=(await database.queryOne("SELECT canonical_account_id FROM users WHERE id='runtime-empty'")).canonical_account_id;
  await migrationCommand([...identityArgs,'--apply'],accountScript);
  assert.equal((await database.queryOne("SELECT canonical_account_id FROM users WHERE id='runtime-empty'")).canonical_account_id,emptyIdentity);
  assert.deepEqual(await database.queryOne("SELECT profile_private,settings_json FROM users WHERE id='runtime-empty'"),emptyBefore);
  const emptyEntity=await database.queryOne('SELECT kind,owner_id,visibility FROM canonical_entities WHERE id=$1',[emptyIdentity]);
  assert.deepEqual(emptyEntity,{kind:'ACCOUNT',owner_id:'runtime-empty',visibility:'account-private'});
  assert.equal((await database.queryOne("SELECT count(*)::int AS n FROM user_addons WHERE user_id='runtime-empty'")).n,0);
  for(const owner of ['runtime-owner','runtime-other'])await database.query('INSERT INTO user_addons(user_id,addon_id,enabled,installed_at,config_json) VALUES($1,$2,FALSE,0,$3::jsonb)',[owner,'player-pro',JSON.stringify(privateData.encryptPrivateJson({id:'player-pro',fixtureSetting:owner},privateData.addonPrivateContext(owner,'player-pro')))]);
  const privateBefore=await database.query("SELECT id,entity_id,activity_private FROM user_entity_status WHERE user_id='runtime-owner' ORDER BY id");
  const addonBefore=await database.queryOne("SELECT enabled,config_json FROM user_addons WHERE user_id='runtime-owner' AND addon_id='player-pro'");
  for(const scope of ['activities','comments','addons']) {
    const args=['--scope',scope,'--owner','runtime-owner','--limit','1'];
    const [preview]=await migrationCommand(args,accountScript);
    assert.equal(preview.mode,'preview');assert.ok(Number(preview.remaining)>0);
    const pages=await migrationCommand([...args,'--apply','--pages','100'],accountScript);
    assert.ok(pages.every(page=>page.mode==='committed'&&page.processed<=1));
    assert.equal(pages.at(-1).exhausted,true);
    await migrationCommand([...args,'--apply','--pages','100'],accountScript);
  }
  assert.deepEqual(await database.query("SELECT id,entity_id,activity_private FROM user_entity_status WHERE user_id='runtime-owner' ORDER BY id"),privateBefore,'account CLI preserves legacy IDs and private envelopes exactly');
  const addonAfter=await database.queryOne("SELECT enabled,config_json,canonical_plugin_id,selected_release_id FROM user_addons WHERE user_id='runtime-owner' AND addon_id='player-pro'");
  assert.equal(addonAfter.enabled,addonBefore.enabled);assert.deepEqual(addonAfter.config_json,addonBefore.config_json);
  assert.ok(addonAfter.canonical_plugin_id&&addonAfter.selected_release_id);
  assert.equal((await database.queryOne("SELECT canonical_plugin_id FROM user_addons WHERE user_id='runtime-other' AND addon_id='player-pro'")).canonical_plugin_id,null,'account CLI never migrates another account');
  const [resumePage]=await migrationCommand(['--scope','addons','--owner','runtime-owner','--after','player-pro','--apply'],accountScript);
  assert.equal(resumePage.processed,0);assert.equal(resumePage.exhausted,true);
  if(process.env.ANIRIUM_VERIFY_BROWSER==='1')await (await import('./verify-canonical-browser.mjs')).verifyCanonicalBrowser(origin,{
    cookieValue:cookies['runtime-owner'].split('=')[1],seasonEntityId:otherSeason,workEntityId:rootWork,
    own:async()=>(await call('/api/user')).data,
    other:async()=>(await call('/api/user','runtime-other')).data,
  });
  console.log('Actual built Next + disposable PostgreSQL: authenticated progress/favorites/comments, season reorder, private account isolation, current status coordinates, cursor pagination and stale-release rejection passed.');
  console.log('Catalog migration + HTTP: committed page resume, identity-preserving replay, final low-ID reconciliation, legacy text provenance and canonical asset projection passed.');
  console.log('Operational migration CLI: default read-only preview, committed cursor output, explicit resume and replay passed.');
  console.log('Private assessment HTTP: zero score, explicit null/empty clearing, omitted metadata preservation, AEAD plaintext removal and account isolation passed.');
  console.log('Activity lock order: real concurrent writer waits on hierarchy before locking activity row; holder obtains row NOWAIT and writer completes after release.');
  console.log('Account migration CLI: real preview/paged apply/replay/resume for activity, comments and addons; owner scope, original IDs/ciphertext/config and disabled grants preserved.');
  console.log('Account identity: native helper + CLI binds account without addons, preserves private profile/settings, owner scope and stable identity on replay.');
  console.log('Legacy owner CLI: all four scopes accept a 127-character owner with native account binding and bounded empty-page completion.');
  }
} finally {
  if(server){server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);});}
  await Promise.all(pools.map(pool=>pool.end()));
}
process.exit(0);
