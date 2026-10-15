import assert from 'node:assert/strict';
import pg from 'pg';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {projectTypescript} from './lib/project-typescript.mjs';
import {mediaDetailsFixture} from './fixtures/media-details.mjs';
const require = createRequire(import.meta.url);
const privateData = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/privateData.ts','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText, {exports:privateData,require,process,Buffer,console});

// Only disposable databases owned by the isolated wrapper are accepted.
const source = new URL(process.env.DATABASE_URL);
assert.equal(source.hostname, '127.0.0.1');
assert.equal(source.pathname, '/anirium_security_fixture');
const target = new URL(source); target.pathname = '/anirium_restore_fixture';
const pools = [source, target].map(url => new pg.Pool({connectionString: url.href}));
let restoredRuntime;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function compareSnapshots(actual,expected,message) {
  assert.deepEqual(Object.keys(actual.rows),Object.keys(expected.rows),message+': table set');
  for(const table of Object.keys(expected.rows))assert.equal(digest(actual.rows[table]),digest(expected.rows[table]),message+': complete row multiset '+table);
  for(const component of ['constraints','indexes','triggers','sequences','columns','functions'])
    assert.equal(digest(actual[component]),digest(expected[component]),message+': '+component);
}
// PostgreSQL decompiles CHECK expressions; dump/reparse can flatten ANDs or
// distribute array casts. Reparse both through the same server, without regex
// removal of conditions. Temporary tables contain no business records.
async function canonicalChecks(client,constraints) {
  const quote=name=>'"'+name.replaceAll('"','""')+'"';
  for(const table of new Set(constraints.filter(item=>item.type==='c').map(item=>item.relname))) {
    await client.query(`CREATE TEMP TABLE restore_constraint_normalization (LIKE public.${quote(table)} INCLUDING GENERATED)`);
    try {
      for(const item of constraints.filter(item=>item.relname===table && item.type==='c')) {
        let stable=false;
        for(let attempt=0;attempt<3;attempt++) {
          await client.query(`ALTER TABLE pg_temp.restore_constraint_normalization ADD CONSTRAINT restore_check ${item.definition}`);
          const value=(await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='pg_temp.restore_constraint_normalization'::regclass AND conname='restore_check'")).rows[0].definition;
          await client.query('ALTER TABLE pg_temp.restore_constraint_normalization DROP CONSTRAINT restore_check');
          if(value===item.definition){stable=true;break;}
          item.definition=value;
        }
        assert.ok(stable,'PostgreSQL CHECK reconstruction reaches a stable form: '+item.conname);
      }
    } finally {await client.query('DROP TABLE pg_temp.restore_constraint_normalization');}
  }
}
async function snapshot(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
    const rows = {};
    for (const {tablename} of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      // Keep duplicates: equality must prove the entire row multiset, including ciphertext.
      rows[tablename] = (await client.query(`SELECT to_jsonb(t)::text AS value FROM public.${quoted} t ORDER BY value`)).rows.map(row => row.value);
    }
    const constraints = (await client.query(`SELECT c.relname, k.conname,k.contype AS type,k.convalidated,k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY c.relname,k.conname`)).rows;
    const indexes = (await client.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
    const triggers = (await client.query(`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
    const sequences = (await client.query(`SELECT sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size
      FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows;
    for (const sequence of sequences) {
      const quoted = '"' + sequence.sequencename.replaceAll('"','""') + '"';
      sequence.state = (await client.query(`SELECT last_value::text,is_called FROM public.${quoted}`)).rows[0];
    }
    const columns=(await client.query(`SELECT table_name,column_name,data_type,is_nullable,column_default,is_generated,generation_expression
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
    assert.equal(columns.find(column=>column.table_name==='user_addons' && column.column_name==='enabled').data_type,'boolean');
    assert.equal(columns.find(column=>column.table_name==='user_addons' && column.column_name==='enabled').is_nullable,'NO');
    const functions=(await client.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
      ORDER BY p.proname,arguments`)).rows;
    await client.query('COMMIT');
    await canonicalChecks(client,constraints);
    return {rows,constraints,indexes,triggers,sequences,columns,functions};
  } finally { client.release(); }
}
try {
  const before = await snapshot(pools[0]), after = await snapshot(pools[1]);
  assert.ok(Object.keys(before.rows).length > 10, 'actual schema populated');
  assert.ok(before.rows.user_entity_status.length > 0, 'private activity fixture populated');
  assert.ok(before.rows.entity_comments.length > 0, 'discussion fixture populated');
  for(const table of ['canonical_arcs','canonical_arc_episodes','canonical_text_variants','canonical_content_facts','canonical_content_fact_heads',
    'canonical_ingestion_checkpoints','canonical_ingestion_commits','canonical_ingestion_batches','canonical_ingestion_batch_items',
    'canonical_collection_windows','canonical_collection_pages','canonical_collection_schedules','canonical_collection_retries',
    'canonical_media_refresh_jobs','canonical_media_refresh_receipts','canonical_media_refresh_retries','canonical_dataset_files','canonical_dataset_batches','canonical_dataset_items','canonical_dataset_archives'])
    assert.ok(before.rows[table]?.length>0,`${table} has real records before backup`);
  compareSnapshots(after,before,'restore preserves all public data and schema');
  process.env.DATABASE_URL=target.href;process.env.NODE_ENV='production';
  restoredRuntime=projectTypescript();
  const client = await pools[1].connect();
  try {
    await client.query('BEGIN');
    const restoredDataset=(await client.query('SELECT * FROM canonical_dataset_files WHERE sha256=$1',['d'.repeat(64)])).rows[0];
    assert.ok(restoredDataset);assert.equal(Number(restoredDataset.next_row),2);assert.equal(Number(restoredDataset.revision),1);
    const restoredBatch=(await client.query('SELECT * FROM canonical_dataset_batches WHERE file_id=$1',[restoredDataset.id])).rows[0];
    const restoredArchive=await restoredRuntime.load('src/lib/imdbIndexedArchiveStore.ts').readImdbIndexedArchiveDescriptor(client,restoredDataset.id);
    assert.equal(restoredArchive.directoryId,'af000000-0000-4000-8000-000000000007');assert.equal(restoredArchive.manifest.rowCount,3);assert.equal(restoredArchive.batchCount,1);
    assert.ok(restoredArchive.indexByteSize>0 && restoredArchive.dataByteSize>0);
    await restoredRuntime.load('src/lib/imdbIndexedArchiveStore.ts').registerImdbIndexedArchiveDescriptor(client,restoredDataset.id,restoredArchive);

    assert.equal(Number(restoredBatch.applied_count),1);assert.equal(Number(restoredBatch.unmatched_count),1);
    const resumedDataset=await restoredRuntime.load('src/lib/imdbDatasetBatch.ts').commitImdbDatasetBatch(client,restoredDataset.id,1,['tt4444444\t8.5\t10']);
    assert.equal(resumedDataset.complete,true);assert.equal(resumedDataset.appliedCount,1);
    const restoredImdbFacts=(await client.query("SELECT f.field,f.value FROM canonical_content_facts f JOIN canonical_aliases a ON a.id=f.alias_id WHERE a.namespace='imdb:title' AND a.value='tt4444444'")).rows;
    assert.equal(restoredImdbFacts.find(row=>row.field==='media.averageRating').value,8.5);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('SAVEPOINT invalid_restored_dataset');
    await assert.rejects(client.query('UPDATE canonical_dataset_files SET sha256=$2 WHERE id=$1',[restoredDataset.id,'e'.repeat(64)]),error=>error.code==='23514');
    await client.query('ROLLBACK TO SAVEPOINT invalid_restored_dataset');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    const changedRule=JSON.parse(JSON.stringify(before.constraints.find(item=>item.conname==='activity_arc_scope')));
    assert.ok(changedRule?.definition.includes("'on_hold'"));
    changedRule.definition=changedRule.definition.replace("'on_hold'","'invalid_hold'");
    await canonicalChecks(client,[changedRule]);
    assert.notEqual(digest(changedRule),digest(before.constraints.find(item=>item.conname==='activity_arc_scope')),'server canonicalization must detect a changed accepted state');
    const pendingId='af000000-0000-4000-8000-000000000001',scope=`schedule:${pendingId}:0`;
    const collection=restoredRuntime.load('src/lib/collectionWindow.ts'),schedule=restoredRuntime.load('src/lib/collectionSchedule.ts');
    const pending=await collection.startAiringCollection(client,scope,1000,11000);
    assert.equal(pending.next_page,2);assert.equal(pending.status,'collecting');
    const sourceEvent=(await restoredRuntime.load('src/lib/canonicalAiringReader.ts').readCanonicalAiringPage(client,{start:1000,end:11000,sourceKey:'anilist:airing-schedule'})).items.find(item=>item.externalId==='940001');
    assert.ok(sourceEvent);assert.equal(sourceEvent.scheduledAt,4000);assert.equal(sourceEvent.cancelled,false);
    const typedFacts=(await client.query("SELECT field,value_type,value FROM canonical_content_facts WHERE field LIKE 'restore.%' ORDER BY field")).rows;
    assert.equal(typedFacts.find(row=>row.field==='restore.score').value,0);
    assert.equal(typedFacts.find(row=>row.field==='restore.enabled').value,false);
    assert.equal(typedFacts.find(row=>row.field==='restore.absent').value,null);
    assert.equal(typedFacts.find(row=>row.field==='restore.note').value,'Dados próprios 日本語');
    const arcState=(await client.query("SELECT * FROM user_entity_status WHERE user_id='runtime-owner' AND entity_type='ARC'")).rows[0];
    assert.ok(arcState);assert.equal(arcState.is_favorite,true);assert.equal(arcState.completed,false);
    assert.equal(restoredRuntime.load('src/lib/privateActivity.ts').readActivity(arcState).user_score,0);
    assert.equal(restoredRuntime.load('src/lib/privateActivity.ts').readActivity(arcState).user_opinion,'Opinião ARC restaurável');
    assert.throws(()=>restoredRuntime.load('src/lib/privateActivity.ts').readActivity({...arcState,user_id:'runtime-other'}));
    const retry=(await client.query('SELECT * FROM canonical_collection_retries WHERE schedule_id=$1',[pendingId])).rows[0];
    assert.equal(Number(retry.retry_at),120000);assert.equal(retry.failures,1);
    const resumed=await collection.acceptAiringCollectionPage(client,{scope,page:2,observedAt:3000,hasMore:false,entries:[]});
    assert.equal(resumed.revision,2);
    await schedule.advanceCollectionSchedule(client,pendingId,0,120000);
    const advanced=(await client.query('SELECT * FROM canonical_collection_schedules WHERE id=$1',[pendingId])).rows[0];
    assert.equal(Number(advanced.sequence),1);assert.equal(Number(advanced.next_start),9000);
    const refresh=restoredRuntime.load('src/lib/mediaRefresh.ts');
    const restoredRefresh=(await client.query(`SELECT j.*,a.value FROM canonical_media_refresh_jobs j JOIN canonical_aliases a ON a.id=j.alias_id
      WHERE a.namespace='anilist:season' AND a.value IN ('940010','940011') ORDER BY a.value`)).rows;
    assert.equal(restoredRefresh.length,2);
    assert.equal(Number(restoredRefresh[0].revision),1);assert.equal(Number(restoredRefresh[1].revision),0);
    assert.equal(Number((await client.query('SELECT retry_at FROM canonical_media_refresh_retries WHERE alias_id=$1',[restoredRefresh[0].alias_id])).rows[0].retry_at),24000);
    const restoredMediaSnapshot=id=>({...mediaDetailsFixture(),id,idMal:null,type:'ANIME',format:'TV',episodes:13,status:'RELEASING',averageScore:null,countryOfOrigin:'JP',
      title:{romaji:'Atualização retomada',english:null,native:'更新'},relations:{pageInfo:{hasNextPage:false},edges:[]}});
    for(const job of restoredRefresh) {
      const observedAt=Number(job.revision)===0?3000:25000;
      await refresh.commitMediaRefresh(client,{aliasId:job.alias_id,mediaId:Number(job.value),revision:Number(job.revision),dueAt:Number(job.due_at)},restoredMediaSnapshot(Number(job.value)),observedAt);
      assert.equal(Number((await client.query('SELECT revision FROM canonical_media_refresh_jobs WHERE alias_id=$1',[job.alias_id])).rows[0].revision),Number(job.revision)+1);
    }
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('SAVEPOINT invalid_restored_refresh');
    await assert.rejects(client.query('UPDATE canonical_media_refresh_jobs SET revision=revision+1,due_at=due_at+3000,observed_at=30000 WHERE alias_id=$1',[restoredRefresh[0].alias_id]),error=>error.code==='P0001');
    await client.query('ROLLBACK TO SAVEPOINT invalid_restored_refresh');
    await client.query('SAVEPOINT invalid_restored_head');
    await assert.rejects(client.query("UPDATE canonical_content_fact_heads SET observed_at=1000 WHERE entity_id=$1 AND field='airing.scheduledAt'",[sourceEvent.episodeId]),error=>error.code==='23514');
    await client.query('ROLLBACK TO SAVEPOINT invalid_restored_head');
    await client.query('SAVEPOINT invalid_restored_manifest');
    await assert.rejects(client.query('UPDATE canonical_ingestion_batches SET entry_count=entry_count+1 WHERE scope=$1',[scope]),error=>error.code==='23514');
    await client.query('ROLLBACK TO SAVEPOINT invalid_restored_manifest');
    await client.query('SAVEPOINT invalid_restored_arc');
    await assert.rejects(client.query('UPDATE user_entity_status SET parent_series_id=1 WHERE id=$1',[arcState.id]),error=>error.code==='23514');
    await client.query('ROLLBACK TO SAVEPOINT invalid_restored_arc');
    await client.query('SAVEPOINT invalid_restored_retry');
    await assert.rejects(client.query('UPDATE canonical_collection_retries SET failures=failures+1,retry_at=1 WHERE schedule_id=$1',[pendingId]),error=>error.code==='P0001');
    await client.query('ROLLBACK TO SAVEPOINT invalid_restored_retry');
    const row = (await client.query(`SELECT s.* FROM user_entity_status s
      JOIN canonical_memberships m ON m.child_id=s.canonical_entity_id AND m.child_kind='EPISODE'
      JOIN anime_catalog c ON c.composition_season_id=m.parent_id
      WHERE c.mal_id=920001 AND s.user_id='runtime-owner' AND s.entity_type='EPISODE'
        AND s.episode_number=1 AND s.activity_private IS NOT NULL
      ORDER BY s.updated_at DESC,s.id DESC LIMIT 1`)).rows[0];
    assert.ok(row, 'restored encrypted episode exists');
    const context = {table:'user_entity_status',owner:row.user_id,record:JSON.stringify([row.entity_type,row.entity_id]),field:'activity_private'};
    const activity = privateData.decryptPrivateJson(row.activity_private,context);
    assert.equal(activity.watched_seconds,25);
    assert.throws(() => privateData.decryptPrivateJson(row.activity_private,{...context,owner:'wrong-owner'}), 'restored AAD still isolates accounts');
    const changed = {...activity,watched_seconds:26};
    const envelope = privateData.encryptPrivateJson(changed,context);
    const updated = (await client.query('UPDATE user_entity_status SET activity_private=$2::jsonb WHERE id=$1 RETURNING activity_private',[row.id,JSON.stringify(envelope)])).rows[0];
    assert.deepEqual({...privateData.decryptPrivateJson(updated.activity_private,context)},changed);
    const work = (await client.query("INSERT INTO canonical_entities(kind) VALUES('WORK') RETURNING id")).rows[0].id;
    const season = (await client.query("INSERT INTO canonical_entities(kind) VALUES('SEASON') RETURNING id")).rows[0].id;
    assert.match(work,/^[a-f0-9-]{36}$/); assert.notEqual(work,season);
    for(const invalidId of ['opaque-restored-id',work.toUpperCase()]) {
      await client.query('SAVEPOINT invalid_restored_identity');
      await assert.rejects(client.query("INSERT INTO canonical_entities(id,kind) VALUES($1,'WORK')",[invalidId]),error=>error.code==='23514' && error.constraint==='canonical_entities_uuid_id');
      await client.query('ROLLBACK TO SAVEPOINT invalid_restored_identity');
    }
    await client.query('SAVEPOINT changed_restored_identity');
    await assert.rejects(client.query('UPDATE canonical_entities SET id=$2 WHERE id=$1',[work,season]),/Canonical identity is immutable/);
    await client.query('ROLLBACK TO SAVEPOINT changed_restored_identity');
    await client.query("INSERT INTO canonical_memberships(parent_id,parent_kind,child_id,child_kind,source_key,display_order) VALUES($1,'WORK',$2,'SEASON','restore-fixture',0)",[work,season]);
    await client.query('SAVEPOINT invalid_relation');
    await assert.rejects(client.query("INSERT INTO canonical_memberships(parent_id,parent_kind,child_id,child_kind,source_key,display_order) VALUES($1,'SEASON',$2,'WORK','restore-fixture',0)",[season,work]), error => error.code==='23514');
    await client.query('ROLLBACK TO SAVEPOINT invalid_relation');
    await client.query('ROLLBACK');
  } finally { client.release(); }
  compareSnapshots(await snapshot(pools[1]),after,'post-restore writes roll back without altering recovered data');
  console.log(`Real pg_dump/pg_restore: ${Object.keys(before.rows).length} tables preserved exactly, including private ciphertext, hierarchy, comments, constraints, indexes and triggers.`);
  console.log(`Post-restore: ${before.sequences.length} sequence states/configurations matched; native UUID inserts, valid hierarchy, invalid relation rejection, private decryption/update, wrong-owner AAD rejection and rollback passed.`);
  console.log('Restored central UUID contract: malformed/uppercase raw insert and identity rewrite rejected; native defaults and all recovered rows preserved.');
  console.log('Restored indexed archive SQL descriptor: populated metadata and immutable schema preserved, typed read/replay passed; physical files are outside pg_dump and no physical backup is claimed.');
  console.log('Restored IMDb dataset: populated file/receipt and applied/unmatched counts exact; current batch resumed final row with typed facts and atomic checkpoint; immutable identity rejected. All mutations rolled back.');
  console.log('Unified data restore: populated ARC/facts/history/heads/manifests/checkpoints/collection schedules/retries preserved; native pending-page resumption and agenda advance, typed zero/false/null/Unicode, account ARC AAD and SQL guards passed. SQL function definitions matched; all post-restore operations rolled back after deferred validation.');
} finally { if(restoredRuntime)await restoredRuntime.close();await Promise.all(pools.map(pool => pool.end())); }
