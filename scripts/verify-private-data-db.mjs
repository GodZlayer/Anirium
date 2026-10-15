import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import pg from 'pg';
import {historicalActivityFixture} from './historical-activity-fixture.mjs';
import {historicalCommentFixture} from './historical-comment-fixture.mjs';
import {mediaDetailsFixture} from './fixtures/media-details.mjs';
const require = createRequire(import.meta.url);
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/anirium_security_fixture');
const schema = `private_fixture_${crypto.randomBytes(8).toString('hex')}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pool;
const temporary = fs.mkdtempSync(join(tmpdir(), 'anirium-private-db-'));
const file = join(temporary, 'keyring.json');
const keys = { old: crypto.randomBytes(32).toString('base64'), next: crypto.randomBytes(32).toString('base64') };
const env = { ...process.env, NODE_ENV: 'production', ANIRIUM_DATA_KEYRING_FILE: file };
const save = activeKeyId => fs.writeFileSync(file, JSON.stringify({ activeKeyId, keys: Object.entries(keys).map(([id,key]) => ({id,key})) }), { mode: 0o600 });
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {}; modules.set(name, exports);
  const code = ts.transpileModule(fs.readFileSync(`src/lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, TextDecoder, URL, URLSearchParams, process: { env, cwd: process.cwd, platform: process.platform, pid: process.pid, kill: process.kill }, console: { ...console, error() {} }, require(name) {
    // Preserve the real PostgreSQL helpers/transaction implementation while
    // supplying the already-created pool confined to this disposable schema.
    if (name === 'pg') return { ...pg, Pool: class { constructor() { return pool; } } };
    if (name === '../addons/player-pro/manifest.json') return JSON.parse(fs.readFileSync('src/addons/player-pro/manifest.json','utf8'));
    if (name === './builtinBlackTheme.json') return JSON.parse(fs.readFileSync('src/lib/builtinBlackTheme.json','utf8'));
    if (name.startsWith('./')) return load(name.slice(2));
    return require(name);
  } }, { filename: `src/lib/${name}.ts` });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
  // Build the actual schema. LIKE INCLUDING ALL does not copy foreign keys.
  save('old');
  await load('postgres').ensurePostgresSchema();
  await pool.query("INSERT INTO users(id,username,display_name,created_at) VALUES ('owner','fixture','Fixture',0),('other','other','Other',0)");
  const index = load('entityIndex'), database = load('postgres');
  const entityIdSQL=load('entitySchema').canonicalEntityIdSQL;
  const defaultIdentity=await database.withTransaction(async client=>{
    await client.query(entityIdSQL);await client.query(entityIdSQL);
    return (await client.query("INSERT INTO canonical_entities(kind) VALUES('RESOURCE') RETURNING *")).rows[0];
  });
  assert.match(defaultIdentity.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  for(const id of ['opaque-id','123',crypto.randomUUID().toUpperCase(),` ${crypto.randomUUID()}`,crypto.randomUUID().replaceAll('-','')])
    await assert.rejects(()=>database.withTransaction(client=>client.query("INSERT INTO canonical_entities(id,kind) VALUES($1,'RESOURCE')",[id])),error=>error.code==='23514' && error.constraint==='canonical_entities_uuid_id');
  await assert.rejects(()=>database.withTransaction(client=>client.query('UPDATE canonical_entities SET id=$2 WHERE id=$1',[defaultIdentity.id,crypto.randomUUID()])),/Canonical identity is immutable/);
  assert.deepEqual((await pool.query('SELECT * FROM canonical_entities WHERE id=$1',[defaultIdentity.id])).rows[0],defaultIdentity);
  await database.withTransaction(async client=>{
    await client.query('CREATE TEMP TABLE canonical_entities(id TEXT PRIMARY KEY) ON COMMIT DROP');
    await client.query('SET LOCAL search_path TO pg_temp');
    await client.query("INSERT INTO canonical_entities VALUES('invalid-historical-id')");
    await client.query('SAVEPOINT invalid_identity');
    await assert.rejects(()=>client.query(entityIdSQL),error=>error.code==='23514');
    await client.query('ROLLBACK TO SAVEPOINT invalid_identity');
    assert.deepEqual((await client.query('SELECT id FROM canonical_entities')).rows,[{id:'invalid-historical-id'}]);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='canonical_entities'::regclass AND conname='canonical_entities_uuid_id'")).rows[0].count,0,'failed migration installs no partial constraint');
    await client.query('DELETE FROM canonical_entities');
    const id=crypto.randomUUID();await client.query('INSERT INTO canonical_entities VALUES($1)',[id]);
    await client.query(entityIdSQL);await client.query(entityIdSQL);
    assert.equal((await client.query('SELECT id FROM canonical_entities')).rows[0].id,id);
    assert.equal((await client.query("SELECT convalidated FROM pg_constraint WHERE conrelid='canonical_entities'::regclass AND conname='canonical_entities_uuid_id'")).rows[0].convalidated,true);
  });
  console.log('Canonical identity SQL: lowercase UUID default and raw validation, immutable existing ID, idempotent validated constraint, invalid historical migration rollback without ID rewrite passed.');
  const arcs=load('arcIndex');
  const contentInfo=load('contentEntityInfo');
  const relations=load('contentRelations');
  const ownContent=load('ownContentPage');
  const contentFacts=load('contentFacts');
  for(const [dataset,line] of [
    ['basics','tt1234567\ttvSeries\t日本語\tTítulo\t0\t2026\t\\N\t0\tDrama,Animation'],
    ['basics','tt1234567\tmovie\tTitle\tOriginal\t\\N\t\\N\t\\N\t\\N\t\\N'],
    ['ratings','tt1234567\t0.0\t0'],['ratings','tt1234567\t8.5\t100']]) {
    const native=(await pool.query('SELECT canonical_imdb_row_facts($1,$2) AS facts',[dataset,line])).rows[0].facts;
    assert.deepEqual(native,plain(load('imdbDatasetFacts').buildImdbDatasetFacts(dataset,line).facts),'SQL independently derives exact typed fact contract');
  }
  for(const [dataset,line] of [['ratings','tt1234567\t11\t0'],['ratings','tt1234567\t5\t9007199254740992'],['ratings','tt1234567\tNaN\t0'],
    ['basics','tt1234567\tmovie\tTitle\tOriginal\tfalse\t2026\t\\N\t0\tDrama'],['basics','tt1234567\tmovie\tTitle\tOriginal\t0\t10000\t\\N\t0\tDrama'],
    ['basics','tt1234567\tmovie\tTitle\tOriginal\t0\t2026\t\\N\t0\tDrama,'],['ratings','bad\t1\t2'],['unknown','tt1234567\t1\t2']])
    await assert.rejects(()=>pool.query('SELECT canonical_imdb_row_facts($1,$2)',[dataset,line]),error=>error.code==='23514');
  console.log('IMDb independent native SQL parser: exact own typed fact equality with application contract for Unicode/false/zero/null/lists, ratings/counts; malformed identity/type/columns/range rejection passed. Independent SQL item mapping exercised below.');
  const fileHash='a'.repeat(64),batchHash='b'.repeat(64);
  const datasetFile=await database.withTransaction(async client=>{
    await client.query(load('imdbDatasetSchema').imdbDatasetSchemaSQL);
    return (await client.query("INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at) VALUES('ratings','plain',$1,200,3,100) RETURNING *",[fileHash])).rows[0];
  });
  const receipt=async(client,revision,start,end)=>{
    const lines=[];
    for(let ordinal=start;ordinal<=end;ordinal++) {
      const title=`tt${8000000+ordinal}`,line=`${title}\t5\t2`;lines.push(line);
      await client.query('INSERT INTO canonical_dataset_items(file_id,revision,row_number,title_id,raw_line) VALUES($1,$2,$3,$4,$5)',[datasetFile.id,revision,ordinal,title,line]);
    }
    await client.query('INSERT INTO canonical_dataset_batches(file_id,revision,start_row,end_row,applied_count,unmatched_count,sha256) VALUES($1,$2,$3,$4,0,$5,$6)',[datasetFile.id,revision,start,end,end-start+1,crypto.createHash('sha256').update(lines.join('\n')+'\n').digest('hex')]);
  };
  await assert.rejects(()=>database.withTransaction(client=>receipt(client,1,1,1)),/atomic checkpoint/);
  await assert.rejects(()=>database.withTransaction(client=>client.query('UPDATE canonical_dataset_files SET next_row=1,revision=1 WHERE id=$1',[datasetFile.id])),/matching batch/);
  await assert.rejects(()=>database.withTransaction(client=>receipt(client,1,2,2)),/contiguous/);
  await database.withTransaction(async client=>{await receipt(client,1,1,2);await client.query('UPDATE canonical_dataset_files SET next_row=2,revision=1 WHERE id=$1',[datasetFile.id]);});
  await assert.rejects(()=>database.withTransaction(client=>receipt(client,1,1,2)),/contiguous|outside current batch/);
  await assert.rejects(()=>database.withTransaction(async client=>{await receipt(client,2,3,3);await client.query('UPDATE canonical_dataset_files SET next_row=3,revision=2 WHERE id=$1',[datasetFile.id]);throw new Error('dataset downstream rollback');}),/downstream rollback/);
  assert.equal(Number((await pool.query('SELECT next_row FROM canonical_dataset_files WHERE id=$1',[datasetFile.id])).rows[0].next_row),2);
  for(const sql of ['DELETE FROM canonical_dataset_files WHERE id=$1','UPDATE canonical_dataset_files SET observed_at=101 WHERE id=$1','UPDATE canonical_dataset_batches SET sha256=sha256 WHERE file_id=$1','DELETE FROM canonical_dataset_batches WHERE file_id=$1'])
    await assert.rejects(()=>database.withTransaction(client=>client.query(sql,[datasetFile.id])),/immutable|matching batch/);
  await database.withTransaction(async client=>{await receipt(client,2,3,3);await client.query('UPDATE canonical_dataset_files SET next_row=3,revision=2 WHERE id=$1',[datasetFile.id]);});
  await assert.rejects(()=>database.withTransaction(client=>receipt(client,3,4,4)),/contiguous|outside current batch/);
  console.log('IMDb dataset SQL state: immutable file identity, initial zero, contiguous batch/advance atomicity, deferred receipt rejection, replay/stale rejection, downstream rollback and completed boundary passed. Receipt item binding exercised below.');
  await database.withTransaction(async client=>{
    await client.query('SAVEPOINT characterize_unproven_dataset_receipt');
    const before=(await client.query('SELECT count(*)::int AS n FROM canonical_content_facts')).rows[0].n;
    const file=(await client.query("INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at) VALUES('ratings','plain',$1,40,1,999) RETURNING id",['4'.repeat(64)])).rows[0];
    await client.query('INSERT INTO canonical_dataset_batches(file_id,revision,start_row,end_row,applied_count,unmatched_count,sha256) VALUES($1,1,1,1,1,0,$2)',[file.id,'5'.repeat(64)]);
    await client.query('UPDATE canonical_dataset_files SET revision=1,next_row=1 WHERE id=$1',[file.id]);
    await assert.rejects(()=>client.query('SET CONSTRAINTS ALL IMMEDIATE'),/exact verified items/);
    await client.query('ROLLBACK TO SAVEPOINT characterize_unproven_dataset_receipt');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM canonical_content_facts')).rows[0].n,before);
  });
  console.log('Native SQL forged receipt rejection: applied row/checkpoint without exact source items fails deferred validation; attempted changes rolled back.');
  for(const corruption of ['hash','counts','range']) {
    await assert.rejects(()=>database.withTransaction(async client=>{
      const file=(await client.query("INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at) VALUES('ratings','plain',$1,40,2,1000) RETURNING id",[crypto.randomBytes(32).toString('hex')])).rows[0];
      const ordinal=corruption==='range'?2:1,line='tt7777777\t5\t2';
      await client.query('INSERT INTO canonical_dataset_items(file_id,revision,row_number,title_id,raw_line) VALUES($1,1,$2,$3,$4)',[file.id,ordinal,'tt7777777',line]);
      const hash=corruption==='hash'?'0'.repeat(64):crypto.createHash('sha256').update(line+'\n').digest('hex');
      await client.query('INSERT INTO canonical_dataset_batches(file_id,revision,start_row,end_row,applied_count,unmatched_count,sha256) VALUES($1,1,1,1,$2,$3,$4)',[file.id,corruption==='counts'?1:0,corruption==='counts'?0:1,hash]);
      await client.query('UPDATE canonical_dataset_files SET revision=1,next_row=1 WHERE id=$1',[file.id]);
    }),/exact verified items/,`native receipt rejects independently corrupted ${corruption}`);
  }
  console.log('Native IMDb receipt PostgreSQL: independently wrong hash, applied/unmatched counts and item interval each rejected at commit with full rollback.');

  await database.withTransaction(async client=>{
    await client.query('SAVEPOINT imdb_batch_fixture');
    const batch=load('imdbDatasetBatch');
    const entity=await index.ensureEntity({namespace:'imdb:title',value:'tt8888888',sourceKey:'fixture:verified'},{kind:'WORK'},client);
    const file=(await client.query("INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at) VALUES('ratings','plain',$1,100,3,500) RETURNING id",['c'.repeat(64)])).rows[0];
    const provenAlias=(await client.query("SELECT id FROM canonical_aliases WHERE namespace='imdb:title' AND value='tt8888888'")).rows[0].id;
    await client.query('SAVEPOINT invalid_native_item');
    await assert.rejects(()=>client.query('INSERT INTO canonical_dataset_items(file_id,revision,row_number,title_id,raw_line,entity_id,alias_id) VALUES($1,1,1,$2,$3,$4,$5)',
      [file.id,'tt8888888','tt8888888\t0.0\t0',entity.id,provenAlias]),/exact typed source facts/);
    await client.query('ROLLBACK TO SAVEPOINT invalid_native_item');
    const result=await batch.commitImdbDatasetBatch(client,file.id,0,['tt8888888\t0.0\t0','tt7777777\t5.0\t2']);
    assert.equal(result.appliedCount,1);assert.equal(result.unmatchedCount,1);assert.equal(result.endRow,2);assert.equal(result.complete,false);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM canonical_dataset_items WHERE file_id=$1',[file.id])).rows[0].n,2);
    await client.query('SAVEPOINT immutable_native_item');
    await assert.rejects(()=>client.query('UPDATE canonical_dataset_items SET raw_line=raw_line WHERE file_id=$1',[file.id]),/immutable/);
    await client.query('ROLLBACK TO SAVEPOINT immutable_native_item');
    assert.equal((await contentFacts.readCurrentContentFacts(client,entity.id)).find(row=>row.field==='media.averageRating').value,0);
    assert.equal((await client.query('SELECT applied_count,unmatched_count FROM canonical_dataset_batches WHERE file_id=$1',[file.id])).rows[0].unmatched_count,'1');
    await assert.rejects(()=>batch.commitImdbDatasetBatch(client,file.id,0,['tt8888888\t1\t1']),/Stale/);
    await client.query('SAVEPOINT imdb_batch_rollback');
    const countBefore=(await client.query('SELECT count(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[entity.id])).rows[0].n;
    await assert.rejects(()=>batch.commitImdbDatasetBatch(client,file.id,1,['tt8888888\t7\t1']),/Conflicting content observation/);
    await client.query('ROLLBACK TO SAVEPOINT imdb_batch_rollback');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[entity.id])).rows[0].n,countBefore);
    assert.equal((await client.query('SELECT next_row FROM canonical_dataset_files WHERE id=$1',[file.id])).rows[0].next_row,'2');
    const finished=await batch.commitImdbDatasetBatch(client,file.id,1,['tt6666666\t8\t3']);assert.equal(finished.complete,true);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('ROLLBACK TO SAVEPOINT imdb_batch_fixture');
  });
  console.log('IMDb application batch PostgreSQL: known facts and unmatched rows counted with receipt/checkpoint, zero/provenance, stale and conflicting observations, rollback and completion passed. Native exact fact binding exercised; file authenticity remains a separate requirement.');
  const concurrentDataset=await database.withTransaction(async client=>{
    await index.ensureEntity({namespace:'imdb:title',value:'tt2222222',sourceKey:'fixture:concurrent'},{kind:'WORK'},client);
    return (await client.query("INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at) VALUES('ratings','plain',$1,40,1,600) RETURNING id",['f'.repeat(64)])).rows[0];
  });
  const contenders=await Promise.allSettled([1,2].map(()=>database.withTransaction(client=>load('imdbDatasetBatch').commitImdbDatasetBatch(client,concurrentDataset.id,0,['tt2222222\t5\t2']))));
  assert.equal(contenders.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(contenders.filter(row=>row.status==='rejected' && /Stale IMDb batch/.test(row.reason.message)).length,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_dataset_batches WHERE file_id=$1',[concurrentDataset.id])).rows[0].n,1);
  assert.equal(Number((await pool.query('SELECT next_row FROM canonical_dataset_files WHERE id=$1',[concurrentDataset.id])).rows[0].next_row),1);
  console.log('IMDb concurrent batch PostgreSQL: two independent transactions contend for same revision, one commits and one stale-rejects; exactly one receipt/checkpoint advance.');
  const registeredManifest={dataset:'ratings',compression:'plain',sha256:'2'.repeat(64),byteSize:40,rowCount:1};
  const fileRegistry=load('imdbDatasetFile');
  const registered=await Promise.all([1,2].map(()=>database.withTransaction(client=>fileRegistry.registerImdbDatasetFile(client,registeredManifest,700))));
  assert.equal(registered[0].id,registered[1].id);assert.equal(registered[0].nextRow,0);
  await database.withTransaction(client=>load('imdbDatasetBatch').commitImdbDatasetBatch(client,registered[0].id,0,['tt9990000\t5\t2']));
  const replayed=await database.withTransaction(client=>fileRegistry.registerImdbDatasetFile(client,registeredManifest,700));
  assert.equal(replayed.id,registered[0].id);assert.equal(replayed.nextRow,1);assert.equal(replayed.revision,1);assert.equal(replayed.complete,true);
  for(const change of [{byteSize:41},{rowCount:2},{compression:'gzip'}])
    await assert.rejects(()=>database.withTransaction(client=>fileRegistry.registerImdbDatasetFile(client,{...registeredManifest,...change},700)),/Conflicting IMDb file manifest/);
  await assert.rejects(()=>database.withTransaction(client=>fileRegistry.registerImdbDatasetFile(client,registeredManifest,701)),/Conflicting IMDb file manifest/);
  const emptyManifest=await database.withTransaction(client=>fileRegistry.registerImdbDatasetFile(client,{...registeredManifest,sha256:'3'.repeat(64),rowCount:0},800));
  assert.equal(emptyManifest.complete,true);assert.equal(emptyManifest.nextRow,0);
  for(const change of [{byteSize:0},{rowCount:-1},{sha256:'bad'},{dataset:'episode'}])
    await assert.rejects(()=>database.withTransaction(client=>fileRegistry.registerImdbDatasetFile(client,{...registeredManifest,...change},700)),/Invalid IMDb file manifest/);
  console.log('IMDb manifest registration PostgreSQL: concurrent same-file single identity, typed state, replay preserves completed cursor/revision, conflicting metadata/observation rejected and valid header-only file complete at zero.');
  await database.withTransaction(async client=>{
    await client.query('SAVEPOINT imdb_caught_error_fixture');
    const first=await index.ensureEntity({namespace:'imdb:title',value:'tt1010101',sourceKey:'fixture'},{kind:'WORK'},client);
    const second=await index.ensureEntity({namespace:'imdb:title',value:'tt2020202',sourceKey:'fixture'},{kind:'WORK'},client);
    await load('imdbDatasetFacts').recordImdbDatasetRow(client,second.id,'ratings','tt2020202\t8\t5',900);
    const file=(await client.query("INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at) VALUES('ratings','plain',$1,100,2,900) RETURNING id",['1'.repeat(64)])).rows[0];
    await assert.rejects(()=>load('imdbDatasetBatch').commitImdbDatasetBatch(client,file.id,0,['tt1010101\t3\t1','tt2020202\t7\t5']),/Conflicting content observation/);
    // No caller rollback here: helper must remove first row facts and leave the outer transaction usable.
    assert.equal((await contentFacts.readCurrentContentFacts(client,first.id)).length,0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM canonical_dataset_batches WHERE file_id=$1',[file.id])).rows[0].n,0);
    assert.equal(Number((await client.query('SELECT next_row FROM canonical_dataset_files WHERE id=$1',[file.id])).rows[0].next_row),0);
    const recovered=await load('imdbDatasetBatch').commitImdbDatasetBatch(client,file.id,0,['tt1010101\t3\t1','tt2020202\t8\t5']);
    assert.equal(recovered.complete,true);assert.equal(recovered.appliedCount,2);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('ROLLBACK TO SAVEPOINT imdb_caught_error_fixture');
  });
  console.log('IMDb caught-error atomicity PostgreSQL: second-row conflict rolls back earlier facts internally, no receipt/checkpoint survives, caller transaction continues and corrected batch succeeds without caller rollback.');
  {
    const executor=load('imdbDatasetExecution'),source=join(temporary,'imdb-execution.tsv');
    const entity=await index.ensureEntity({namespace:'imdb:title',value:'tt6000000',sourceKey:'fixture:verified'},{kind:'WORK'});
    const text=load('imdbDatasetRows').imdbDatasetHeaders.ratings+'\n'+Array.from({length:205},(_,i)=>`tt${6000000+i}\t0.0\t0`).join('\n')+'\n';
    fs.writeFileSync(source,text);
    const input={path:source,dataset:'ratings',compression:'plain',observedAt:23000,maxBatches:1};
    const first=await executor.executeImdbDatasetFile(input);
    assert.equal(first.nextRow,100);assert.equal(first.complete,false);assert.equal(first.appliedCount,1);
    assert.equal(first.unmatchedCount,99);
    let calls=0;
    await assert.rejects(()=>executor.executeImdbDatasetFile({...input,expectedManifest:first.manifest},work=>database.withTransaction(async client=>{
      const result=await work(client);if(++calls===2)throw new Error('executor downstream interruption');return result;
    })),/downstream interruption/);
    assert.equal(Number((await pool.query('SELECT next_row FROM canonical_dataset_files WHERE id=$1',[first.fileId])).rows[0].next_row),100);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_dataset_items WHERE file_id=$1',[first.fileId])).rows[0].n,100);
    const resumed=await executor.executeImdbDatasetFile({...input,maxBatches:undefined,expectedManifest:first.manifest});
    assert.equal(resumed.fileId,first.fileId);assert.equal(resumed.nextRow,205);assert.equal(resumed.committedBatches,2);assert.equal(resumed.complete,true);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_dataset_items WHERE file_id=$1',[first.fileId])).rows[0].n,205);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_dataset_batches WHERE file_id=$1',[first.fileId])).rows[0].n,3);
    const replay=await executor.executeImdbDatasetFile({...input,expectedManifest:first.manifest});
    assert.equal(replay.committedBatches,0);assert.equal(replay.nextRow,205);
    const facts=await database.withTransaction(client=>contentFacts.readCurrentContentFacts(client,entity.id));
    assert.equal(facts.find(f=>f.field==='media.numVotes').value,0);
    fs.writeFileSync(source,text.replace('0.0','1.0'));
    await assert.rejects(()=>executor.executeImdbDatasetFile({...input,expectedManifest:first.manifest}),/file identity changed/);
    fs.writeFileSync(source,text+'invalid final row\n');
    let transactions=0;
    await assert.rejects(()=>executor.executeImdbDatasetFile(input,async work=>{transactions++;return database.withTransaction(work);}));
    assert.equal(transactions,0,'whole source validation precedes any SQL writes');
    console.log('IMDb physical-file executor PostgreSQL:205 real rows, known zero facts/unmatched records, bounded initial commit, injected transaction failure preserves100, resumed105 rows, complete replay no writes, changed pinned file rejected, trailing corruption reaches no SQL transaction.');
  }

  await database.withTransaction(async client=>{
    await client.query('SAVEPOINT imdb_fact_fixture');
    const writer=load('imdbDatasetFacts');
    const entity=await index.ensureEntity({namespace:'imdb:title',value:'tt1234567',sourceKey:'fixture:proven-imdb'},{kind:'WORK'},client);
    const line='tt1234567\ttvSeries\t日本語\tTítulo\t0\t2026\t\\N\t0\tDrama,Animation';
    await writer.recordImdbDatasetRow(client,entity.id,'basics',line,100);
    await writer.recordImdbDatasetRow(client,entity.id,'basics',line,100);
    await writer.recordImdbDatasetRow(client,entity.id,'ratings','tt1234567\t0.0\t0',100);
    const facts=await contentFacts.readCurrentContentFacts(client,entity.id);
    assert.equal(facts.length,12);assert.equal(facts.find(row=>row.field==='media.isAdult').value,false);
    assert.equal(facts.find(row=>row.field==='media.endYear').type,'null');assert.equal(facts.find(row=>row.field==='media.durationMinutes').value,0);
    assert.deepEqual(plain(facts.find(row=>row.field==='media.genres').value),['Drama','Animation']);
    assert.equal(facts.find(row=>row.field==='media.averageRating').value,0);
    assert.ok(facts.every(row=>row.namespace==='imdb:title' && row.externalId==='tt1234567'));
    assert.equal((await ownContent.readOwnContentPage(client,{filters:[{sourceKey:'imdb:dataset:basics',field:'media.genres',type:'string-list',op:'contains',value:'Drama'}]})).items[0].id,entity.id);
    await writer.recordImdbDatasetRow(client,entity.id,'ratings','tt1234567\t8.5\t20',200);
    assert.equal((await contentFacts.readCurrentContentFacts(client,entity.id)).find(row=>row.field==='media.averageRating').value,8.5);
    const countBefore=(await client.query('SELECT count(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[entity.id])).rows[0].n;
    await client.query('SAVEPOINT imdb_conflict');
    await assert.rejects(()=>writer.recordImdbDatasetRow(client,entity.id,'ratings','tt1234567\t7.0\t21',200),/Conflicting content observation/);
    await client.query('ROLLBACK TO SAVEPOINT imdb_conflict');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[entity.id])).rows[0].n,countBefore);
    await assert.rejects(()=>writer.recordImdbDatasetRow(client,entity.id,'basics',line.replace('tt1234567','tt7654321'),300),/Proven content source identity unavailable/);
    const privateEntity=await index.ensureEntity({namespace:'imdb:title',value:'tt9999999',sourceKey:'fixture'},{kind:'WORK',ownerId:'owner'},client);
    await assert.rejects(()=>writer.recordImdbDatasetRow(client,privateEntity.id,'ratings','tt9999999\t5\t2',100),/Proven content source identity unavailable/);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('ROLLBACK TO SAVEPOINT imdb_fact_fixture');
  });
  console.log('IMDb native PostgreSQL observations: proven public alias only, typed Unicode/false/zero/null/list, source provenance, replay, own filters, rating correction, conflicting observation rollback and unbound/private exclusion passed.');
  const arcFixture=await database.withTransaction(async client=>{
    const make=kind=>index.ensureEntity({namespace:'arc-fixture',value:crypto.randomUUID(),sourceKey:'fixture'}, {kind},client);
    const universe=await make('UNIVERSE'),otherUniverse=await make('UNIVERSE'),work=await make('WORK'),season=await make('SEASON'),episode=await make('EPISODE');
    await index.linkContentEntities(client,universe.id,work.id,0,'fixture');
    await index.linkContentEntities(client,work.id,season.id,0,'fixture');
    await index.linkContentEntities(client,season.id,episode.id,0,'fixture');
    const alias={namespace:'arc-fixture',value:crypto.randomUUID(),sourceKey:'fixture'};
    const arc=await arcs.registerArc(client,universe.id,alias);
    assert.equal((await arcs.registerArc(client,universe.id,alias)).id,arc.id);
    const second=await arcs.registerArc(client,universe.id,{...alias,value:crypto.randomUUID()});
    await arcs.linkArcEpisode(client,arc.id,episode.id,0,'fixture');
    await arcs.linkArcEpisode(client,arc.id,episode.id,0,'fixture');
    await arcs.linkArcEpisode(client,second.id,episode.id,1,'fixture');
    return {universe,otherUniverse,work,season,episode,arc,alias};
  });
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM canonical_arc_episodes WHERE episode_id=$1',[arcFixture.episode.id])).rows[0].n,2,'episode supports parallel arcs');
  assert.equal((await pool.query('SELECT revision FROM canonical_arc_episodes WHERE arc_id=$1',[arcFixture.arc.id])).rows[0].revision,1,'replay does not change revision');
  await database.withTransaction(async client=>{
    for(const [entity,relation,target] of [
      [arcFixture.universe,'children',arcFixture.work],
      [arcFixture.work,'parent',arcFixture.universe],
      [arcFixture.work,'children',arcFixture.season],
      [arcFixture.season,'parent',arcFixture.work],
      [arcFixture.season,'children',arcFixture.episode],
      [arcFixture.episode,'parent',arcFixture.season],
      [arcFixture.arc,'parent',arcFixture.universe],
      [arcFixture.arc,'episodes',arcFixture.episode],
    ]) {
      const page=await relations.readContentRelations(client,entity.id,{relation,limit:1});
      assert.equal(page.items[0].id,target.id);
      assert.equal(page.items[0].kind,target.kind);
      assert.equal(page.hasMore,false);
      assert.equal(page.nextCursor,null);
    }
    for(const entity of [arcFixture.universe,arcFixture.episode]) {
      const first=await relations.readContentRelations(client,entity.id,{relation:'arcs',limit:1});
      assert.equal(first.hasMore,true);
      const second=await relations.readContentRelations(client,entity.id,{relation:'arcs',limit:1,after:first.nextCursor});
      assert.equal(second.hasMore,false);
      assert.notEqual(first.items[0].id,second.items[0].id);
      assert.ok(first.items[0].id<second.items[0].id,'cursor order follows stable identity');
      assert.equal(first.items[0].kind,'ARC');
      assert.equal(second.items[0].kind,'ARC');
    }
    await assert.rejects(()=>relations.readContentRelations(client,arcFixture.arc.id,{relation:'children'}),/Unavailable content relation/);
    for(const input of [{relation:'episodes',limit:'1'},{relation:'episodes',limit:101},{relation:'episodes',after:'bad'}])
      await assert.rejects(()=>relations.readContentRelations(client,arcFixture.arc.id,input),/Invalid content relation page/);
    assert.equal(await relations.readContentRelations(client,crypto.randomUUID(),{relation:'arcs'}),null);
  });
  console.log('Content relation keyset: tree/parallel arcs, typed links, paged unique identities, input validation and missing identity passed.');
  const sourceAlias=(await database.withTransaction(client=>contentInfo.getContentEntityInfo(client,arcFixture.episode.id))).aliases[0];
  const factSource={namespace:sourceAlias.namespace,externalId:sourceAlias.value,sourceKey:'fixture:source-a',observedAt:2000};
  const typedFacts=[{field:'rating',type:'number',value:8.5},{field:'label',type:'string',value:'日本語'},
    {field:'available',type:'boolean',value:false},{field:'firstSeen',type:'instant',value:0},{field:'unknown',type:'null',value:null}];
  await database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.episode.id,factSource,typedFacts));
  await database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.episode.id,factSource,typedFacts));
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[arcFixture.episode.id])).rows[0].n,5);
  await database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.episode.id,{...factSource,observedAt:1000},[{field:'rating',type:'number',value:1}]));
  let currentFacts=await database.withTransaction(client=>contentFacts.readCurrentContentFacts(client,arcFixture.episode.id));
  assert.equal(currentFacts.find(f=>f.field==='rating').value,8.5,'older observation cannot replace latest');
  assert.equal(typeof currentFacts.find(f=>f.field==='rating').value,'number');
  assert.equal(currentFacts.find(f=>f.field==='available').value,false);
  assert.equal(currentFacts.find(f=>f.field==='firstSeen').value,0);
  await assert.rejects(()=>database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.episode.id,factSource,[{field:'rating',type:'number',value:9}])),/Conflicting content observation/);
  await database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.episode.id,{...factSource,sourceKey:'fixture:source-b'},[{field:'rating',type:'number',value:7}]));
  assert.equal((await database.withTransaction(client=>contentFacts.readCurrentContentFacts(client,arcFixture.episode.id))).filter(f=>f.field==='rating').length,2,'source disagreements stay distinct');
  for(const bad of [{field:'x',type:'number',value:'8.5'},{field:'x',type:'boolean',value:'false'},
    {field:'x',type:'instant',value:1.5},{field:'x',type:'instant',value:-1},{field:'x',type:'number',value:Infinity}])
    await assert.rejects(()=>database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.episode.id,factSource,[bad])),/Invalid typed content fact/);
  await assert.rejects(()=>database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.work.id,factSource,typedFacts)),/Proven content source identity unavailable/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    await contentFacts.recordContentFacts(client,arcFixture.episode.id,{...factSource,observedAt:3000},[{field:'rating',type:'number',value:10}]);
    throw new Error('fact downstream rollback');
  }),/fact downstream rollback/);
  assert.equal((await database.withTransaction(client=>contentFacts.readCurrentContentFacts(client,arcFixture.episode.id))).find(f=>f.sourceKey===factSource.sourceKey && f.field==='rating').value,8.5);
  await database.withTransaction(client=>contentFacts.recordEpisodeAiring(client,arcFixture.episode.id,{...factSource,observedAt:3000},5000,false));
  await database.withTransaction(client=>contentFacts.recordEpisodeAiring(client,arcFixture.episode.id,{...factSource,observedAt:4000},null,true));
  currentFacts=await database.withTransaction(client=>contentFacts.readCurrentContentFacts(client,arcFixture.episode.id));
  assert.equal(currentFacts.find(f=>f.field==='airing.scheduledAt').value,null);
  assert.equal(currentFacts.find(f=>f.field==='airing.cancelled').value,true);
  await database.withTransaction(async client=>{
    const historyBefore=(await client.query('SELECT count(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[arcFixture.episode.id])).rows[0].n;
    await client.query("UPDATE canonical_aliases SET state='retired' WHERE entity_id=$1 AND namespace=$2 AND value=$3",[arcFixture.episode.id,factSource.namespace,factSource.externalId]);
    assert.ok(!(await contentFacts.readCurrentContentFacts(client,arcFixture.episode.id)).some(row=>row.namespace===factSource.namespace && row.externalId===factSource.externalId),'retired source assertions are not current read results');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[arcFixture.episode.id])).rows[0].n,historyBefore,'retirement preserves immutable observation history');
    await client.query("UPDATE canonical_aliases SET state='active' WHERE entity_id=$1 AND namespace=$2 AND value=$3",[arcFixture.episode.id,factSource.namespace,factSource.externalId]);
    assert.ok((await contentFacts.readCurrentContentFacts(client,arcFixture.episode.id)).some(row=>row.namespace===factSource.namespace && row.externalId===factSource.externalId),'reactivation reads original current assertions without rewriting history');
  });
  const currentAirings=await database.withTransaction(client=>contentFacts.readEpisodeAirings(client,arcFixture.episode.id));
  assert.equal(currentAirings[0].scheduledAt,null);
  assert.equal(currentAirings[0].cancelled,true);
  assert.equal(currentAirings[0].observedAt,4000);
  assert.equal(await database.withTransaction(client=>contentFacts.readEpisodeAirings(client,arcFixture.work.id)),null);
  await assert.rejects(()=>database.withTransaction(client=>contentFacts.recordEpisodeAiring(client,arcFixture.work.id,factSource,5000,false)),/Invalid episode airing/);
  await assert.rejects(()=>pool.query('UPDATE canonical_content_facts SET value=value WHERE entity_id=$1',[arcFixture.episode.id]),/immutable/);
  await Promise.all(Array.from({length:4},()=>database.withTransaction(client=>contentFacts.recordContentFacts(client,arcFixture.episode.id,{...factSource,observedAt:5000},[{field:'rating',type:'number',value:9.5}]))));
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1 AND field='rating' AND observed_at=5000",[arcFixture.episode.id])).rows[0].n,1,'concurrent replay inserts one observation');
  const latestHead=(await pool.query("SELECT observed_at FROM canonical_content_fact_heads WHERE entity_id=$1 AND source_key=$2 AND field='rating'",[arcFixture.episode.id,factSource.sourceKey])).rows[0];
  assert.equal(Number(latestHead.observed_at),5000);
  await assert.rejects(()=>pool.query("UPDATE canonical_content_fact_heads SET observed_at=1000 WHERE entity_id=$1 AND source_key=$2 AND field='rating'",[arcFixture.episode.id,factSource.sourceKey]),/current fact integrity conflict/);
  await assert.rejects(()=>pool.query("DELETE FROM canonical_content_fact_heads WHERE entity_id=$1 AND field='rating'",[arcFixture.episode.id]),/current fact integrity conflict/);
  await assert.rejects(()=>pool.query('TRUNCATE canonical_content_fact_heads'),/immutable/);
  assert.equal(Number((await pool.query("SELECT observed_at FROM canonical_content_fact_heads WHERE entity_id=$1 AND source_key=$2 AND field='rating'",[arcFixture.episode.id,factSource.sourceKey])).rows[0].observed_at),5000,'invalid SQL changes preserve current head');
  const brokenHeads=(await pool.query(`SELECT count(*)::integer AS n FROM (
    SELECT entity_id,alias_id,source_key,field,max(observed_at) AS latest FROM canonical_content_facts GROUP BY entity_id,alias_id,source_key,field
    ) f LEFT JOIN canonical_content_fact_heads h USING(entity_id,alias_id,source_key,field) WHERE h.observed_at IS DISTINCT FROM f.latest`)).rows[0].n;
  assert.equal(brokenHeads,0,'SQL oracle: every current pointer identifies latest immutable fact');
  const rawFact=async (entity,field,type,value)=>{
    const alias=(await pool.query('SELECT id FROM canonical_aliases WHERE entity_id=$1 LIMIT 1',[entity.id])).rows[0];
    return pool.query('INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',[entity.id,alias.id,'fixture:raw',field,type,JSON.stringify(value),7000]);
  };
  await assert.rejects(()=>rawFact(arcFixture.work,'airing.scheduledAt','instant',123),/scope conflict/);
  await assert.rejects(()=>rawFact(arcFixture.episode,'airing.cancelled','string','false'),/check constraint/);
  await assert.rejects(()=>rawFact(arcFixture.episode,'bad.instant','instant',1.5),/check constraint/);
  await database.withTransaction(async client=>{
    const privateEpisode=await index.ensureEntity({namespace:'facts-private',value:crypto.randomUUID(),sourceKey:'fixture'},{kind:'EPISODE',ownerId:'owner'},client);
    const externalId=(await client.query('SELECT value FROM canonical_aliases WHERE entity_id=$1',[privateEpisode.id])).rows[0].value;
    await assert.rejects(()=>contentFacts.recordContentFacts(client,privateEpisode.id,{namespace:'facts-private',externalId,sourceKey:'fixture',observedAt:1000},typedFacts),/Proven content source identity unavailable/);
  });
  console.log('Source facts and episode airing: typed values, source identity, replay, older history, independent disagreements, conflicts, rollback and cancellation passed.');
  const textVariant={field:'title',locale:'PT-BR',form:'full',sourceKey:'anirium:editorial',value:'Arco — início 日本語'};
  for(const entity of [arcFixture.universe,arcFixture.arc,arcFixture.work,arcFixture.season,arcFixture.episode]) {
    await database.withTransaction(async client=>{
      await contentInfo.setContentEntityTexts(client,entity.id,[textVariant]);
      await contentInfo.setContentEntityTexts(client,entity.id,[textVariant]);
      const info=await contentInfo.getContentEntityInfo(client,entity.id);
      assert.equal(info.entity.kind,entity.kind);
      assert.equal(info.texts[0].value,textVariant.value);
      assert.equal(info.texts[0].locale,'pt-br');
      assert.equal(info.texts[0].revision,1);
      assert.equal(info.aliases.length,1);
      await assert.rejects(()=>contentInfo.setContentEntityTexts(client,entity.id,[{...textVariant,value:'changed'},{...textVariant,field:'description',value:123}]),/Invalid content text/);
      assert.equal((await contentInfo.getContentEntityInfo(client,entity.id)).texts[0].value,textVariant.value,'invalid later input makes no early writes');
    });
  }
  await assert.rejects(()=>database.withTransaction(async client=>{
    await contentInfo.setContentEntityTexts(client,arcFixture.arc.id,[{...textVariant,value:'rollback'}]);
    throw new Error('content downstream rollback');
  }),/content downstream rollback/);
  assert.equal((await database.withTransaction(client=>contentInfo.getContentEntityInfo(client,arcFixture.arc.id))).texts[0].value,textVariant.value);
  assert.equal(await database.withTransaction(client=>contentInfo.getContentEntityInfo(client,crypto.randomUUID())),null);
  await database.withTransaction(async client=>{
    const plugin=await index.ensureEntity({namespace:'content-info-test',value:'plugin',sourceKey:'fixture'},{kind:'PLUGIN'},client);
    const privateEntity=await index.ensureEntity({namespace:'content-info-test',value:'private',sourceKey:'fixture'},{kind:'ARC',ownerId:'owner'},client);
    for(const entity of [plugin,privateEntity]) {
      assert.equal(await contentInfo.getContentEntityInfo(client,entity.id),null);
      assert.equal(await relations.readContentRelations(client,entity.id,{relation:'arcs'}),null,'private/noncontent relation context excluded');
      await assert.rejects(()=>contentInfo.setContentEntityTexts(client,entity.id,[textVariant]),/Public content unavailable/);
    }
  });
  console.log('Canonical own content info: all five levels, Unicode/locale, replay, whole-input validation, rollback, missing/private/wrong-kind exclusion passed.');
  await assert.rejects(()=>database.withTransaction(client=>arcs.registerArc(client,arcFixture.otherUniverse.id,arcFixture.alias)),/franchise conflict/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query('UPDATE canonical_arcs SET universe_id=$2 WHERE arc_id=$1',[arcFixture.arc.id,arcFixture.otherUniverse.id]);
  }),/classification conflict/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query('DELETE FROM canonical_memberships WHERE child_id=$1',[arcFixture.work.id]);
    await index.linkContentEntities(client,arcFixture.otherUniverse.id,arcFixture.work.id,0,'fixture');
  }),/classification conflict/);
  assert.equal((await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[arcFixture.work.id])).rows[0].parent_id,arcFixture.universe.id,'failed reparent rolls back');
  await assert.rejects(()=>database.withTransaction(client=>arcs.linkArcEpisode(client,arcFixture.arc.id,arcFixture.work.id,0,'fixture')),/foreign key/);
  await assert.rejects(()=>database.withTransaction(client=>arcs.linkArcEpisode(client,arcFixture.arc.id,arcFixture.episode.id,'1','fixture')),/Invalid arc episode order/);
  console.log('ARC classification: parallel episode membership, replay, typed FK, franchise conflict and reparent rollback passed.');
  await database.withTransaction(client=>arcs.linkArcEpisode(client,arcFixture.arc.id,arcFixture.episode.id,7,'fixture'));
  const reorderedRelations=await database.withTransaction(client=>relations.readContentRelations(client,arcFixture.arc.id,{relation:'episodes'}));
  assert.equal(reorderedRelations.items[0].id,arcFixture.episode.id);
  assert.equal(reorderedRelations.items[0].displayOrder,7,'reader returns current typed display order');
  assert.equal((await pool.query('SELECT display_order,revision FROM canonical_arc_episodes WHERE arc_id=$1',[arcFixture.arc.id])).rows[0].display_order,7);
  await Promise.all(Array.from({length:4},()=>database.withTransaction(client=>arcs.linkArcEpisode(client,arcFixture.arc.id,arcFixture.episode.id,7,'fixture'))));
  assert.equal((await pool.query('SELECT revision FROM canonical_arc_episodes WHERE arc_id=$1',[arcFixture.arc.id])).rows[0].revision,2,'concurrent identical writes preserve revision');
  await assert.rejects(()=>database.withTransaction(async client=>{
    const privateArc=await index.ensureEntity({namespace:'private-arc-fixture',value:crypto.randomUUID(),sourceKey:'fixture'},{kind:'ARC',ownerId:'owner'},client);
    await client.query('INSERT INTO canonical_arcs(arc_id,universe_id,source_key) VALUES($1,$2,$3)',[privateArc.id,arcFixture.universe.id,'fixture']);
  }),/classification conflict/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    const privateUniverse=await index.ensureEntity({namespace:'private-arc-fixture',value:crypto.randomUUID(),sourceKey:'fixture'},{kind:'UNIVERSE',ownerId:'owner'},client);
    await arcs.registerArc(client,privateUniverse.id,{namespace:'private-arc-fixture',value:crypto.randomUUID(),sourceKey:'fixture'});
  }),/classification conflict/);
  await assert.rejects(()=>database.withTransaction(client=>client.query('DELETE FROM canonical_memberships WHERE child_id=$1',[arcFixture.episode.id])),/classification conflict/);
  const classifiedBefore=(await pool.query('SELECT * FROM canonical_arc_episodes WHERE episode_id=$1 ORDER BY arc_id',[arcFixture.episode.id])).rows;
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query('DELETE FROM canonical_arc_episodes WHERE episode_id=$1',[arcFixture.episode.id]);
    await client.query('DELETE FROM canonical_memberships WHERE child_id=$1',[arcFixture.work.id]);
    await index.linkContentEntities(client,arcFixture.otherUniverse.id,arcFixture.work.id,0,'fixture');
    throw new Error('arc downstream rollback');
  }),/arc downstream rollback/);
  assert.deepEqual((await pool.query('SELECT * FROM canonical_arc_episodes WHERE episode_id=$1 ORDER BY arc_id',[arcFixture.episode.id])).rows,classifiedBefore,'classification removal and move roll back together');
  await database.withTransaction(async client=>{
    await client.query('DELETE FROM canonical_arc_episodes WHERE episode_id=$1',[arcFixture.episode.id]);
    await client.query('DELETE FROM canonical_memberships WHERE child_id=$1',[arcFixture.work.id]);
    await index.linkContentEntities(client,arcFixture.otherUniverse.id,arcFixture.work.id,0,'fixture');
  });
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM canonical_arc_episodes WHERE episode_id=$1',[arcFixture.episode.id])).rows[0].n,0);
  assert.equal((await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[arcFixture.work.id])).rows[0].parent_id,arcFixture.otherUniverse.id,'explicit unlink permits coherent move');
  console.log('ARC affected-scope integrity: reorder, concurrent replay, private scopes, detach rejection and atomic unlink/reparent passed.');
  const airingIngestion=load('airingIngestion');
  await database.withTransaction(client=>index.bindEntityAlias(arcFixture.season.id,{namespace:'anilist:season',value:'7845312',sourceKey:'fixture:verified-season'},client));
  const airingBatch={scope:'fixture-window',expectedRevision:0,nextCursor:'page:2',observedAt:10000,entries:[{id:7845313,mediaId:7845312,episode:3,airingAt:20000}]};
  const accepted=await database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,airingBatch));
  assert.equal(accepted.revision,1);
  assert.equal(accepted.cursor,'page:2');
  assert.equal((await database.withTransaction(client=>contentFacts.readEpisodeAirings(client,accepted.episodeIds[0])))[0].scheduledAt,20000000);
  const replay=await database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,{...airingBatch,expectedRevision:1,nextCursor:'page:3'}));
  assert.equal(replay.episodeIds[0],accepted.episodeIds[0]);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1',[accepted.episodeIds[0]])).rows[0].n,2);
  await assert.rejects(()=>database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,airingBatch)),/Stale ingestion checkpoint/);
  await assert.rejects(()=>database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,{...airingBatch,expectedRevision:2,entries:[{id:7845314,mediaId:7845312,episode:4,airingAt:30000},{id:7845315,mediaId:9999999,episode:5,airingAt:40000}]})),/season identity unavailable/);
  assert.equal(await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:airing-schedule','7845314',null)),null,'earlier entry rolls back on missing later season');
  assert.equal((await database.withTransaction(client=>airingIngestion.readAiringIngestionCheckpoint(client,airingBatch.scope))).revision,2,'failed page leaves checkpoint unchanged');
  await assert.rejects(()=>database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,{...airingBatch,expectedRevision:2,entries:[{...airingBatch.entries[0],episode:4}]})),/alias conflict/i);
  await assert.rejects(()=>database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,{...airingBatch,expectedRevision:2,observedAt:9999})),/Older ingestion observation/);
  const airingAttempts=await Promise.allSettled(Array.from({length:2},()=>database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,{...airingBatch,expectedRevision:2,nextCursor:'page:4',entries:[]}))));
  assert.equal(airingAttempts.filter(result=>result.status==='fulfilled').length,1,'one concurrent checkpoint contender commits');
  assert.equal(airingAttempts.filter(result=>result.status==='rejected').length,1);
  assert.equal((await database.withTransaction(client=>airingIngestion.readAiringIngestionCheckpoint(client,airingBatch.scope))).revision,3);
  const batchTemplate=(await pool.query('SELECT * FROM canonical_ingestion_batches WHERE source_key=$1 AND scope=$2 AND revision=1',['anilist:airing-schedule',airingBatch.scope])).rows[0];
  const batchItemTemplate=(await pool.query('SELECT * FROM canonical_ingestion_batch_items WHERE source_key=$1 AND scope=$2 AND revision=1',['anilist:airing-schedule',airingBatch.scope])).rows[0];
  assert.equal(batchTemplate.entry_count,1);
  assert.equal(batchTemplate.payload[0].id,String(airingBatch.entries[0].id));
  assert.equal(batchItemTemplate.entity_id,accepted.episodeIds[0]);
  await assert.rejects(()=>pool.query("UPDATE canonical_ingestion_checkpoints SET revision=revision+1,cursor='fake-page' WHERE source_key=$1 AND scope=$2",['anilist:airing-schedule',airingBatch.scope]),/batch manifest required/);
  for(const mode of ['missingItems','wrongFact','badHash']) {
    await assert.rejects(()=>database.withTransaction(async client=>{
      const entry={...batchItemTemplate.entry,...(mode==='wrongFact'?{scheduledAt:batchItemTemplate.entry.scheduledAt+1000}:{})};
      const payload=JSON.stringify([entry]);
      await client.query(`INSERT INTO canonical_ingestion_batches(source_key,scope,revision,observed_at,entry_count,payload,payload_hash)
        VALUES($1,$2,4,$3,1,$4::jsonb,${mode==='badHash'?"repeat('0',64)":"encode(sha256(convert_to(($4::jsonb)::text,'UTF8')),'hex')"})`,['anilist:airing-schedule',airingBatch.scope,batchTemplate.observed_at,payload]);
      if(mode==='wrongFact') await client.query(`INSERT INTO canonical_ingestion_batch_items(source_key,scope,revision,entity_id,alias_id,season_alias_id,observed_at,entry)
        VALUES($1,$2,4,$3,$4,$5,$6,$7::jsonb)`,['anilist:airing-schedule',airingBatch.scope,batchItemTemplate.entity_id,batchItemTemplate.alias_id,batchItemTemplate.season_alias_id,batchItemTemplate.observed_at,JSON.stringify(entry)]);
      await client.query("UPDATE canonical_ingestion_checkpoints SET revision=revision+1,cursor='fake-page' WHERE source_key=$1 AND scope=$2",['anilist:airing-schedule',airingBatch.scope]);
    }),mode==='missingItems'?/batch coverage conflict/:mode==='wrongFact'?/batch fact conflict/:/check constraint/);
  }
  assert.equal((await database.withTransaction(client=>airingIngestion.readAiringIngestionCheckpoint(client,airingBatch.scope))).revision,3,'bad manifests roll back checkpoint and auto audit');
  assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM canonical_ingestion_batches WHERE source_key=$1 AND scope=$2 AND revision=4',['anilist:airing-schedule',airingBatch.scope])).rows[0].n,0);
  await assert.rejects(()=>pool.query('UPDATE canonical_ingestion_batches SET payload=payload'),/immutable/);
  await assert.rejects(()=>pool.query('DELETE FROM canonical_ingestion_batch_items WHERE source_key=$1 AND scope=$2',['anilist:airing-schedule',airingBatch.scope]),/immutable/);
  const ingestionCommitRows=(await pool.query('SELECT revision,entry_type FROM canonical_ingestion_commits WHERE source_key=$1 AND scope=$2 ORDER BY revision',['anilist:airing-schedule',airingBatch.scope])).rows;
  assert.deepEqual(ingestionCommitRows,[{revision:1,entry_type:'advance'},{revision:2,entry_type:'advance'},{revision:3,entry_type:'advance'}]);
  for(const sql of [
    'UPDATE canonical_ingestion_checkpoints SET revision=revision+2 WHERE source_key=$1 AND scope=$2',
    'UPDATE canonical_ingestion_checkpoints SET revision=revision-1 WHERE source_key=$1 AND scope=$2',
    "UPDATE canonical_ingestion_checkpoints SET revision=revision+1,observed_at=1 WHERE source_key=$1 AND scope=$2",
    "UPDATE canonical_ingestion_checkpoints SET revision=revision+1,scope='other-scope' WHERE source_key=$1 AND scope=$2",
    'DELETE FROM canonical_ingestion_checkpoints WHERE source_key=$1 AND scope=$2',
  ]) await assert.rejects(()=>pool.query(sql,['anilist:airing-schedule',airingBatch.scope]),/checkpoint/);
  await assert.rejects(()=>pool.query("INSERT INTO canonical_ingestion_checkpoints(source_key,scope,revision,cursor,observed_at) VALUES('fixture','invalid-init',1,'page:2',1000)"),/initial ingestion checkpoint/);
  await assert.rejects(()=>pool.query('TRUNCATE canonical_ingestion_checkpoints CASCADE'),/immutable/);
  await assert.rejects(()=>pool.query('UPDATE canonical_ingestion_commits SET cursor=cursor'),/immutable/);
  await assert.rejects(()=>pool.query("INSERT INTO canonical_ingestion_commits(source_key,scope,revision,cursor,observed_at,entry_type) VALUES($1,$2,4,'page:5',10000,'advance')",['anilist:airing-schedule',airingBatch.scope]),/commit checkpoint conflict/);
  await assert.rejects(()=>pool.query('DELETE FROM canonical_ingestion_commits WHERE source_key=$1 AND scope=$2',['anilist:airing-schedule',airingBatch.scope]),/immutable/);
  assert.equal((await database.withTransaction(client=>airingIngestion.readAiringIngestionCheckpoint(client,airingBatch.scope))).revision,3);
  assert.deepEqual((await pool.query('SELECT revision,entry_type FROM canonical_ingestion_commits WHERE source_key=$1 AND scope=$2 ORDER BY revision',['anilist:airing-schedule',airingBatch.scope])).rows,ingestionCommitRows,'invalid SQL leaves checkpoint and history intact');
  await assert.rejects(()=>database.withTransaction(async client=>{
    await airingIngestion.ingestAniListAiringBatch(client,{...airingBatch,scope:'rollback-window',entries:[]});
    throw new Error('ingestion downstream rollback');
  }),/ingestion downstream rollback/);
  assert.equal((await database.withTransaction(client=>airingIngestion.readAiringIngestionCheckpoint(client,'rollback-window'))).revision,0);
  assert.equal((await pool.query("SELECT COUNT(*)::integer AS n FROM canonical_ingestion_commits WHERE scope='rollback-window'")).rows[0].n,0,'downstream rollback also removes generated commit history');
  assert.equal((await pool.query(`SELECT COUNT(*)::integer AS n FROM canonical_ingestion_checkpoints p
    LEFT JOIN canonical_ingestion_commits c ON c.source_key=p.source_key AND c.scope=p.scope AND c.revision=p.revision
    WHERE p.revision>0 AND (c.cursor IS DISTINCT FROM p.cursor OR c.observed_at IS DISTINCT FROM p.observed_at)`)).rows[0].n,0,'SQL oracle: every advanced checkpoint matches its audit record');
  const auditBeforeReapply=(await pool.query('SELECT * FROM canonical_ingestion_commits ORDER BY source_key,scope,revision')).rows;
  await database.withTransaction(client=>client.query(load('entitySchema').entitySchemaSQL));
  assert.deepEqual((await pool.query('SELECT * FROM canonical_ingestion_commits ORDER BY source_key,scope,revision')).rows,auditBeforeReapply,'schema reapplication preserves advance history without inventing baselines');
  console.log('AniList airing ingestion: canonical episode/source alias, replay, atomic page/checkpoint rollback, missing identity, alias conflict and concurrent checkpoint ownership passed.');
  const mediaIngestion=load('anilistMediaIngestion');
  const mediaSnapshot={...mediaDetailsFixture(),id:980001,idMal:990001,type:'ANIME',format:'TV',episodes:12,status:'RELEASING',averageScore:0,countryOfOrigin:'JP',
    title:{romaji:'Obra da fonte',english:'Source title',native:'元の題名'},
    relations:{pageInfo:{hasNextPage:false},edges:[{relationType:'SEQUEL',node:{id:980002,type:'ANIME',format:'TV',episodes:null}}]}};
  const preparedMedia=await database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,mediaSnapshot,1000));
  assert.ok(preparedMedia.seasonId);assert.ok(preparedMedia.workId);assert.equal(preparedMedia.universeIds.length,1);
  assert.deepEqual(plain(await database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,mediaSnapshot,1000))),plain(preparedMedia),'replay preserves canonical media topology identities');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM anime_catalog WHERE id_anilist=980001')).rows[0].n,0,'source preparation does not create a site route');
  const preparedMal=await database.withTransaction(client=>index.resolveEntityAlias(client,'mal:season','990001',null));
  assert.equal(preparedMal.id,preparedMedia.seasonId,'idMal from the same source proves release identity');
  const preparedMetadata=(await pool.query("SELECT field,value_type,value FROM canonical_content_facts WHERE entity_id=$1 AND source_key='anilist:media' ORDER BY field",[preparedMedia.seasonId])).rows;
  assert.equal(preparedMetadata.find(row=>row.field==='media.averageScore').value,0);
  assert.equal(preparedMetadata.find(row=>row.field==='media.episodes').value,12);
  assert.equal(preparedMetadata.find(row=>row.field==='media.idMal').value,'990001');
  assert.equal(preparedMetadata.find(row=>row.field==='title.native').value,'元の題名');
  assert.deepEqual(preparedMetadata.find(row=>row.field==='media.genres').value,['Adventure','Sci-Fi']);
  assert.equal(preparedMetadata.find(row=>row.field==='media.genres').value_type,'string-list');
  assert.deepEqual(preparedMetadata.find(row=>row.field==='media.synonyms').value,['Outro nome','別名']);
  assert.equal(preparedMetadata.find(row=>row.field==='media.durationMinutes').value,0);
  assert.equal(preparedMetadata.find(row=>row.field==='media.isAdult').value,false);
  assert.equal(preparedMetadata.find(row=>row.field==='media.isLicensed').value,true);
  assert.equal(preparedMetadata.find(row=>row.field==='media.sourceUpdatedAt').value,0);
  assert.equal(preparedMetadata.find(row=>row.field==='media.sourceUpdatedAt').value_type,'instant');
  assert.equal(preparedMetadata.find(row=>row.field==='media.startDate.day').value,null);
  assert.equal(preparedMetadata.find(row=>row.field==='media.startDate.month').value,10);
  assert.equal(preparedMetadata.find(row=>row.field==='media.cover.color').value,'#123abc');
  assert.equal((await database.withTransaction(client=>contentInfo.getContentEntityInfo(client,preparedMedia.seasonId))).texts.find(row=>row.field==='description' && row.sourceKey==='anilist:media').value,'Descrição própria 日本語');
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM canonical_content_fact_heads h JOIN canonical_content_facts f USING(entity_id,alias_id,source_key,field,observed_at)
    WHERE h.entity_id=$1 AND h.field='media.genres' AND f.value_type='string-list' AND f.value ? 'Adventure'`,[preparedMedia.seasonId])).rows[0].n,1,'list filtering reads the same own current typed facts');
  assert.ok((await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND indexname='idx_content_fact_string_lists'")).rows[0].indexdef.includes('USING gin'));
  for(const invalidDetails of [{genres:'Adventure'},{genres:['Adventure',false]},{synonyms:undefined},{duration:'24'},
    {isAdult:'false'},{updatedAt:1.5},{startDate:{year:2025,month:2,day:29}},{startDate:{year:2026,month:10}},
    {coverImage:{...mediaSnapshot.coverImage,color:'red'}},{bannerImage:'https://user:password@example.invalid/x'}])
    await assert.rejects(()=>database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,{...mediaSnapshot,...invalidDetails},2000)),/Invalid AniList media details/);
  const detailModule=load('anilistMediaDetails');
  assert.ok(detailModule.aniListMediaDetailFacts({...mediaSnapshot,startDate:{year:null,month:2,day:29}}));
  assert.ok(detailModule.aniListMediaDetailFacts({...mediaSnapshot,startDate:{year:2024,month:2,day:29}}));
  assert.equal((await database.withTransaction(client=>contentInfo.getContentEntityInfo(client,preparedMedia.seasonId))).texts.find(row=>row.locale==='en').value,'Source title');
  for(const invalidMedia of [{...mediaSnapshot,episodes:'12'},{...mediaSnapshot,idMal:'990001'},
    {...mediaSnapshot,averageScore:101},{...mediaSnapshot,relations:{...mediaSnapshot.relations,pageInfo:{hasNextPage:true}}},
    {...mediaSnapshot,title:{...mediaSnapshot.title,english:undefined}}])
    await assert.rejects(()=>database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,invalidMedia,2000)),/Invalid AniList media snapshot/);
  await assert.rejects(()=>database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,{...mediaSnapshot,averageScore:5},1000)),/Conflicting content observation/);
  assert.equal((await pool.query("SELECT value FROM canonical_content_facts WHERE entity_id=$1 AND field='media.averageScore'",[preparedMedia.seasonId])).rows[0].value,0);
  await database.withTransaction(client=>contentInfo.setContentEntityTexts(client,preparedMedia.seasonId,[{field:'title',locale:'en',form:'default',sourceKey:'anirium:editorial',value:'Independent editorial title'}]));
  await database.withTransaction(client=>contentInfo.setContentEntityTexts(client,preparedMedia.seasonId,[{field:'description',locale:'und',form:'markdown',sourceKey:'anirium:editorial',value:'Independent editorial description'}]));
  const clearedDetailSnapshot={...mediaSnapshot,averageScore:null,title:{...mediaSnapshot.title,english:null},description:null,genres:[],synonyms:null,coverImage:null};
  await database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,clearedDetailSnapshot,2000));
  await database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,JSON.parse(JSON.stringify(clearedDetailSnapshot)),2000));
  const clearedDetailFacts=await database.withTransaction(client=>contentFacts.readCurrentContentFacts(client,preparedMedia.seasonId));
  assert.deepEqual(plain(clearedDetailFacts.find(row=>row.field==='media.genres').value),[],'explicit empty list is known empty');
  assert.equal(clearedDetailFacts.find(row=>row.field==='media.synonyms').value,null,'unknown list remains null');
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM canonical_content_facts WHERE entity_id=$1 AND source_key='anilist:media' AND observed_at=2000",[preparedMedia.seasonId])).rows[0].n,detailModule.anilistObservationFields.length,'structural list replay does not duplicate or omit facts');
  const clearedMediaInfo=await database.withTransaction(client=>contentInfo.getContentEntityInfo(client,preparedMedia.seasonId));
  assert.equal(clearedMediaInfo.texts.some(row=>row.locale==='en' && row.sourceKey==='anilist:media'),false,'explicit null clears only this source title projection');
  assert.equal(clearedMediaInfo.texts.find(row=>row.field==='title' && row.sourceKey==='anirium:editorial').value,'Independent editorial title');
  assert.equal(clearedMediaInfo.texts.some(row=>row.field==='description' && row.sourceKey==='anilist:media'),false);
  assert.equal(clearedMediaInfo.texts.find(row=>row.field==='description' && row.sourceKey==='anirium:editorial').value,'Independent editorial description');
  await assert.rejects(()=>database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,mediaSnapshot,1500)),/Older media observation/);
  const relatedMediaSnapshot={...mediaSnapshot,id:980002,idMal:990002,episodes:24,relations:{pageInfo:{hasNextPage:false},edges:[]}};
  await database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,relatedMediaSnapshot,3000));
  await assert.rejects(()=>database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,mediaSnapshot,2500)),/Older media observation/);
  const relatedMediaEntity=await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','980002',null));
  assert.equal((await pool.query('SELECT episode_count FROM canonical_release_facts WHERE season_id=$1',[relatedMediaEntity.id])).rows[0].episode_count,24,'older neighboring snapshot cannot overwrite a newer own count');
  assert.equal((await database.withTransaction(client=>contentFacts.readCurrentContentFacts(client,relatedMediaEntity.id))).find(row=>row.field==='media.episodes' && row.sourceKey==='anilist:media').value,24);
  await assert.rejects(()=>database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,{...mediaSnapshot,relations:{...mediaSnapshot.relations,edges:[{relationType:'SEQUEL',node:{id:980002,type:'ANIME',format:'TV'}}]}},4000)),/Invalid AniList related media/);
  const unknownMedia={...mediaSnapshot,id:980010,idMal:null,format:null,episodes:null,status:null,averageScore:null,countryOfOrigin:null,title:{romaji:null,english:null,native:null},relations:{pageInfo:{hasNextPage:false},edges:[]}};
  const unknownPrepared=await database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,unknownMedia,1000));
  assert.equal((await pool.query("SELECT value_type,value FROM canonical_content_facts WHERE entity_id=$1 AND field='media.episodes'",[unknownPrepared.seasonId])).rows[0].value,null);
  await assert.rejects(()=>database.withTransaction(async client=>{
    await mediaIngestion.ingestAniListMediaSnapshot(client,{...mediaSnapshot,id:980011,idMal:990011,relations:{pageInfo:{hasNextPage:false},edges:[]}},1000);
    throw new Error('media downstream failure');
  }),/media downstream failure/);
  assert.equal(await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','980011',null)),null);
  await assert.rejects(()=>database.withTransaction(client=>mediaIngestion.ingestAniListMediaSnapshot(client,{...mediaSnapshot,id:980012,relations:{pageInfo:{hasNextPage:false},edges:[]}},1000)),/Canonical alias conflict/);
  assert.equal(await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','980012',null)),null);
  const sourcePreparedBatch=await database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,{scope:'fixture-source-prepared',expectedRevision:0,nextCursor:'complete',observedAt:1000,entries:[{id:980101,mediaId:980001,episode:1,airingAt:2000000000}]}));
  assert.equal(sourcePreparedBatch.episodeIds.length,1,'prepared media alias enables native episode ingestion');
  const fetchedMedia=await mediaIngestion.fetchAniListMediaSnapshot(980001,async()=>({ok:true,json:async()=>({data:{Media:mediaSnapshot}})}));
  assert.equal(fetchedMedia.media.id,980001);
  await assert.rejects(()=>mediaIngestion.fetchAniListMediaSnapshot(980001,async()=>({ok:true,json:async()=>({data:{Media:{...mediaSnapshot,id:980099}}})})),/Invalid AniList media snapshot/);
  await assert.rejects(()=>mediaIngestion.fetchAniListMediaSnapshot(980001,async()=>({ok:true,json:async()=>({errors:[{message:'fixture'}]})})),/GraphQL failure/);
  await assert.rejects(()=>mediaIngestion.fetchAniListMediaSnapshot(980001,async()=>({ok:false,status:429,headers:{get:()=> '60'}})),error=>error.status===429 && error.retryAfter==='60');
  console.log('AniList media native preparation: source topology stable identities without route, proven MAL release binding, typed zero/null/IDs/texts, strict omission/pagination validation, source-specific null clearing, stale/conflict/rollback and subsequent native episode ingestion passed.');
  const collection=load('collectionWindow');
  await database.withTransaction(client=>collection.startAiringCollection(client,'fixture-collection',0,30000000,50));
  await database.withTransaction(client=>collection.acceptAiringCollectionPage(client,{scope:'fixture-collection',page:1,observedAt:10000,hasMore:true,entries:airingBatch.entries}));
  const resumed=await database.withTransaction(client=>collection.startAiringCollection(client,'fixture-collection',0,30000000,50));
  assert.equal(resumed.next_page,2);
  assert.equal(resumed.checkpoint_revision,1);
  assert.equal(typeof resumed.window_start,'number');
  assert.equal(typeof resumed.window_end,'number');
  await assert.rejects(()=>database.withTransaction(client=>collection.acceptAiringCollectionPage(client,{scope:'fixture-collection',page:1,observedAt:10000,hasMore:false,entries:[]})),/Stale collection page/);
  await assert.rejects(()=>database.withTransaction(client=>collection.acceptAiringCollectionPage(client,{scope:'fixture-collection',page:2,observedAt:10000,hasMore:true,entries:[]})),/page receipt conflict/);
  assert.equal((await database.withTransaction(client=>collection.startAiringCollection(client,'fixture-collection',0,30000000,50))).next_page,2,'bad page rolls back window/facts/checkpoint/receipts');
  await assert.rejects(()=>pool.query("UPDATE canonical_collection_windows SET next_page=next_page+2,checkpoint_revision=checkpoint_revision+1 WHERE scope='fixture-collection'"),/collection transition/);
  await assert.rejects(()=>pool.query("UPDATE canonical_collection_windows SET window_end=window_end+1,next_page=next_page+1,checkpoint_revision=checkpoint_revision+1 WHERE scope='fixture-collection'"),/collection transition/);
  const collectionContenders=await Promise.allSettled(Array.from({length:2},()=>database.withTransaction(client=>collection.acceptAiringCollectionPage(client,{scope:'fixture-collection',page:2,observedAt:10000,hasMore:false,entries:[]}))));
  assert.equal(collectionContenders.filter(result=>result.status==='fulfilled').length,1,'one collector owns the pending page');
  assert.equal(collectionContenders.filter(result=>result.status==='rejected').length,1);
  const completed=await database.withTransaction(client=>collection.startAiringCollection(client,'fixture-collection',0,30000000,50));
  assert.equal(completed.status,'complete');
  assert.equal(completed.next_page,3);
  await assert.rejects(()=>pool.query("UPDATE canonical_collection_windows SET status='collecting',next_page=next_page+1,checkpoint_revision=checkpoint_revision+1 WHERE scope='fixture-collection'"),/collection transition/);
  assert.equal((await pool.query("SELECT COUNT(*)::integer AS n FROM canonical_collection_pages WHERE scope='fixture-collection'")).rows[0].n,2);
  await database.withTransaction(client=>collection.startAiringCollection(client,'fixture-bounded-collection',0,1000,50));
  await assert.rejects(()=>database.withTransaction(client=>collection.acceptAiringCollectionPage(client,{scope:'fixture-bounded-collection',page:1,observedAt:10000,hasMore:false,entries:airingBatch.entries})),/page receipt conflict/);
  assert.equal((await database.withTransaction(client=>collection.startAiringCollection(client,'fixture-bounded-collection',0,1000,50))).next_page,1);
  await assert.rejects(()=>database.withTransaction(client=>airingIngestion.ingestAniListAiringBatch(client,{...airingBatch,scope:'fixture-bounded-collection',entries:[]})),/Collection coverage conflict/);
  const completedWindowBefore=(await pool.query("SELECT * FROM canonical_collection_windows WHERE scope='fixture-collection'")).rows[0];
  await database.withTransaction(client=>client.query(load('entitySchema').entitySchemaSQL));
  assert.deepEqual((await pool.query("SELECT * FROM canonical_collection_windows WHERE scope='fixture-collection'")).rows[0],completedWindowBefore,'schema replay preserves completed collection state');
  console.log('Typed collection window: persisted page resumption, stale page, empty-more rejection, skip/boundary mutation prevention, terminal completion and receipt rollback passed.');
  const collector=load('airingCollector');
  const collectorInput={scope:'fixture-executable-collector',start:1000,end:30000000,pageSize:50};
  const requestedPages=[];
  const successfulSource=async (_url,init)=>{
    const request=JSON.parse(init.body);requestedPages.push(request.variables.page);
    assert.equal(request.variables.start,0);
    assert.equal(request.variables.end,30000);
    const page=request.variables.page;
    return {ok:true,json:async()=>({data:{Page:{pageInfo:{currentPage:page,perPage:50,hasNextPage:page===1},airingSchedules:page===1?airingBatch.entries:[]}}})};
  };
  assert.equal((await collector.collectAiringWindowPage(collectorInput,successfulSource)).status,'collecting');
  for(const badSource of [
    async()=>({ok:false,status:429,headers:{get:()=> '30'}}),
    async()=>({ok:true,json:async()=>({data:{Page:{pageInfo:{currentPage:99,perPage:50,hasNextPage:false},airingSchedules:[]}}})}),
    async()=>({ok:true,json:async()=>({errors:[{message:'failed'}]})}),
  ]) await assert.rejects(()=>collector.collectAiringWindowPage(collectorInput,badSource),/source/);
  assert.equal((await database.withTransaction(client=>collection.startAiringCollection(client,collectorInput.scope,collectorInput.start,collectorInput.end))).next_page,2,'network failures preserve pending page');
  assert.equal((await collector.collectAiringWindowPage(collectorInput,successfulSource)).status,'complete');
  assert.deepEqual(requestedPages,[1,2],'execution resumes persisted page');
  assert.equal((await collector.collectAiringWindowPage(collectorInput,()=>{throw new Error('completed collection must not fetch');})).status,'complete');
  console.log('Executable collector: native SQL transactions, persisted resumption, HTTP429/GraphQL/mismatched-page failure and terminal no-fetch passed using controlled upstream responses.');
  const preparationWindow={scope:'fixture-collector-media-preparation',start:1999999999000,end:2000000001000,pageSize:50};
  const orphanPreparationSeason=await database.withTransaction(client=>index.ensureEntity({namespace:'anilist:season',value:'980020',sourceKey:'fixture:orphan-release'},{kind:'SEASON'},client));
  const preparationRequests=[];
  const preparationSource=(mediaId,eventId,malId)=>async(_url,init)=>{
    const request=JSON.parse(init.body);preparationRequests.push(request.variables);
    return request.variables.id!==undefined
      ? {ok:true,json:async()=>({data:{Media:{...mediaSnapshot,id:mediaId,idMal:malId,relations:{pageInfo:{hasNextPage:false},edges:[]}}}})}
      : {ok:true,json:async()=>({data:{Page:{pageInfo:{currentPage:request.variables.page,perPage:50,hasNextPage:false},airingSchedules:[{id:eventId,mediaId,episode:1,airingAt:2000000000}]}}})};
  };
  assert.equal((await collector.collectAiringWindowPage(preparationWindow,preparationSource(980020,980201,990020))).status,'complete');
  assert.equal(preparationRequests.filter(request=>request.id===980020).length,1);
  const automaticallyPrepared=await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','980020',null));
  assert.ok(automaticallyPrepared);
  assert.equal(automaticallyPrepared.id,orphanPreparationSeason.id,'orphan release identity survives source hierarchy preparation');
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM canonical_memberships WHERE child_id=$1 AND parent_kind='WORK'",[automaticallyPrepared.id])).rows[0].n,1);
  assert.equal((await collector.collectAiringWindowPage(preparationWindow,()=>{throw new Error('completed prepared window must not fetch');})).status,'complete');
  const conflictingPreparation={...preparationWindow,scope:'fixture-collector-media-rollback'};
  await assert.rejects(()=>collector.collectAiringWindowPage(conflictingPreparation,preparationSource(980021,980101,990021)),/Canonical alias conflict/);
  assert.equal(await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','980021',null)),null,'episode binding failure rolls back prepared media and all facts');
  const failedPreparation=await database.withTransaction(client=>collection.startAiringCollection(client,conflictingPreparation.scope,conflictingPreparation.start,conflictingPreparation.end));
  assert.equal(failedPreparation.next_page,1);assert.equal(failedPreparation.checkpoint_revision,0);
  assert.equal((await collector.collectAiringWindowPage(conflictingPreparation,preparationSource(980021,980202,990021))).status,'complete');
  const concurrentPreparation={...preparationWindow,scope:'fixture-collector-media-concurrent'};
  const concurrentMediaSource=preparationSource(980030,980203,null);
  const mediaContenders=await Promise.allSettled([1,2].map(()=>collector.collectAiringWindowPage(concurrentPreparation,concurrentMediaSource)));
  assert.equal(mediaContenders.filter(result=>result.status==='fulfilled').length,1,'one pending page commits preparation and episodes');
  const concurrentMedia=await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','980030',null));
  assert.ok(concurrentMedia);
  assert.equal((await database.withTransaction(client=>collection.startAiringCollection(client,concurrentPreparation.scope,concurrentPreparation.start,concurrentPreparation.end))).checkpoint_revision,1);
  console.log('Collector media preparation PostgreSQL: missing release snapshot fetched outside transaction, source hierarchy/facts+episode/page atomic commit, episode alias failure rolls back preparation, retry and concurrent single page winner passed.');
  const scheduleModule=load('collectionSchedule'),scheduleId=crypto.randomUUID();
  const scheduleInput={id:scheduleId,start:1000,windowMs:10000,intervalMs:3000,lookbackMs:2000,dueAt:5000};
  await database.withTransaction(client=>scheduleModule.registerCollectionSchedule(client,scheduleInput));
  assert.equal(await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,4999)),null);
  const scheduledWindow=await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,5000));
  assert.equal(scheduledWindow.start,1000);
  await assert.rejects(()=>database.withTransaction(client=>scheduleModule.advanceCollectionSchedule(client,scheduleId,0,6000)),/schedule advance/);
  await database.withTransaction(async client=>{
    await collection.startAiringCollection(client,scheduledWindow.scope,scheduledWindow.start,scheduledWindow.end);
    await collection.acceptAiringCollectionPage(client,{scope:scheduledWindow.scope,page:1,observedAt:Date.now(),hasMore:false,entries:[]});
  });
  const scheduleResults=await Promise.allSettled([1,2].map(()=>database.withTransaction(client=>scheduleModule.advanceCollectionSchedule(client,scheduleId,0,6000))));
  assert.equal(scheduleResults.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,8999)),null);
  const nextScheduledWindow=await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,9000));
  assert.equal(nextScheduledWindow.start,9000,'limited correction overlap retained');
  assert.equal(nextScheduledWindow.sequence,1);
  await assert.rejects(()=>pool.query('UPDATE canonical_collection_schedules SET sequence=sequence+1,next_start=next_start+8000,due_at=due_at+3000 WHERE id=$1',[scheduleId]),/schedule advance/);
  await assert.rejects(()=>pool.query('UPDATE canonical_collection_schedules SET lookback_ms=1000 WHERE id=$1',[scheduleId]),/schedule advance/);
  await assert.rejects(()=>database.withTransaction(client=>scheduleModule.registerCollectionSchedule(client,{...scheduleInput,start:2000})),/identity conflict/);
  await load('postgres').ensurePostgresSchema();
  assert.equal((await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,9000))).sequence,1);
  console.log('Periodic schedules: due clock, SQL completion gate, single concurrent advance, bounded correction overlap, raw mutation rejection and schema replay passed.');
  const retryIds=[crypto.randomUUID(),crypto.randomUUID()].sort();
  await database.withTransaction(async client=>{
    for(const id of retryIds)await scheduleModule.registerCollectionSchedule(client,{...scheduleInput,id,dueAt:0});
  });
  assert.equal((await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,100))).id,retryIds[0]);
  await database.withTransaction(client=>scheduleModule.deferCollectionSchedule(client,retryIds[0],0,5000,'collection_failed'));
  assert.equal((await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,100))).id,retryIds[1],'ordinary failure yields to another due schedule');
  await database.withTransaction(client=>scheduleModule.deferCollectionSchedule(client,retryIds[1],0,4000,'source_rate_limited'));
  assert.equal(await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,1000)),null,'429 blocks same source across schedules');
  await database.withTransaction(client=>scheduleModule.deferCollectionSchedule(client,retryIds[1],0,6000,'collection_failed'));
  assert.equal(await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,3999)),null,'ordinary retry cannot erase existing source cooldown');
  assert.equal((await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,5000))).id,retryIds[0],'source cooldown ends independently of later ordinary failure');
  await assert.rejects(()=>database.withTransaction(client=>scheduleModule.deferCollectionSchedule(client,retryIds[0],1,7000,'collection_failed')),/Stale collection retry/);
  await assert.rejects(()=>pool.query('UPDATE canonical_collection_retries SET failures=failures+1,rate_limit_until=0 WHERE schedule_id=$1',[retryIds[1]]),/retry transition/);
  await assert.rejects(()=>pool.query('UPDATE canonical_collection_retries SET retry_at=1,failures=failures+1 WHERE schedule_id=$1',[retryIds[0]]),/retry transition/);
  await assert.rejects(()=>pool.query('UPDATE canonical_collection_retries SET rate_limit_until=1000,failures=failures+1 WHERE schedule_id=$1',[retryIds[0]]),/retry transition/);
  assert.equal(scheduleModule.collectionRetryAt(1000,'120'),121000);
  assert.equal(scheduleModule.collectionRetryAt(1000,new Date(180000).toUTCString()),180000);
  assert.equal(scheduleModule.collectionRetryAt(1000,'invalid'),61000);
  assert.equal(scheduleModule.collectionRetryAt(1000,'9999999999999999999999999999'),8640000000000000,'large source cooldown is never silently shortened');
  await load('postgres').ensurePostgresSchema();
  assert.equal((await pool.query('SELECT failures,rate_limit_until FROM canonical_collection_retries WHERE schedule_id=$1',[retryIds[1]])).rows[0].failures,2);
  console.log('SQL collection retries: ordinary failure fairness, persistent provider cooldown, no cooldown downgrade, stale sequence, typed Retry-After seconds/date/overflow and schema replay passed.');
  const refreshModule=load('mediaRefresh');
  assert.ok(await database.withTransaction(client=>refreshModule.registerMediaRefreshJobs(client,3000,20000))>0);
  assert.equal(await database.withTransaction(client=>refreshModule.registerMediaRefreshJobs(client,3000,20000)),0,'restart preserves schedules');
  assert.equal(await database.withTransaction(client=>refreshModule.readDueMediaRefresh(client,19999)),null);
  const refreshAlias=(await pool.query("SELECT id FROM canonical_aliases WHERE namespace='anilist:season' AND value='980001' AND state='active'")).rows[0].id;
  const refreshJob={aliasId:refreshAlias,mediaId:980001,revision:0,dueAt:20000};
  for(const [field,type,value] of [['media.episodes','string','13'],['media.episodes','number',13.5],['media.averageScore','number',101],
    ['media.idMal','number',990001],['media.countryOfOrigin','string','Japanese'],['title.english','string',' '],['media.unknown','string','untyped'],
    ['media.durationMinutes','number',-1],['media.isAdult','string','false'],['media.seasonYear','number',0],
    ['media.startDate.month','number',13],['media.startDate.day','number',32],['media.sourceUpdatedAt','instant',1234],
    ['media.genres','string','Adventure'],['media.cover.color','string','red'],['media.cover.large','string','http://example.invalid/x']])
    await assert.rejects(()=>pool.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at)
      VALUES($1,$2,'anilist:media',$3,$4,$5::jsonb,19000)`,[preparedMedia.seasonId,refreshAlias,field,type,JSON.stringify(value)]),/anilist_media_fact_contract/,'raw SQL source metadata requires the native field type/range');
  for(const value of [['Adventure',false],['Adventure',null],[' '],{value:'Adventure'}])
    await assert.rejects(()=>pool.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at)
      VALUES($1,$2,'fixture:list-shape','genres','string-list',$3::jsonb,19000)`,[preparedMedia.seasonId,refreshAlias,JSON.stringify(value)]),/canonical_content_fact_value_shape/);
  const refreshSnapshot={...mediaSnapshot,episodes:13,averageScore:88,title:{...mediaSnapshot.title,english:'Updated title'},relations:{pageInfo:{hasNextPage:false},edges:[]}};
  await assert.rejects(()=>database.withTransaction(client=>refreshModule.commitMediaRefresh(client,refreshJob,refreshSnapshot,19999)),/not due/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    await refreshModule.commitMediaRefresh(client,refreshJob,refreshSnapshot,21000);
    throw new Error('refresh downstream failure');
  }),/refresh downstream failure/);
  assert.equal((await pool.query('SELECT revision FROM canonical_media_refresh_jobs WHERE alias_id=$1',[refreshAlias])).rows[0].revision,'0');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM canonical_media_refresh_receipts WHERE alias_id=$1',[refreshAlias])).rows[0].n,0);
  assert.equal((await pool.query("SELECT f.value FROM canonical_content_fact_heads h JOIN canonical_content_facts f USING(entity_id,alias_id,source_key,field,observed_at) WHERE h.alias_id=$1 AND h.field='media.episodes' AND h.source_key='anilist:media'",[refreshAlias])).rows[0].value,12,'downstream failure preserves previous metadata');
  const refreshWinners=await Promise.allSettled([1,2].map(()=>database.withTransaction(client=>refreshModule.commitMediaRefresh(client,refreshJob,refreshSnapshot,21000))));
  assert.equal(refreshWinners.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(refreshWinners.filter(row=>row.status==='rejected').length,1);
  assert.equal((await pool.query('SELECT revision,due_at FROM canonical_media_refresh_jobs WHERE alias_id=$1',[refreshAlias])).rows[0].due_at,'24000');
  assert.equal((await pool.query("SELECT f.value FROM canonical_content_fact_heads h JOIN canonical_content_facts f USING(entity_id,alias_id,source_key,field,observed_at) WHERE h.alias_id=$1 AND h.field='media.episodes' AND h.source_key='anilist:media'",[refreshAlias])).rows[0].value,13);
  assert.equal((await database.withTransaction(client=>contentInfo.getContentEntityInfo(client,preparedMedia.seasonId))).texts.find(row=>row.locale==='en' && row.sourceKey==='anilist:media').value,'Updated title');
  const firstRefreshHash=(await pool.query('SELECT topology_hash FROM canonical_media_refresh_receipts WHERE alias_id=$1',[refreshAlias])).rows[0].topology_hash;
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at)
      SELECT entity_id,alias_id,source_key,field,value_type,value,22000 FROM canonical_content_facts
      WHERE alias_id=$1 AND source_key='anilist:media' AND observed_at=21000 AND field<>'media.genres'`,[refreshAlias]);
    await client.query('INSERT INTO canonical_media_refresh_receipts(alias_id,revision,observed_at,topology_hash) VALUES($1,2,22000,$2)',[refreshAlias,firstRefreshHash]);
  }),/receipt lacks/,'new metadata cannot be silently omitted from the confirmation');
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at)
      SELECT entity_id,alias_id,source_key,field,CASE WHEN field IN ('media.startDate.year','media.startDate.month','media.startDate.day') THEN 'number' ELSE value_type END,CASE field WHEN 'media.startDate.year' THEN '2025'::jsonb
        WHEN 'media.startDate.month' THEN '2'::jsonb WHEN 'media.startDate.day' THEN '29'::jsonb ELSE value END,22000
      FROM canonical_content_facts WHERE alias_id=$1 AND source_key='anilist:media' AND observed_at=21000`,[refreshAlias]);
    await client.query('INSERT INTO canonical_media_refresh_receipts(alias_id,revision,observed_at,topology_hash) VALUES($1,2,22000,$2)',[refreshAlias,firstRefreshHash]);
  }),/invalid partial date/,'raw SQL individual components cannot confirm a nonexistent calendar date');
  assert.equal((await pool.query("SELECT canonical_partial_date_is_valid('null','2','29') AS valid")).rows[0].valid,true);
  assert.equal((await pool.query("SELECT canonical_partial_date_is_valid('2024','2','29') AS valid")).rows[0].valid,true);
  await assert.rejects(()=>database.withTransaction(client=>client.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at)
    VALUES($1,$2,'anilist:media','media.startDate.month','number','2',22000)`,[preparedMedia.seasonId,refreshAlias])),/Incomplete source partial date/,'raw SQL cannot confirm only one component of a date');
  await assert.rejects(()=>database.withTransaction(async client=>{
    for(const [component,value] of [['year',2025],['month',2],['day',29]])await client.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at)
      VALUES($1,$2,'anilist:media',$3,'number',$4::jsonb,22000)`,[preparedMedia.seasonId,refreshAlias,`media.startDate.${component}`,JSON.stringify(value)]);
  }),/Invalid source partial date/,'calendar validity is enforced even without a refresh receipt');
  await assert.rejects(()=>pool.query('UPDATE canonical_media_refresh_jobs SET revision=revision+1,due_at=due_at+3000,observed_at=22000 WHERE alias_id=$1',[refreshAlias]),/refresh advance/);
  await assert.rejects(()=>pool.query('UPDATE canonical_media_refresh_jobs SET interval_ms=6000 WHERE alias_id=$1',[refreshAlias]),/refresh advance/);
  await assert.rejects(()=>pool.query('INSERT INTO canonical_media_refresh_receipts(alias_id,revision,observed_at,topology_hash) VALUES($1,2,22000,$2)',[refreshAlias,'a'.repeat(64)]),/receipt lacks/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,value_type,value,observed_at)
      SELECT entity_id,alias_id,source_key,field,value_type,CASE WHEN field='source.topology.sha256' THEN to_jsonb($2::text) ELSE value END,22000
      FROM canonical_content_facts WHERE alias_id=$1 AND source_key='anilist:media' AND observed_at=21000`,[refreshAlias,'a'.repeat(64)]);
    await client.query('INSERT INTO canonical_media_refresh_receipts(alias_id,revision,observed_at,topology_hash) VALUES($1,2,22000,$2)',[refreshAlias,'a'.repeat(64)]);
  }),/receipt lacks/,'receipt hash must match the actual stored source snapshot bytes');
  await assert.rejects(()=>pool.query('UPDATE canonical_media_refresh_receipts SET observed_at=22000 WHERE alias_id=$1',[refreshAlias]),/immutable/);
  await assert.rejects(()=>database.withTransaction(client=>client.query('TRUNCATE canonical_media_refresh_receipts')),/immutable/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    const hash=(await client.query('SELECT topology_hash FROM canonical_media_refresh_receipts WHERE alias_id=$1',[refreshAlias])).rows[0].topology_hash;
    await client.query('INSERT INTO canonical_media_refresh_receipts(alias_id,revision,observed_at,topology_hash) VALUES($1,2,21000,$2)',[refreshAlias,hash]);
  }),/receipt was not committed/,'SQL cannot commit a receipt without advancing the job');
  const refreshSecond={...refreshJob,revision:1,dueAt:24000};
  await database.withTransaction(client=>refreshModule.deferMediaRefresh(client,refreshSecond,26000,'refresh_failed'));
  assert.ok(await database.withTransaction(client=>refreshModule.readDueMediaRefresh(client,25000)),'ordinary failure leaves other identities available');
  await database.withTransaction(client=>refreshModule.deferMediaRefresh(client,refreshSecond,30000,'source_rate_limited'));
  assert.equal(await database.withTransaction(client=>refreshModule.readDueMediaRefresh(client,29999)),null);
  assert.equal(await database.withTransaction(client=>scheduleModule.readDueCollectionSchedule(client,29999)),null,'metadata429 also defers airing source');
  await assert.rejects(()=>pool.query('UPDATE canonical_media_refresh_retries SET failures=failures+1,rate_limit_until=0 WHERE alias_id=$1',[refreshAlias]),/refresh retry/);
  await assert.rejects(()=>database.withTransaction(client=>refreshModule.deferMediaRefresh(client,refreshJob,31000,'refresh_failed')),/Stale media refresh/);
  await database.withTransaction(client=>refreshModule.commitMediaRefresh(client,refreshSecond,{...refreshSnapshot,averageScore:null,title:{...refreshSnapshot.title,english:null}},30000));
  assert.equal((await pool.query("SELECT f.value_type,f.value FROM canonical_content_fact_heads h JOIN canonical_content_facts f USING(entity_id,alias_id,source_key,field,observed_at) WHERE h.alias_id=$1 AND h.field='media.averageScore' AND h.source_key='anilist:media'",[refreshAlias])).rows[0].value,null);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM canonical_media_refresh_receipts WHERE alias_id=$1',[refreshAlias])).rows[0].n,2);
  const refreshBeforeReapply=(await pool.query('SELECT * FROM canonical_media_refresh_jobs ORDER BY alias_id')).rows;
  await load('postgres').ensurePostgresSchema();
  assert.deepEqual((await pool.query('SELECT * FROM canonical_media_refresh_jobs ORDER BY alias_id')).rows,refreshBeforeReapply);
  console.log('Periodic native metadata refresh PostgreSQL: discovered identities, durable restart, own typed correction/null, receipt+facts+job atomic rollback, concurrent winner, forged advance/receipt guards, provider cooldown shared with airing and schema replay passed.');
  await database.withTransaction(async client=>{
    const make=async(kind,value,ownerId)=>{
      const alias={namespace:'own-page-fixture',value,sourceKey:'fixture:own-page'};
      const entity=await index.ensureEntity(alias,{kind,...(ownerId?{ownerId}:{})},client);
      await contentInfo.setContentEntityTexts(client,entity.id,[{field:'title',locale:'und',form:'default',sourceKey:'anirium:editorial',value:`OwnPage ${value}`}]);
      return {...entity,alias};
    };
    const universe=await make('UNIVERSE','universe'),a=await make('WORK','Alpha_100% \\Term'),b=await make('WORK','Beta'),empty=await make('WORK','Gamma');
    const season=await make('SEASON','season'),episode=await make('EPISODE','episode');
    await index.linkContentEntities(client,universe.id,a.id,0,'fixture');await index.linkContentEntities(client,universe.id,b.id,1,'fixture');await index.linkContentEntities(client,universe.id,empty.id,2,'fixture');
    await index.linkContentEntities(client,a.id,season.id,0,'fixture');await index.linkContentEntities(client,season.id,episode.id,1,'fixture');
    const arc=await arcs.registerArc(client,universe.id,{namespace:'own-page-fixture',value:'arc',sourceKey:'fixture:own-page'});
    await contentInfo.setContentEntityTexts(client,arc.id,[{field:'title',locale:'und',form:'default',sourceKey:'anirium:editorial',value:'OwnPage arc'}]);
    await arcs.linkArcEpisode(client,arc.id,episode.id,0,'fixture');
    const privateWork=await index.ensureEntity({namespace:'own-page-private',value:'private',sourceKey:'fixture'},{kind:'WORK',ownerId:'owner'},client);
    await client.query("INSERT INTO canonical_text_variants(entity_id,field,locale,form,source_key,value) VALUES($1,'title','und','default','fixture','OwnPage secret')",[privateWork.id]);
    const plugin=await index.ensureEntity({namespace:'own-page-fixture',value:'plugin',sourceKey:'fixture'},{kind:'PLUGIN'},client);
    await client.query("INSERT INTO canonical_text_variants(entity_id,field,locale,form,source_key,value) VALUES($1,'title','und','default','fixture','OwnPage plugin')",[plugin.id]);
    const put=(entity,sourceKey,facts,observedAt=1000)=>contentFacts.recordContentFacts(client,entity.id,{namespace:entity.alias.namespace,externalId:entity.alias.value,sourceKey,observedAt},facts);
    await put(a,'fixture:own-a',[{field:'media.genres',type:'string-list',value:['Drama','日本語']},{field:'media.durationMinutes',type:'number',value:0},
      {field:'media.isAdult',type:'boolean',value:false},{field:'media.synonyms',type:'string-list',value:['AlternativeOwnName']},
      {field:'unknown',type:'null',value:null},{field:'firstSeen',type:'instant',value:0}]);
    await put(b,'fixture:own-a',[{field:'media.genres',type:'string-list',value:['Action']},{field:'media.durationMinutes',type:'number',value:24},{field:'media.isAdult',type:'boolean',value:true}]);
    const alternate={namespace:'own-page-alternate',value:'alpha',sourceKey:'fixture'};
    await index.bindEntityAlias(a.id,alternate,client);
    await contentFacts.recordContentFacts(client,a.id,{namespace:alternate.namespace,externalId:alternate.value,sourceKey:'fixture:own-a',observedAt:1000},[
      {field:'media.genres',type:'string-list',value:['Action']},{field:'media.durationMinutes',type:'number',value:99},{field:'media.isAdult',type:'boolean',value:true}]);
    await put(a,'fixture:own-b',[{field:'media.genres',type:'string-list',value:['Action']},{field:'media.durationMinutes',type:'number',value:0}]);
    const page=input=>ownContent.readOwnContentPage(client,{query:'OwnPage',...input});
    const workPage=await page({kind:'WORK'});
    assert.deepEqual(workPage.items.map(row=>row.id).sort(),[a.id,b.id,empty.id].sort());
    assert.deepEqual(plain(workPage.items.find(row=>row.id===empty.id).facts),[],'missing metadata remains empty without invented title/source values');
    assert.equal(workPage.items.find(row=>row.id===a.id).facts.find(row=>row.field==='media.isAdult' && row.sourceKey==='fixture:own-a' && row.externalId===a.alias.value).value,false);
    const filters=[{sourceKey:'fixture:own-a',field:'media.genres',type:'string-list',op:'contains',value:'Drama'},
      {sourceKey:'fixture:own-a',field:'media.durationMinutes',type:'number',op:'eq',value:0},{sourceKey:'fixture:own-a',field:'media.isAdult',type:'boolean',op:'eq',value:false}];
    assert.deepEqual((await page({filters})).items.map(row=>row.id),[a.id]);
    assert.equal((await page({filters:[{...filters[0],value:'Action'},filters[1]]})).items.length,0,'cannot combine genre from alternate alias with duration from original alias');
    assert.deepEqual((await page({filters:[{...filters[0],value:'Action'},{...filters[1],sourceKey:'fixture:own-b'}]})).items.map(row=>row.id).sort(),[a.id].sort(),'explicit separate source groups remain independent');
    assert.deepEqual((await page({filters:[{sourceKey:'fixture:own-a',field:'unknown',type:'null',op:'eq',value:null}]})).items.map(row=>row.id),[a.id]);
    assert.deepEqual((await page({filters:[{sourceKey:'fixture:own-a',field:'firstSeen',type:'instant',op:'eq',value:0}]})).items.map(row=>row.id),[a.id]);
    assert.deepEqual((await page({filters:[{sourceKey:'fixture:own-a',field:'media.durationMinutes',type:'number',op:'gte',value:20},
      {sourceKey:'fixture:own-a',field:'media.durationMinutes',type:'number',op:'lte',value:30}]})).items.map(row=>row.id),[b.id]);
    for(const query of ['Alpha_100%','\\Term','AlternativeOwnName','日本語'])assert.deepEqual((await ownContent.readOwnContentPage(client,{query,parentId:universe.id})).items.map(row=>row.id),[a.id]);
    assert.equal((await page({query:'AlphaX100Y'})).items.length,0,'SQL wildcard lookalikes are not literal matches');
    assert.equal((await page({query:"' OR TRUE --"})).items.length,0,'query text is always a bound literal');
    const all=await page({});assert.equal(all.items.length,7);assert.equal(new Set(all.items.map(row=>row.id)).size,7,'aliases and facts do not multiply entities');
    assert.ok(!all.items.some(row=>row.id===privateWork.id || row.id===plugin.id));
    const visited=[];let after;
    do {const result=await page({limit:1,...(after?{after}:{})});visited.push(...result.items.map(row=>row.id));after=result.nextCursor;}while(after);
    assert.deepEqual(visited,all.items.map(row=>row.id),'stable identity pages cover each entity once');
    assert.deepEqual((await page({kind:'SEASON',parentId:a.id})).items.map(row=>row.id),[season.id]);
    assert.deepEqual((await page({kind:'ARC',parentId:universe.id})).items.map(row=>row.id),[arc.id]);
    assert.deepEqual((await page({kind:'EPISODE',parentId:arc.id})).items.map(row=>row.id),[episode.id]);
    assert.equal((await page({parentId:privateWork.id})).items.length,0);
    await put(a,'fixture:own-a',[{field:'media.genres',type:'string-list',value:['Comedy']}],2000);
    assert.equal((await page({filters})).items.length,0,'latest correction excludes the previous genre');
    assert.deepEqual((await page({filters:[{...filters[0],value:'Comedy'},filters[1]]})).items.map(row=>row.id),[a.id]);
    await client.query("UPDATE canonical_aliases SET state='retired' WHERE namespace=$1 AND value=$2",[a.alias.namespace,a.alias.value]);
    assert.equal((await page({filters:[{...filters[0],value:'Comedy'},filters[1]]})).items.length,0,'retired source identity cannot match filters');
    assert.equal((await page({query:'AlternativeOwnName'})).items.length,0,'retired source synonym cannot match search');
    const retiredItem=(await page({kind:'WORK'})).items.find(row=>row.id===a.id);
    assert.ok(!retiredItem.facts.some(row=>row.externalId===a.alias.value && row.namespace===a.alias.namespace),'returned facts exclude retired aliases');
    for(const bad of [{limit:null},{filters:null},{kind:'PLUGIN'},{after:'invalid'},{parentId:'invalid'},{limit:101},{query:'x'.repeat(257)},
      {filters:[{...filters[1],value:'0'}]},{filters:[{...filters[0],op:'eq'}]},{filters:[{...filters[1],field:"x' OR true--"}]}])
      await assert.rejects(()=>ownContent.readOwnContentPage(client,bad),/Invalid own content/);
  });
  console.log('Own indexed content PostgreSQL: one entity per identity, typed source/alias-coherent filters, literal/Unicode text and synonyms, current corrections, retired/private/non-content exclusion, empty metadata, context parents/arcs and stable keyset pages passed. No source transport or site dependency.');
  await database.withTransaction(async client=>{
    const sourceKey='fixture:account-context',activity=load('privateActivity'),cryptoData=load('privateData');
    await client.query('SAVEPOINT own_account_context_fixture');
    const make=kind=>index.ensureEntity({namespace:sourceKey,value:kind,sourceKey},{kind},client);
    const universe=await make('UNIVERSE'),work=await make('WORK'),season=await make('SEASON'),episode=await make('EPISODE');
    await index.linkContentEntities(client,universe.id,work.id,0,sourceKey);await index.linkContentEntities(client,work.id,season.id,1,sourceKey);await index.linkContentEntities(client,season.id,episode.id,1,sourceKey);
    const arc=await arcs.registerArc(client,universe.id,{namespace:sourceKey,value:'ARC',sourceKey});
    const entities=[universe,work,season,episode,arc];
    for(const entity of entities) {
      await contentInfo.setContentEntityTexts(client,entity.id,[{field:'title',locale:'und',form:'full',sourceKey,value:`AccountContext ${entity.kind}`}]);
      const type=entity.kind==='WORK'?'SERIES':entity.kind;
      await activity.writeActivity('owner',type,entity.id,{status:'completed',completed:true},{user_score:0,user_opinion:`Owner ${entity.kind}`,watched_seconds:0,total_seconds:100},client);
      await activity.writeActivity('other',type,entity.id,{status:'plan_to_watch',completed:false},{user_score:7,user_opinion:`Other ${entity.kind}`},client);
    }
    await contentFacts.recordContentFacts(client,season.id,{namespace:sourceKey,externalId:'SEASON',sourceKey,observedAt:100},[{field:'media.genres',type:'string-list',value:['Drama']},{field:'media.isAdult',type:'boolean',value:false}]);
    const input={query:'AccountContext'},read=(owner,options={})=>ownContent.readOwnAccountContentPage(client,owner,{...input,...options});
    const ownerPage=await read('owner'),otherPage=await read('other');
    assert.equal(ownerPage.items.length,5);assert.equal(otherPage.items.length,5);
    assert.deepEqual(ownerPage.items.map(row=>row.id).sort(),entities.map(row=>row.id).sort());
    assert.ok(ownerPage.items.every(row=>row.accountActivity.userScore===0 && row.accountActivity.completed===true && row.accountActivity.favorite===false && row.accountActivity.watchedSeconds===0));
    assert.ok(otherPage.items.every(row=>row.accountActivity.userScore===7 && row.accountActivity.completed===false && row.accountActivity.opinion.startsWith('Other')));
    assert.ok(!JSON.stringify(ownerPage).includes('Other '));assert.ok(!JSON.stringify(ownerPage).includes('activity_private'));
    assert.ok(!ownerPage.items.some(row=>'entity_id' in row || 'parent_series_id' in row || '_accountActivity' in row));
    assert.equal((await read('owner',{status:'plan_to_watch'})).items.length,0);assert.equal((await read('other',{status:'plan_to_watch',completed:false,favorite:false})).items.length,5);
    const filtered=await read('owner',{filters:[{sourceKey,field:'media.genres',type:'string-list',op:'contains',value:'Drama'}]});
    assert.deepEqual(filtered.items.map(row=>row.id),[season.id]);
    assert.deepEqual((await read('owner',{parentId:universe.id})).items.map(row=>row.id).sort(),[work.id,arc.id].sort());
    const visited=[];let after;
    do {const page=await read('owner',{limit:1,after});visited.push(...page.items);after=page.nextCursor??undefined;}while(after);
    assert.deepEqual(visited,ownerPage.items);
    assert.equal((await read('missing-account')).items.length,0);
    const row=(await client.query("SELECT * FROM user_entity_status WHERE user_id='owner' AND canonical_entity_id=$1",[universe.id])).rows[0];
    const oldContext={user_id:'owner',entity_type:'UNIVERSE',entity_id:'account-context-old'};
    const oldEnvelope=cryptoData.encryptPrivateJson(activity.readActivity(row),activity.activityContext(oldContext));
    await client.query("INSERT INTO user_entity_status(user_id,entity_type,entity_id,canonical_entity_id,status,completed,is_favorite,activity_private,updated_at) VALUES('owner','UNIVERSE','account-context-old',$1,'watching',false,true,$2,TIMESTAMPTZ 'epoch')",[universe.id,JSON.stringify(oldEnvelope)]);
    assert.equal((await read('owner',{favorite:true})).items.length,0,'older favorite cannot resurrect a removed latest favorite');
    assert.equal((await read('owner',{status:'watching'})).items.length,0,'older status cannot pass filter before latest row selection');
    await contentInfo.setContentEntityTexts(client,universe.id,[{field:'title',locale:'und',form:'full',sourceKey,value:'AccountContext changed own title'}]);
    for(const owner of ['owner','other'])assert.equal((await read(owner,{kind:'UNIVERSE'})).items[0].texts[0].value,'AccountContext changed own title');
    const foreignEnvelope=(await client.query("SELECT activity_private FROM user_entity_status WHERE user_id='other' AND canonical_entity_id=$1",[universe.id])).rows[0].activity_private;
    await client.query('UPDATE user_entity_status SET activity_private=$2 WHERE id=$1',[row.id,JSON.stringify(foreignEnvelope)]);
    await assert.rejects(()=>read('owner',{kind:'UNIVERSE'}));
    await client.query('UPDATE user_entity_status SET activity_private=$2 WHERE id=$1',[row.id,JSON.stringify(row.activity_private)]);
    for(const bad of [{favorite:'false'},{completed:0},{status:'invented'}])await assert.rejects(()=>read('owner',bad),/Invalid own account content/);
    await assert.rejects(()=>read(''),/Invalid own account content/);
    await client.query("INSERT INTO canonical_entities(kind) SELECT 'WORK' FROM generate_series(1,20000)");
    await client.query('ANALYZE canonical_entities');await client.query('ANALYZE user_entity_status');
    let statement;
    const observedClient={query:async(sql,args)=>{statement={sql,args};return client.query(sql,args);}};
    const scaled=await ownContent.readOwnAccountContentPage(observedClient,'owner',{});
    assert.equal(scaled.items.length,5,'unrelated entities do not change account context');
    const explained=(await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${statement.sql}`,statement.args)).rows[0]['QUERY PLAN'][0];
    const nodes=[];const collect=node=>{nodes.push(node);for(const child of node.Plans??[])collect(child);};collect(explained.Plan);
    const entityReads=nodes.filter(node=>node['Relation Name']==='canonical_entities');
    assert.ok(entityReads.length>0);
    assert.ok(entityReads.every(node=>node['Node Type'].includes('Index')),'account context resolves linked entity IDs through indexes rather than scanning unrelated catalog');
    assert.ok(entityReads.reduce((n,node)=>n+(node['Actual Rows']??0)*(node['Actual Loops']??0),0)<=5,'canonical entity reads scale with five account links in this measured fixture');
    assert.ok(Number.isFinite(explained['Execution Time']));
    console.log(`Own account context EXPLAIN: 20000 unrelated works, five account entities, indexed identity lookup; execution ${explained['Execution Time']}ms (isolated fixture, not full-scale production proof).`);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('ROLLBACK TO SAVEPOINT own_account_context_fixture');
    await client.query('ANALYZE canonical_entities');await client.query('ANALYZE user_entity_status');
  });
  console.log('Own account content PostgreSQL: same indexed query across five levels, two encrypted owners, zero/null/typed states, source/text/parent filters, stable pages, latest-before-state filtering, own title update, missing owner and wrong-owner AAD failure passed. No numeric catalog or external dependency.');
  const ownAgenda=load('canonicalAiringReader');
  const agendaEpisodes=await database.withTransaction(async client=>{
    const entries=[];
    for(let ordinal=30;ordinal<36;ordinal++) {
      const episodeId=await load('catalogReleaseIdentity').ensureReleaseEpisode(client,arcFixture.season.id,ordinal);
      const source={namespace:'fixture:agenda',externalId:String(ordinal),sourceKey:'fixture:agenda',observedAt:100};
      await index.bindEntityAlias(episodeId,{namespace:source.namespace,value:source.externalId,sourceKey:source.sourceKey},client);
      await contentFacts.recordEpisodeAiring(client,episodeId,source,ordinal===34?0:2000,false);
      entries.push({episodeId,source});
    }
    await contentFacts.recordEpisodeAiring(client,entries[0].episodeId,{...entries[0].source,observedAt:200},5000,false);
    await contentFacts.recordEpisodeAiring(client,entries[1].episodeId,{...entries[1].source,observedAt:200},2000,true);
    await contentFacts.recordEpisodeAiring(client,entries[5].episodeId,{...entries[5].source,observedAt:200},null,false);
    const orphan=await index.ensureEntity({namespace:'fixture:agenda',value:'orphan',sourceKey:'fixture:agenda'},{kind:'EPISODE'},client);
    await contentFacts.recordEpisodeAiring(client,orphan.id,{namespace:'fixture:agenda',externalId:'orphan',sourceKey:'fixture:agenda',observedAt:100},2000,false);
    return entries;
  });
  const agendaRange={start:0,end:3000,sourceKey:'fixture:agenda'};
  const ascendingAgenda=await database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,agendaRange));
  assert.equal(ascendingAgenda.items.length,3,'old, cancelled, unknown and orphan events excluded');
  assert.equal(ascendingAgenda.items[0].scheduledAt,0,'epoch zero retained');
  assert.ok(ascendingAgenda.items.every(item=>item.seasonId===arcFixture.season.id && item.workId===arcFixture.work.id && item.universeId===arcFixture.otherUniverse.id));
  assert.ok(!ascendingAgenda.items.some(item=>item.episodeId===agendaEpisodes[0].episodeId),'filter occurs after latest observation selection');
  const pagedAgenda=[];
  let agendaCursor;
  do {
    const page=await database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,{...agendaRange,limit:1,after:agendaCursor}));
    pagedAgenda.push(...page.items);
    agendaCursor=page.nextCursor??undefined;
  } while(agendaCursor);
  assert.deepEqual(pagedAgenda,ascendingAgenda.items,'equal-instant keyset traverses all events once');
  const descendingAgenda=await database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,{...agendaRange,direction:'desc'}));
  assert.deepEqual(descendingAgenda.items.map(item=>item.episodeId),ascendingAgenda.items.map(item=>item.episodeId).reverse());
  const descendingPaged=[];
  agendaCursor=undefined;
  do {
    const page=await database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,{...agendaRange,direction:'desc',limit:1,after:agendaCursor}));
    descendingPaged.push(...page.items);
    agendaCursor=page.nextCursor??undefined;
  } while(agendaCursor);
  assert.deepEqual(descendingPaged,descendingAgenda.items);
  assert.equal((await database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,{...agendaRange,start:3000,end:6000}))).items[0].episodeId,agendaEpisodes[0].episodeId);
  assert.equal((await database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,{...agendaRange,sourceKey:'fixture:other-source'}))).items.length,0);
  for(const bad of [{...agendaRange,limit:'1'},{...agendaRange,end:0},{...agendaRange,after:{at:0,episodeId:'bad',aliasId:'bad'}}])
    await assert.rejects(()=>database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,bad)),/Invalid canonical airing page/);
  await database.withTransaction(client=>contentFacts.recordContentFacts(client,agendaEpisodes[2].episodeId,{...agendaEpisodes[2].source,observedAt:300},[{field:'airing.scheduledAt',type:'instant',value:2500}]));
  const unknownCancellation=(await database.withTransaction(client=>ownAgenda.readCanonicalAiringPage(client,agendaRange))).items.find(item=>item.episodeId===agendaEpisodes[2].episodeId);
  assert.equal(unknownCancellation.cancelled,null,'older cancellation flag does not certify a changed event');
  assert.equal(unknownCancellation.scheduledAt,2500);
  console.log('Own agenda PostgreSQL: latest-before-range, corrected/cancelled/null/orphan exclusion, epoch0, current hierarchy and equal-instant asc/desc keyset passed.');
  const ownWeek=load('canonicalAiringWeek');
  await database.withTransaction(async client=>{
    const now=Date.parse('2026-10-09T02:30:00Z'),start=Date.parse('2026-10-05T03:00:00Z'),end=Date.parse('2026-10-12T03:00:00Z');
    const times=[start-1,start,now,now+1,end-1,end],ids=[];
    for(let i=0;i<times.length;i++) {
      const id=await load('catalogReleaseIdentity').ensureReleaseEpisode(client,arcFixture.season.id,60+i);
      const source={namespace:'fixture:week',externalId:String(i),sourceKey:'fixture:week',observedAt:100};
      await index.bindEntityAlias(id,{namespace:source.namespace,value:source.externalId,sourceKey:source.sourceKey},client);
      await contentFacts.recordEpisodeAiring(client,id,source,times[i],false);ids.push(id);
    }
    const input={now,timeZone:'America/Sao_Paulo',sourceKey:'fixture:week'};
    const week=await ownWeek.readCanonicalAiringWeek(client,input);
    assert.equal(week.weekStart,start);assert.equal(week.weekEnd,end);assert.equal(week.localToday,'2026-10-08');
    assert.deepEqual(week.items.map(item=>item.episodeId),ids.slice(1,5));
    assert.deepEqual(week.items.map(item=>item.scheduleState),['aired','aired','upcoming','upcoming']);
    assert.deepEqual(week.items.map(item=>item.localDate),['2026-10-05','2026-10-08','2026-10-08','2026-10-11']);
    const paged=[];let after;
    do {const page=await ownWeek.readCanonicalAiringWeek(client,{...input,limit:1,after});paged.push(...page.items);after=page.nextCursor??undefined;}while(after);
    assert.deepEqual(paged,week.items);
    for(const [instant,hours] of [['2026-03-08T12:00:00Z',167],['2026-11-01T12:00:00Z',169]]) {
      const dst=await ownWeek.readCanonicalAiringWeek(client,{...input,now:Date.parse(instant),timeZone:'America/New_York'});
      assert.equal((dst.weekEnd-dst.weekStart)/3600000,hours,'week uses local calendar boundaries, not fixed 168 hours');
    }
    const epoch=await ownWeek.readCanonicalAiringWeek(client,{...input,now:0,timeZone:'UTC'});
    assert.equal(epoch.localToday,'1970-01-01');assert.equal(epoch.items.length,0);
    for(const bad of [{...input,timeZone:'Invented/Zone'},{...input,timeZone:"UTC' OR TRUE --"},{...input,now:'1'},{...input,now:NaN},{...input,now:-1},
      {...input,limit:null},{...input,after:null},{...input,sourceKey:''}])
      await assert.rejects(()=>ownWeek.readCanonicalAiringWeek(client,bad),/Invalid canonical airing/);
  });
  console.log('Own weekly agenda PostgreSQL: explicit clock, local midnight, inclusive now, Monday/Sunday exclusive boundary, UTC epoch, stable pages and 167/169 hour DST weeks passed. Schedule state does not assert streaming availability.');
  const latestWorks=load('latestWorkAirings');
  await database.withTransaction(async client=>{
    const sourceKey='fixture:latest',records=[];
    const universe=await index.ensureEntity({namespace:sourceKey,value:'universe',sourceKey},{kind:'UNIVERSE'},client);
    for(let i=0;i<5;i++) {
      const work=await index.ensureEntity({namespace:sourceKey,value:`work${i}`,sourceKey},{kind:'WORK'},client);
      const season=await index.ensureEntity({namespace:sourceKey,value:`season${i}`,sourceKey},{kind:'SEASON'},client);
      await index.linkContentEntities(client,universe.id,work.id,i,sourceKey);await index.linkContentEntities(client,work.id,season.id,1,sourceKey);
      const times=i===0?[995,996,997,998,999,1000]:[i===4?0:1000-i*100];
      for(let j=0;j<times.length;j++) {
        const episodeId=await load('catalogReleaseIdentity').ensureReleaseEpisode(client,season.id,j+1);
        const source={namespace:sourceKey,externalId:`${i}:${j}`,sourceKey,observedAt:100};
        await index.bindEntityAlias(episodeId,{namespace:source.namespace,value:source.externalId,sourceKey},client);
        await contentFacts.recordEpisodeAiring(client,episodeId,source,times[j],false);records.push({workId:work.id,episodeId,source,at:times[j],i,j});
      }
    }
    const input={now:1000,sourceKey},workIds=[0,1,2,3,4].map(i=>records.find(row=>row.i===i).workId);
    const initial=await latestWorks.readLatestWorkAirings(client,input);
    assert.deepEqual(initial.items.map(row=>row.workId),workIds.slice(0,3),'many recent episodes of one work do not hide other works');
    assert.equal(initial.items[0].scheduledAt,1000,'now included');
    assert.equal((await latestWorks.readLatestWorkAirings(client,{...input,limit:10})).items.at(-1).scheduledAt,0);
    const corrected=records.find(row=>row.i===3);
    await contentFacts.recordEpisodeAiring(client,corrected.episodeId,{...corrected.source,observedAt:200},1500,false);
    assert.deepEqual((await latestWorks.readLatestWorkAirings(client,{...input,limit:10})).items.map(row=>row.workId),[workIds[0],workIds[1],workIds[2],workIds[4]],'future correction does not resurrect older time');
    const newest=records.find(row=>row.at===1000);
    await contentFacts.recordEpisodeAiring(client,newest.episodeId,{...newest.source,observedAt:200},1000,true);
    assert.equal((await latestWorks.readLatestWorkAirings(client,input)).items[0].scheduledAt,999,'cancelled newest selects previous episode of same work');
    const b=records.find(row=>row.i===1),alternate={namespace:'fixture:latest-alternate',externalId:'b',sourceKey,observedAt:100};
    await index.bindEntityAlias(b.episodeId,{namespace:alternate.namespace,value:alternate.externalId,sourceKey},client);
    await contentFacts.recordEpisodeAiring(client,b.episodeId,alternate,950,false);
    assert.deepEqual((await latestWorks.readLatestWorkAirings(client,input)).conflictingEpisodeIds,[b.episodeId],'excluded ambiguity is explicit in read result');
    assert.deepEqual((await latestWorks.readLatestWorkAirings(client,input)).items.map(row=>row.workId),[workIds[0],workIds[2],workIds[4]],'same-observation conflicting aliases do not invent a latest time');
    await contentFacts.recordEpisodeAiring(client,b.episodeId,{...alternate,observedAt:300},900,false);
    assert.deepEqual((await latestWorks.readLatestWorkAirings(client,input)).conflictingEpisodeIds,[]);
    assert.deepEqual((await latestWorks.readLatestWorkAirings(client,input)).items.map(row=>row.workId),workIds.slice(0,3),'newer source assertion resolves conflict');
    await contentFacts.recordEpisodeAiring(client,b.episodeId,{...alternate,observedAt:400},null,false);
    assert.ok(!(await latestWorks.readLatestWorkAirings(client,{...input,limit:10})).items.some(row=>row.workId===b.workId),'newer unknown time excludes old alias');
    assert.equal((await latestWorks.readLatestWorkAirings(client,{...input,sourceKey:'fixture:no-latest'})).items.length,0);
    const conflictSeason=(await client.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[records[0].episodeId])).rows[0].parent_id;
    for(let i=0;i<101;i++) {
      const episodeId=await load('catalogReleaseIdentity').ensureReleaseEpisode(client,conflictSeason,100+i);
      for(let alias=0;alias<2;alias++) {
        const source={namespace:'fixture:bounded-conflicts',externalId:`${i}:${alias}`,sourceKey:'fixture:bounded-conflicts',observedAt:100};
        await index.bindEntityAlias(episodeId,{namespace:source.namespace,value:source.externalId,sourceKey:source.sourceKey},client);
        await contentFacts.recordEpisodeAiring(client,episodeId,source,900+alias,false);
      }
    }
    const bounded=await latestWorks.readLatestWorkAirings(client,{now:1000,sourceKey:'fixture:bounded-conflicts'});
    assert.equal(bounded.items.length,0);assert.equal(bounded.conflictingEpisodeIds.length,100);assert.equal(bounded.conflictingEpisodeCount,101);assert.equal(bounded.conflictsHaveMore,true);
    for(const bad of [{...input,now:-1},{...input,now:'1000'},{...input,limit:null},{...input,limit:101},{...input,sourceKey:''}])
      await assert.rejects(()=>latestWorks.readLatestWorkAirings(client,bad),/Invalid latest work airings/);
  });
  console.log('Latest distinct works PostgreSQL: shared current schedule, top3 without episode crowding, now/epoch0, source isolation, cancellation, future/null correction, current alias conflict and resolution passed. No availability or world coverage claim.');
  const enabledMigration=load('addonEnabledMigration');
  await database.withTransaction(async client=>{
    await client.query('CREATE TEMP TABLE user_addons(user_id TEXT,addon_id TEXT,enabled INTEGER NOT NULL DEFAULT 1,config_json JSONB,installed_at BIGINT,canonical_plugin_id TEXT) ON COMMIT DROP');
    await client.query('SET LOCAL search_path TO pg_temp');
    await client.query(`INSERT INTO user_addons VALUES ('old-owner','disabled',0,'{"preserved":true}',123,'plugin-ref'),
      ('old-owner','enabled',1,'{"preserved":false}',456,'another-ref'),('old-owner','invalid',2,'{}',789,NULL)`);
    const before=(await client.query('SELECT * FROM user_addons ORDER BY addon_id')).rows;
    assert.equal((await enabledMigration.inspectAddonEnabledSchema(client)).invalid,1);
    await assert.rejects(()=>enabledMigration.migrateAddonEnabledSchema(client),/invalid_addon_enabled_values/);
    assert.equal((await enabledMigration.inspectAddonEnabledSchema(client)).type,'integer');
    assert.deepEqual((await client.query('SELECT * FROM user_addons ORDER BY addon_id')).rows,before);
    await client.query("DELETE FROM user_addons WHERE addon_id='invalid'");
    await client.query('SAVEPOINT conversion');
    assert.equal((await enabledMigration.migrateAddonEnabledSchema(client)).changed,true);
    await client.query('ROLLBACK TO SAVEPOINT conversion');
    assert.equal((await enabledMigration.inspectAddonEnabledSchema(client)).type,'integer','downstream rollback restores schema as well as rows');
    assert.equal((await enabledMigration.migrateAddonEnabledSchema(client)).changed,true);
    assert.equal((await enabledMigration.migrateAddonEnabledSchema(client)).changed,false);
    const after=(await client.query('SELECT * FROM user_addons ORDER BY addon_id')).rows;
    assert.deepEqual(after,before.filter(row=>row.addon_id!=='invalid').map(row=>({...row,enabled:row.enabled===1})),'conversion preserves account/config/refs/timestamps');
    await client.query("INSERT INTO user_addons(user_id,addon_id) VALUES('old-owner','default')");
    assert.equal((await client.query("SELECT enabled FROM user_addons WHERE addon_id='default'")).rows[0].enabled,true);
  });
  assert.equal((await database.withTransaction(client=>enabledMigration.inspectAddonEnabledSchema(client))).type,'boolean','fresh application schema is native boolean');
  console.log('Native addon enabled: legacy 0/1 conversion, invalid-value rejection, schema rollback, replay, default and metadata preservation passed.');
  for(const account of (await pool.query("SELECT * FROM users WHERE id IN ('owner','other')")).rows) await pool.query('UPDATE users SET profile_private=$2 WHERE id=$1',[account.id,JSON.stringify(load('privateProfile').encodeProfile(account.id,account.display_name,account.avatar_url??''))]);
  for(const id of ['owner','other']) await pool.query('UPDATE users SET settings_json=$2 WHERE id=$1',[id,JSON.stringify(load('privateData').encryptPrivateJson({},load('privateData').profileSettingsPrivateContext(id)))]);
  const seedHistoricalComment=historicalCommentFixture({database,identity:load('commentEntityIdentity'),coordinates:load('catalogIdentity')});
  const seedHistoricalActivity=historicalActivityFixture({database,activity:load('privateActivity'),privateData:load('privateData'),activityIndex:load('activityEntityIndex')});
  const themeIndex=load('themeIndex'),themeTokens=load('themeTokens');
  const themeRefs=await Promise.all(Array.from({length:4},()=>database.withTransaction(client=>themeIndex.ensureBlackTheme(client))));
  assert.equal(new Set(themeRefs.map(row=>row.releaseId)).size,1,'concurrent theme seed preserves release identity');
  const themeRelease=(await pool.query('SELECT * FROM canonical_theme_releases WHERE id=$1',[themeRefs[0].releaseId])).rows[0];
  assert.equal(themeRelease.descriptor_hash,crypto.createHash('sha256').update(JSON.stringify(themeTokens.blackTheme)).digest('hex'));
  assert.equal(typeof themeRelease.token_schema_version,'number');
  assert.equal((await pool.query("SELECT theme_release_id FROM users WHERE id='owner'")).rows[0].theme_release_id,themeRelease.id,'account has typed reference to packaged visual default');
  await assert.rejects(()=>pool.query("UPDATE users SET theme_release_id='missing-theme-release' WHERE id='owner'"),/foreign key/);
  const cssSource=fs.readFileSync('src/app/globals.css','utf8');
  for (const [property,value] of Object.entries(themeTokens.themeCssProperties('default'))) {
    assert.equal(new RegExp(`${property}:\\s*(#[0-9a-fA-F]+)`).exec(cssSource)?.[1],value,'packaged black palette preserves current CSS '+property);
  }
  assert.deepEqual(themeTokens.themeCssProperties('unknown-theme'),themeTokens.themeCssProperties('default'),'unknown selection uses complete black fallback');
  await assert.rejects(()=>pool.query("UPDATE canonical_theme_releases SET tokens='{}'::jsonb WHERE id=$1",[themeRelease.id]),/immutable/);
  await assert.rejects(()=>pool.query("INSERT INTO canonical_theme_releases(theme_id,version,token_schema_version,descriptor_hash,tokens) VALUES($1,'invalid',1,$2,$3::jsonb)",[themeRefs[0].themeId,'0'.repeat(64),JSON.stringify({color:123})]),/check constraint/);
  console.log('Canonical black theme: packaged hash and tokens indexed once under concurrency, immutable release, numeric schema revision, CSS palette parity and atomic unknown fallback passed.');
  const alias = (namespace,value) => ({namespace,value,sourceKey:'fixture:verified'});
  const createEntity = (kind,value,ownerId) => index.ensureEntity(alias(`fixture:${kind}`,value),{kind,...(ownerId ? {ownerId} : {})});
  const concurrent = await Promise.all(Array.from({length:6},()=>createEntity('WORK','same')));
  assert.equal(new Set(concurrent.map(entity=>entity.id)).size,1,'one alias under concurrent ingestion creates one identity');
  const work = concurrent[0], universe = await createEntity('UNIVERSE','root');
  assert.equal(typeof work.revision,'number','revisions remain numeric at the database boundary');
  const seasonA = await createEntity('SEASON','source-season-A'), seasonB = await createEntity('SEASON','source-season-B');
  const episode = await createEntity('EPISODE','source-episode-A');
  const otherWork = await createEntity('WORK','other');
  await database.withTransaction(async client=>{
    await index.linkContentEntities(client,universe.id,work.id,0,'fixture');
    await index.linkContentEntities(client,work.id,seasonA.id,0,'fixture');
    await index.linkContentEntities(client,work.id,seasonB.id,1,'fixture');
    await index.linkContentEntities(client,seasonA.id,episode.id,1,'fixture');
    await index.linkContentEntities(client,work.id,seasonA.id,1,'fixture');
    await index.linkContentEntities(client,work.id,seasonB.id,0,'fixture');
  });
  assert.deepEqual((await pool.query('SELECT child_id FROM canonical_memberships WHERE parent_id=$1 ORDER BY display_order',[work.id])).rows.map(row=>row.child_id),[seasonB.id,seasonA.id]);
  assert.equal((await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[episode.id])).rows[0].parent_id,seasonA.id,'reordering never changes episode identity/parent');
  await assert.rejects(()=>database.withTransaction(client=>index.linkContentEntities(client,otherWork.id,seasonA.id,0,'fixture')),'season cannot silently switch parent');
  await assert.rejects(()=>database.withTransaction(client=>index.linkContentEntities(client,episode.id,universe.id,0,'fixture')),'typed hierarchy rejects cycles');
  await assert.rejects(()=>database.withTransaction(client=>index.linkContentEntities(client,work.id,episode.id,0,'fixture')),'cannot skip hierarchy level');
  await assert.rejects(()=>index.bindEntityAlias(otherWork.id,alias('fixture:WORK','same')),'alias cannot be rebound');
  const separateNamespace = await createEntity('EPISODE','same');
  assert.notEqual(separateNamespace.id,work.id,'same source value in different namespaces remains distinct');
  await assert.rejects(()=>index.ensureEntity(alias('fixture:WORK','same'),{kind:'EPISODE'}),/identity conflict/);
  const privateWork = await createEntity('WORK','private-work','owner');
  await assert.rejects(()=>pool.query("INSERT INTO anime_catalog(mal_id,title,images_json,updated_at,canonical_entity_id) VALUES(990009,'Private binding fixture','{}',0,$1)",[privateWork.id]),/scope conflict/,'catalog FK must reject private WORK even when kind matches');
  const bindingPrivateSeason=await createEntity('SEASON','binding-private-season','other');
  const bindingPrivateUniverse=await createEntity('UNIVERSE','binding-private-universe','owner');
  const bindingPrivatePlugin=await createEntity('PLUGIN','binding-private-plugin','other');
  for(const [column,id] of [['composition_work_id',privateWork.id],['composition_season_id',bindingPrivateSeason.id],['composition_universe_id',bindingPrivateUniverse.id]]) {
    await assert.rejects(()=>pool.query(`INSERT INTO anime_catalog(mal_id,title,images_json,updated_at,${column}) VALUES(990009,'Private binding fixture','{}',0,$1)`,[id]),/scope conflict/);
  }
  for(const table of ['user_entity_status','entity_comments']) {
    const extra=table==='user_entity_status' ? "status" : "content";
    for(const [canonical,release] of [[privateWork.id,null],[work.id,bindingPrivateSeason.id]]) {
      await assert.rejects(()=>pool.query(`INSERT INTO ${table}(user_id,entity_type,entity_id,${extra},canonical_entity_id,release_entity_id)
        VALUES('owner','SERIES','scope-fixture','watching',$1,$2)`,[canonical,release]),/scope conflict/,'same-kind private target cannot enter public account content');
    }
  }
  await assert.rejects(()=>pool.query("INSERT INTO user_addons(user_id,addon_id,installed_at,canonical_plugin_id) VALUES('owner','scope-fixture',0,$1)",[bindingPrivatePlugin.id]),/scope conflict/);
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query("INSERT INTO anime_catalog(mal_id,title,images_json,updated_at,canonical_entity_id,composition_work_id,composition_season_id,composition_universe_id) VALUES(990009,'Public binding fixture','{}',0,$1,$1,$2,$3)",[work.id,seasonA.id,universe.id]);
    await assert.rejects(()=>client.query('UPDATE anime_catalog SET canonical_entity_id=$1 WHERE mal_id=990009',[privateWork.id]),/scope conflict/);
    throw new Error('scope fixture rollback');
  }),/scope fixture rollback/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM anime_catalog WHERE mal_id=990009')).rows[0].n,0);
  console.log('Public canonical bindings: raw SQL rejects private WORK/SEASON/UNIVERSE/PLUGIN on catalog/activity/comment/addon insert and catalog update, public references remain valid and failed transactions leave no row.');
  const bindingInventory=load('publicBindingInventory');
  const cleanBindings=await database.withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return bindingInventory.inspectPublicBindings(client);
  });
  assert.equal(cleanBindings.publicBindingsReady,true);
  await database.withTransaction(async client=>{
    // Historical fixture tables avoid disabling integrity on application tables.
    await client.query('CREATE TEMP TABLE anime_catalog(canonical_entity_id TEXT,composition_work_id TEXT,composition_season_id TEXT,composition_universe_id TEXT) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE user_entity_status(canonical_entity_id TEXT,release_entity_id TEXT) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE entity_comments(canonical_entity_id TEXT,release_entity_id TEXT) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE user_addons(canonical_plugin_id TEXT) ON COMMIT DROP');
    await client.query(`SET LOCAL search_path TO pg_temp,${schema}`);
    await client.query('INSERT INTO anime_catalog VALUES($1,$2,$3,$4)',[privateWork.id,work.id,seasonA.id,bindingPrivateUniverse.id]);
    await client.query('INSERT INTO user_entity_status VALUES($1,NULL),($1,$2)',[work.id,bindingPrivateSeason.id]);
    await client.query('INSERT INTO entity_comments VALUES($1,NULL)',[privateWork.id]);
    await client.query('INSERT INTO user_addons VALUES($1)',[bindingPrivatePlugin.id]);
    const before=(await client.query('SELECT * FROM anime_catalog')).rows;
    const report=plain(await bindingInventory.inspectPublicBindings(client));
    assert.deepEqual(report,{counts:{anime_catalog:1,user_entity_status:1,entity_comments:1,user_addons:1},publicBindingsReady:false});
    assert.deepEqual((await client.query('SELECT * FROM anime_catalog')).rows,before,'inventory never modifies historical bindings');
    assert.equal(JSON.stringify(report).includes(privateWork.id),false);
  });
  console.log('Public binding inventory: actual read-only clean snapshot and historical fixtures detect private targets on all four consumers with aggregate-only output and unchanged records.');
  const bindingPublicPlugin=await createEntity('PLUGIN','binding-public-plugin');
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query("INSERT INTO user_entity_status(user_id,entity_type,entity_id,status,canonical_entity_id) VALUES('owner','SERIES','scope-update','watching',$1)",[work.id]);
    await client.query("INSERT INTO entity_comments(user_id,entity_type,entity_id,content,canonical_entity_id) VALUES('owner','SERIES','scope-update','Public comment',$1)",[work.id]);
    await client.query("INSERT INTO user_addons(user_id,addon_id,installed_at,canonical_plugin_id) VALUES('owner','scope-update',0,$1)",[bindingPublicPlugin.id]);
    for(const [table,identity,updates] of [
      ['user_entity_status','entity_id',[['canonical_entity_id',privateWork.id],['release_entity_id',bindingPrivateSeason.id]]],
      ['entity_comments','entity_id',[['canonical_entity_id',privateWork.id],['release_entity_id',bindingPrivateSeason.id]]],
      ['user_addons','addon_id',[['canonical_plugin_id',bindingPrivatePlugin.id]]],
    ]) {
      const sql=`SELECT row_to_json(t) AS row FROM ${table} t WHERE user_id='owner' AND ${identity}='scope-update'`;
      const before=(await client.query(sql)).rows;
      for(const [field,id] of updates) {
        await client.query('SAVEPOINT private_reference');
        await assert.rejects(()=>client.query(`UPDATE ${table} SET ${field}=$1 WHERE user_id='owner' AND ${identity}='scope-update'`,[id]),/scope conflict/);
        await client.query('ROLLBACK TO SAVEPOINT private_reference');
        assert.deepEqual((await client.query(sql)).rows,before,'rejected update preserves complete private account record');
      }
    }
    throw new Error('scope update fixture rollback');
  }),/scope update fixture rollback/);
  console.log('Public binding updates: activity/comment canonical and release refs plus addon plugin reject private targets and preserve complete rows.');
  const privateSeason = await createEntity('SEASON','private-season','other');
  await assert.rejects(()=>database.withTransaction(client=>index.linkContentEntities(client,privateWork.id,privateSeason.id,0,'fixture')));
  await assert.rejects(()=>pool.query(`INSERT INTO canonical_memberships(parent_id,parent_kind,child_id,child_kind,source_key)
    VALUES($1,'WORK',$2,'SEASON','fixture')`,[privateWork.id,privateSeason.id]),'DB protects scope even when helper is bypassed');
  await assert.rejects(()=>pool.query("UPDATE canonical_entities SET owner_id='other' WHERE id=$1",[privateWork.id]));
  await assert.rejects(()=>pool.query('UPDATE canonical_aliases SET entity_id=$1 WHERE entity_id=$2',[otherWork.id,work.id]));
  await database.withTransaction(async client=>{
    assert.equal(await index.resolveEntityAlias(client,'fixture:WORK','private-work',null),null);
    assert.equal(await index.resolveEntityAlias(client,'fixture:WORK','private-work','other'),null);
    assert.equal((await index.resolveEntityAlias(client,'fixture:WORK','private-work','owner')).id,privateWork.id);
  });
  const beforeRollback=(await pool.query('SELECT count(*)::int AS count FROM canonical_entities')).rows[0].count;
  await assert.rejects(()=>database.withTransaction(async client=>{
    await index.ensureEntity(alias('fixture:WORK','rollback'),{kind:'WORK'},client);
    throw new Error('downstream failure');
  }));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM canonical_entities')).rows[0].count,beforeRollback);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM canonical_aliases WHERE value='rollback'")).rows[0].count,0);
  console.log('Canonical index: real PostgreSQL passed alias concurrency, typed hierarchy, stable reorder, single parent, namespace separation, private scope and rollback.');
  const assets=load('assetLocations');
  const assetInput={logicalKey:'stable-cover',sourceKey:'fixture',backend:'https',locator:'https://example.org/cover.jpg',entityId:work.id,slot:'cover'};
  const assetRefs=await Promise.all(Array.from({length:4},()=>database.withTransaction(client=>assets.registerAssetLocation(client,assetInput))));
  assert.equal(new Set(assetRefs.map(row=>row.assetId)).size,1);
  assert.ok(assetRefs.every(row=>row.revision===1 && row.verification==='unverified'));
  const movedAsset=await database.withTransaction(client=>assets.registerAssetLocation(client,{...assetInput,locator:'https://example.org/new-cover.jpg'}));
  assert.equal(movedAsset.assetId,assetRefs[0].assetId);assert.equal(movedAsset.revision,2);
  const privateAssetInput={logicalKey:'owned-drive-file',sourceKey:'fixture',backend:'drive',locator:'private_file_identity',ownerId:'owner',entityId:privateWork.id,slot:'document'};
  const privateAsset=await database.withTransaction(client=>assets.registerAssetLocation(client,privateAssetInput));
  const privateAssetRow=(await pool.query('SELECT * FROM canonical_asset_locations WHERE asset_id=$1',[privateAsset.assetId])).rows[0];
  assert.equal(privateAssetRow.locator,null);assert.ok(!JSON.stringify(privateAssetRow).includes('private_file_identity'));
  await database.withTransaction(client=>assets.registerAssetLocation(client,privateAssetInput));
  assert.deepEqual((await pool.query('SELECT * FROM canonical_asset_locations WHERE asset_id=$1',[privateAsset.assetId])).rows[0],privateAssetRow,'asset replay preserves private envelope');
  assert.equal((await database.withTransaction(client=>assets.readAssetLocations(client,privateAsset.assetId))).length,0);
  assert.equal((await database.withTransaction(client=>assets.readAssetLocations(client,privateAsset.assetId,'other'))).length,0);
  assert.equal((await database.withTransaction(client=>assets.readAssetLocations(client,privateAsset.assetId,'owner')))[0].locator,'private_file_identity');
  const batchIds=[movedAsset.assetId,privateAsset.assetId,movedAsset.assetId];
  const publicBatch=await database.withTransaction(client=>assets.readAssetLocationsBatch(client,batchIds));
  assert.ok(publicBatch.length>0);assert.ok(publicBatch.every(row=>row.assetId===movedAsset.assetId),'batch omits private locations without owner');
  assert.deepEqual(await database.withTransaction(client=>assets.readAssetLocationsBatch(client,batchIds,'other')),publicBatch,'another account receives only public locations');
  const ownedBatch=await database.withTransaction(client=>assets.readAssetLocationsBatch(client,batchIds,'owner'));
  assert.equal(ownedBatch.filter(row=>row.assetId===privateAsset.assetId).length,1,'duplicate IDs never duplicate private locations');
  assert.equal(ownedBatch.find(row=>row.assetId===privateAsset.assetId).locator,'private_file_identity');
  assert.equal((await database.withTransaction(client=>assets.readAssetLocationsBatch(client,[]))).length,0);
  await assert.rejects(()=>database.withTransaction(client=>assets.registerAssetLocation(client,{...privateAssetInput,entityId:work.id})),/scope conflict/);
  await assert.rejects(()=>pool.query('UPDATE canonical_asset_locations SET locator_private=$2::jsonb WHERE asset_id=$1',[privateAsset.assetId,JSON.stringify({locator:'plaintext'})]),/check constraint/);
  await assert.rejects(()=>database.withTransaction(async client=>{await assets.registerAssetLocation(client,{...assetInput,locator:'https://example.org/rollback.jpg'});throw new Error('asset downstream');}),/asset downstream/);
  assert.equal((await database.withTransaction(client=>assets.readAssetLocations(client,movedAsset.assetId)))[0].revision,2);
  for (const locator of ['https://name:secret@example.org/file','https://example.org/file?token=secret']) await assert.rejects(()=>database.withTransaction(client=>assets.registerAssetLocation(client,{...assetInput,locator})),/Credential-bearing/);
  console.log('Asset locations: logical identity survives URL change, revisions are numeric, private locators encrypted and owner scoped, replay/concurrency and scope/credential/rollback checks passed.');
  const contents=load('assetContent'),blocks=load('dataBlocks');
  const manifestFile=join(temporary,'entities.json');
  const manifestValue={schemaVersion:1,coverage:'season:fixture',entities:[{id:work.id,kind:'WORK'},{id:privateWork.id,kind:'WORK'}]};
  fs.writeFileSync(manifestFile,JSON.stringify(manifestValue));
  const localAsset=await database.withTransaction(client=>assets.registerAssetLocation(client,{logicalKey:'local-index',sourceKey:'fixture',ownerId:'owner',backend:'local',locator:manifestFile}));
  const verifyInput={assetId:localAsset.assetId,ownerId:'owner',allowedRoot:temporary,maximumBytes:1024*1024,validateIndexManifest:true};
  const bytesOnly=await database.withTransaction(client=>contents.verifyLocalAssetContent(client,{...verifyInput,validateIndexManifest:false}));
  await assert.rejects(()=>database.withTransaction(client=>blocks.publishDataBlock(client,{logicalKey:'incremental-index',contentId:bytesOnly.id,ownerId:'owner'})),/verified content/);
  const verified=await database.withTransaction(client=>contents.verifyLocalAssetContent(client,verifyInput));
  assert.equal(verified.id,bytesOnly.id,'separate manifest validation preserves immutable byte identity');
  assert.equal(verified.content_hash,crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'));
  assert.equal(verified.byte_length,fs.statSync(manifestFile).size);assert.equal(verified.freshness,'snapshot');
  assert.equal((await database.withTransaction(client=>contents.verifyLocalAssetContent(client,verifyInput))).id,verified.id,'byte verification replay preserves content version');
  await assert.rejects(()=>database.withTransaction(client=>contents.verifyLocalAssetContent(client,{...verifyInput,maximumBytes:1})),/quota exceeded/);
  const otherRoot=join(temporary,'other-root');fs.mkdirSync(otherRoot);
  await assert.rejects(()=>database.withTransaction(client=>contents.verifyLocalAssetContent(client,{...verifyInput,allowedRoot:otherRoot})),/outside authorized root/);
  await assert.rejects(()=>database.withTransaction(client=>contents.verifyLocalAssetContent(client,{...verifyInput,ownerId:'other'})),/account scope/);
  const blockInput={logicalKey:'incremental-index',contentId:verified.id,ownerId:'owner'};
  const block=await database.withTransaction(client=>blocks.publishDataBlock(client,blockInput));
  assert.equal((await database.withTransaction(client=>blocks.publishDataBlock(client,blockInput))).id,block.id);
  assert.equal((await database.withTransaction(client=>blocks.readDataBlocks(client,block.resource_id))).length,0);
  assert.equal((await database.withTransaction(client=>blocks.readDataBlocks(client,block.resource_id,'other'))).length,0);
  assert.equal((await database.withTransaction(client=>blocks.readDataBlocks(client,block.resource_id,'owner')))[0].content_hash,verified.content_hash);
  await assert.rejects(()=>database.withTransaction(client=>blocks.publishDataBlock(client,{...blockInput,ownerId:undefined})),/matching scope/);
  fs.writeFileSync(manifestFile,JSON.stringify({...manifestValue,coverage:'season:next'}));
  const nextContent=await database.withTransaction(client=>contents.verifyLocalAssetContent(client,verifyInput));
  assert.notEqual(nextContent.content_hash,verified.content_hash);assert.equal(nextContent.revision,2);
  await assert.rejects(()=>database.withTransaction(client=>blocks.publishDataBlock(client,{...blockInput,contentId:nextContent.id})),/predecessor conflict/);
  await assert.rejects(()=>database.withTransaction(async client=>{await blocks.publishDataBlock(client,{...blockInput,contentId:nextContent.id,previousBlockId:block.id});throw new Error('block downstream');}),/block downstream/);
  assert.equal((await database.withTransaction(client=>blocks.readDataBlocks(client,block.resource_id,'owner'))).length,1);
  const nextBlock=await database.withTransaction(client=>blocks.publishDataBlock(client,{...blockInput,contentId:nextContent.id,previousBlockId:block.id}));
  assert.equal(nextBlock.revision,2);
  await assert.rejects(()=>pool.query('UPDATE canonical_data_blocks SET coverage=$2 WHERE id=$1',[block.id,'changed']),/immutable/);
  const publicManifestAsset=await database.withTransaction(client=>assets.registerAssetLocation(client,{logicalKey:'public-mixed-manifest',sourceKey:'fixture',backend:'local',locator:manifestFile}));
  await assert.rejects(()=>database.withTransaction(client=>contents.verifyLocalAssetContent(client,{...verifyInput,assetId:publicManifestAsset.assetId})),/scope conflict/);
  console.log('Verified local blocks: real streamed bytes hash/size, quota/root/owner restrictions, mixed-public rejection, immutable revisions, predecessor/replay and atomic publication rollback passed.');
  // Execute the actual catalog writer in the disposable database, without its
  // unrelated network/AI imports. SQL, transaction helper and index are real.
  const catalogSource=fs.readFileSync('src/lib/catalog.ts','utf8');
  const catalogAst=ts.createSourceFile('catalog.ts',catalogSource,ts.ScriptTarget.Latest,true);
  const catalogWriter=catalogAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='saveAnimesToCatalog');
  const catalogContext={ensurePostgresSchema:database.ensurePostgresSchema,withTransaction:database.withTransaction,
    registerCatalogWork:load('catalogSourceIdentity').registerCatalogWork,indexCatalogAssets:load('catalogAssets').indexCatalogAssets,indexCatalogTexts:load('catalogTextVariants').indexCatalogTexts,indexCatalogHierarchy:load('catalogHierarchyIndex').indexCatalogHierarchy,logServerFailure:(_scope,error)=>{throw error;},Date,JSON};
  vm.runInNewContext(ts.transpileModule(catalogWriter.getText(catalogAst),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,catalogContext);
  const catalogMapper=catalogAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='mapDbRowToAnime');
  catalogContext.resolveCatalogText=load('catalogTextVariants').resolveCatalogText;
  catalogContext.filterOfficialStreamingLinks=load('officialSources').filterOfficialStreamingLinks;
  vm.runInNewContext(ts.transpileModule(catalogMapper.getText(catalogAst).replace(/^export /,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,catalogContext);
  const release={mal_id:123456,idAnilist:123456,idMal:98765,title:'Source identity fixture',images:{},genres:[],episodes:3,
    sourceNodes:[{namespace:'anilist:media',id:'123456',type:'ANIME',format:'TV',episodes:3},{namespace:'anilist:media',id:'222',type:'ANIME',format:'MOVIE'}],
    sourceRelations:[{namespace:'anilist:media',fromId:'123456',fromType:'ANIME',toId:'222',toType:'ANIME',relationType:'SIDE_STORY'}]};
  await catalogContext.saveAnimesToCatalog([release],'fixture');
  const releaseRow=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0];
  const scoreFields=['score','score_mal','score_anilist','score_imdb','score_episodes_avg','score_work_general'];
  await pool.query('UPDATE anime_catalog SET score=0,score_mal=0,score_anilist=0,score_imdb=0,score_episodes_avg=0,score_work_general=0 WHERE mal_id=$1',[release.mal_id]);
  const zeroProjection=catalogContext.mapDbRowToAnime((await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0]);
  for(const field of scoreFields) assert.equal(zeroProjection[field],0,'real PostgreSQL projection preserves zero '+field);
  await pool.query('UPDATE anime_catalog SET score=8,score_work_general=NULL WHERE mal_id=$1',[release.mal_id]);
  const unknownProjection=catalogContext.mapDbRowToAnime((await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0]);
  assert.equal(unknownProjection.score,8);assert.equal(unknownProjection.score_work_general,undefined,'unknown work score never inherits another metric');
  await pool.query('UPDATE anime_catalog SET score=$2,score_mal=$3,score_anilist=$4,score_imdb=$5,score_episodes_avg=$6,score_work_general=$7 WHERE mal_id=$1',[release.mal_id,...scoreFields.map(field=>releaseRow[field])]);
  assert.equal(releaseRow.id_mal,release.idMal);assert.equal(releaseRow.id_anilist,release.idAnilist);
  assert.deepEqual(releaseRow.source_relations_json,release.sourceRelations);
  assert.deepEqual(releaseRow.source_nodes_json,release.sourceNodes);
  assert.equal(typeof releaseRow.composition_work_id,'string');
  assert.equal(typeof releaseRow.composition_season_id,'string');
  assert.equal(releaseRow.composition_seasons_json[String(release.idAnilist)],releaseRow.composition_season_id,'writer projects provider season to stable canonical ID');
  assert.equal(typeof releaseRow.composition_universe_id,'string');
  catalogContext.ingestAniListAiringBatch=airingIngestion.ingestAniListAiringBatch;
  catalogContext.readAiringIngestionCheckpoint=airingIngestion.readAiringIngestionCheckpoint;
  // Controlled mapped media input; persistence, source binding and transaction are native.
  catalogContext.mapAniListToAnime=()=>({...release});
  const persistAirings=catalogAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='persistFetchedAniListAirings');
  vm.runInNewContext(ts.transpileModule(persistAirings.getText(catalogAst),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,catalogContext);
  await catalogContext.persistFetchedAniListAirings([{id:9123456,airingAt:2000000,episode:3,media:{id:release.idAnilist}}],'fixture-real-feed-helper',100,200);
  const feedEpisode=await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:airing-schedule','9123456',null));
  assert.equal(feedEpisode.kind,'EPISODE');
  assert.equal((await database.withTransaction(client=>contentFacts.readEpisodeAirings(client,feedEpisode.id)))[0].scheduledAt,2000000000);
  const feedCheckpoint=await database.withTransaction(client=>airingIngestion.readAiringIngestionCheckpoint(client,'fixture-real-feed-helper'));
  assert.equal(feedCheckpoint.revision,1);
  assert.deepEqual(JSON.parse(feedCheckpoint.cursor),{start:100,end:200,count:1});
  console.log('Actual catalog airing persistence helper: mapped fixture, native catalog/index/episode facts and committed window receipt passed; not a live upstream call.');
  const coverFixture={...release,images:{jpg:{image_url:'https://example.org/catalog-cover.jpg'}}};
  await catalogContext.saveAnimesToCatalog([coverFixture],'fixture');
  const firstCover=(await pool.query('SELECT asset_refs_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].asset_refs_json[0];
  assert.equal(firstCover.slot,'cover.jpg.image_url');assert.equal(firstCover.verification,'unverified');
  assert.equal((await pool.query('SELECT entity_id FROM canonical_asset_links WHERE asset_id=$1',[firstCover.assetId])).rows[0].entity_id,releaseRow.composition_season_id);
  await catalogContext.saveAnimesToCatalog([{...coverFixture,images:{jpg:{image_url:'https://example.org/catalog-cover-moved.jpg'}}}],'fixture');
  const secondCover=(await pool.query('SELECT asset_refs_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].asset_refs_json[0];
  assert.equal(secondCover.assetId,firstCover.assetId);assert.equal(secondCover.revision,2);
  const currentCover=await database.withTransaction(client=>assets.registerAssetLocation(client,{logicalKey:JSON.stringify([release.mal_id,'cover.jpg.image_url']),sourceKey:'catalog:visual',backend:'https',locator:'https://example.org/current-canonical-cover.jpg',entityId:releaseRow.composition_season_id,slot:'cover.jpg.image_url'}));
  assert.equal(currentCover.assetId,firstCover.assetId);
  const visualRow=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0];
  const hydrate=load('catalogAssets').hydrateCatalogAssets;
  const hydrated=await database.withTransaction(client=>hydrate(client,[visualRow]));
  const visual=catalogContext.mapDbRowToAnime(hydrated[0]);
  assert.equal(visual.images.jpg.image_url,'https://example.org/current-canonical-cover.jpg','projection uses latest canonical location despite stale raw columns');
  assert.equal(visual.assetRefs[0].revision,currentCover.revision,'projection returns current numeric revision');
  await pool.query("INSERT INTO users(id,username,display_name,created_at,level_tier) VALUES('visual-account','visual-account','Visual',0,2)");
  const visualEpisode=await database.withTransaction(client=>load('catalogReleaseIdentity').ensureReleaseEpisode(client,releaseRow.composition_season_id,1));
  await load('privateActivity').writeActivity('visual-account','EPISODE',visualEpisode,{parentSeriesId:release.mal_id,episodeNumber:1},{watched_seconds:25,total_seconds:100});
  await load('userProfiles').toggleEntityBookmark('visual-account','EPISODE',visualEpisode);
  await database.withTransaction(client=>load('catalogTextVariants').indexCatalogTexts(client,release.mal_id,[{field:'title',locale:'pt-br',form:'default',sourceKey:'zz-account-title',value:'Título canônico da conta'}]));
  assert.equal((await load('userProfiles').getWatchHistory('visual-account'))[0].animeTitle,'Título canônico da conta','history resolves canonical title variants');
  assert.equal((await load('userProfiles').getBookmarkItems('visual-account'))[0].animeTitle,'Título canônico da conta • Ep. 1','favorites retain ordinal label with canonical title');
  const titleStatus=await load('entityStatusPage').getEntityStatusPage('visual-account',{entityType:'EPISODE',limit:20,time:null,id:null});
  assert.equal(titleStatus.statuses[0].anime_title_portuguese,'Título canônico da conta','status exposes proven canonical Portuguese title');
  assert.equal((await load('userProfiles').getWatchHistory('visual-account'))[0].animeImage,'https://example.org/current-canonical-cover.jpg','history uses current canonical cover');
  assert.equal((await load('userProfiles').getBookmarkItems('visual-account'))[0].animeImage,'https://example.org/current-canonical-cover.jpg','favorites use same current canonical cover');
  await pool.query("DELETE FROM canonical_asset_locations WHERE asset_id=$1 AND backend='https'",[currentCover.assetId]);
  const unavailable=await database.withTransaction(client=>hydrate(client,[visualRow]));
  assert.equal(Object.keys(catalogContext.mapDbRowToAnime(unavailable[0]).images).length,0,'missing canonical location never resurrects raw URL');
  assert.equal((await load('userProfiles').getWatchHistory('visual-account'))[0].animeImage,undefined,'history does not resurrect old raw image');
  assert.equal((await load('userProfiles').getBookmarkItems('visual-account'))[0].animeImage,undefined,'favorites do not resurrect old raw image');
  await pool.query("DELETE FROM users WHERE id='visual-account'");
  await catalogContext.saveAnimesToCatalog([release],'fixture');
  assert.deepEqual((await pool.query('SELECT asset_refs_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].asset_refs_json,[]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_asset_links WHERE entity_id=$1 AND asset_id=$2',[releaseRow.composition_season_id,firstCover.assetId])).rows[0].n,0,'removing cover retires current attachment without deleting logical asset');
  console.log('Catalog assets: actual writer projects canonical season cover references, preserves asset ID on URL change and removes stale attachments.');
  const texts=load('catalogTextVariants');
  const suppliedTexts=[{field:'title',locale:'pt-BR',form:'default',sourceKey:'fixture:translation',value:'Título confirmado'},
    {field:'title',locale:'en',form:'short',sourceKey:'fixture:translation',value:'Short title'}];
  await catalogContext.saveAnimesToCatalog([{...release,textVariants:suppliedTexts}],'fixture');
  const initialTexts=(await pool.query('SELECT * FROM canonical_text_variants WHERE entity_id=$1 ORDER BY field,locale,form,source_key',[releaseRow.composition_season_id])).rows;
  assert.ok(initialTexts.some(v=>v.locale==='pt-br' && v.value==='Título confirmado' && v.revision===1));
  await catalogContext.saveAnimesToCatalog([{...release,textVariants:suppliedTexts}],'fixture');
  assert.deepEqual((await pool.query('SELECT * FROM canonical_text_variants WHERE entity_id=$1 ORDER BY field,locale,form,source_key',[releaseRow.composition_season_id])).rows,initialTexts,'text ingestion replay preserves numeric revisions');
  const changedTexts=[{...suppliedTexts[0],value:'Novo título'},suppliedTexts[1]];
  await catalogContext.saveAnimesToCatalog([{...release,textVariants:changedTexts}],'fixture');
  const changedProjection=(await pool.query('SELECT text_variants_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].text_variants_json;
  assert.equal(texts.resolveCatalogText(changedProjection,'title',['pt-br','en'],['default','short']),'Novo título');
  assert.equal(changedProjection.find(v=>v.locale==='pt-br').revision,2);
  await catalogContext.saveAnimesToCatalog([release],'fixture');
  assert.equal((await pool.query('SELECT text_variants_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].text_variants_json.find(v=>v.locale==='pt-br').value,'Novo título','absent metadata preserves known translation');
  const textProjectionRow=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0];
  assert.equal(catalogContext.mapDbRowToAnime(textProjectionRow).title_portuguese,'Novo título','real catalog projection uses the indexed translation');
  assert.equal(catalogContext.mapDbRowToAnime(textProjectionRow).title,release.title,'main title reads indexed unknown-language default from real database');
  await assert.rejects(()=>catalogContext.saveAnimesToCatalog([{...release,title:'Must rollback',textVariants:[{...suppliedTexts[0],value:12}]}],'fixture'),/Invalid content text variant/);
  assert.equal((await pool.query('SELECT title FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].title,release.title,'invalid variant rolls back catalog write');
  console.log('Canonical text variants: actual catalog writer passed locale/form resolution, release linkage, numeric revisions, replay, absent metadata preservation and invalid-input atomic rollback.');
  const hierarchy=load('catalogHierarchyIndex');
  const observedNode=(id,format)=>({namespace:'anilist:media',id:String(id),type:'ANIME',format});
  const observedEdge=(fromId,toId,relationType)=>({namespace:'anilist:media',fromId:String(fromId),fromType:'ANIME',toId:String(toId),toType:'ANIME',relationType});
  const expandedNodes=[observedNode(111,'TV'),...release.sourceNodes];
  const expandedEdges=[observedEdge(111,123456,'SEQUEL'),...release.sourceRelations];
  await database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,release.idAnilist,expandedNodes,expandedEdges));
  const expandedRow=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0];
  assert.equal(expandedRow.composition_work_id,releaseRow.composition_work_id,'expansion with smaller provider ID preserves existing work');
  assert.equal(expandedRow.composition_universe_id,releaseRow.composition_universe_id);
  const season111=await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','111',null));
  const season222=await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','222',null));
  const parent111=(await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[season111.id])).rows[0].parent_id;
  const parent222=(await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[season222.id])).rows[0].parent_id;
  assert.equal(parent111,releaseRow.composition_work_id,'source-proven mainline seasons share work');
  assert.notEqual(parent222,parent111,'film is a distinct work');
  assert.equal((await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[parent222])).rows[0].parent_id,releaseRow.composition_universe_id,'film stays inside shared universe');
  await database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,release.idAnilist,[...expandedNodes].reverse(),[...expandedEdges].reverse()));
  assert.equal((await pool.query('SELECT composition_season_id FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].composition_season_id,releaseRow.composition_season_id,'replay preserves release season');
  await assert.rejects(()=>pool.query('UPDATE anime_catalog SET composition_season_id=$2 WHERE mal_id=$1',[release.mal_id,parent111]),/foreign key/,'raw SQL rejects work used as season');
  for (const id of [777001,777002]) await database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,id,[observedNode(id,'TV')],[]));
  const beforeMerge=(await pool.query('SELECT count(*)::int AS n FROM canonical_memberships')).rows[0].n;
  await assert.rejects(()=>database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,777001,[observedNode(777001,'TV'),observedNode(777002,'TV')],[observedEdge(777001,777002,'SEQUEL')])),/historical reconciliation/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_memberships')).rows[0].n,beforeMerge,'unresolved historical merge rolls back without moving references');
  const oldMergeSeasons=[];
  for (const id of ['777001','777002']) oldMergeSeasons.push(await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season',id,null)));
  const oldMergeParents=(await pool.query('SELECT child_id,parent_id FROM canonical_memberships WHERE child_id=ANY($1::text[]) ORDER BY child_id',[oldMergeSeasons.map(s=>s.id)])).rows;
  const mergedNodes=[observedNode(777001,'TV'),observedNode(777002,'TV')],mergedEdges=[observedEdge(777001,777002,'SEQUEL')];
  const untouchedSeason=await createEntity('SEASON','outside-merge-snapshot');
  const outsideParent=oldMergeParents.map(row=>row.parent_id).sort().at(-1);
  await database.withTransaction(client=>index.linkContentEntities(client,outsideParent,untouchedSeason.id,99,'fixture:outside-snapshot'));
  await assert.rejects(()=>database.withTransaction(async client=>{
    await hierarchy.indexCatalogHierarchy(client,777001,mergedNodes,mergedEdges,{reconcile:true});
    throw new Error('fixture downstream reconciliation failure');
  }),/downstream reconciliation/);
  assert.deepEqual((await pool.query('SELECT child_id,parent_id FROM canonical_memberships WHERE child_id=ANY($1::text[]) ORDER BY child_id',[oldMergeSeasons.map(s=>s.id)])).rows,oldMergeParents,'downstream failure rolls back all moved memberships');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_membership_history WHERE child_id=ANY($1::text[])',[oldMergeSeasons.map(s=>s.id)])).rows[0].n,0,'rollback also removes uncommitted historical records');
  await catalogContext.saveAnimesToCatalog([{mal_id:777001,idAnilist:777001,title:'Merged source fixture',images:{},genres:[],sourceNodes:mergedNodes,sourceRelations:mergedEdges}],'fixture');
  assert.equal((await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[untouchedSeason.id])).rows[0].parent_id,outsideParent,'source merge leaves outside-snapshot membership intact');
  const mergedParents=(await pool.query('SELECT child_id,parent_id FROM canonical_memberships WHERE child_id=ANY($1::text[])',[oldMergeSeasons.map(s=>s.id)])).rows;
  assert.equal(new Set(mergedParents.map(row=>row.parent_id)).size,1,'explicit reconciliation merges source-proven mainline works');
  const mergedCatalog=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=777001')).rows[0];
  assert.equal(mergedCatalog.composition_work_id,mergedParents[0].parent_id,'actual catalog writer applies reconciliation');
  await catalogContext.saveAnimesToCatalog([{mal_id:777002,idAnilist:777002,title:'Second release fixture',images:{},genres:[],sourceNodes:mergedNodes,sourceRelations:mergedEdges}],'fixture');
  await pool.query("INSERT INTO users(id,username,display_name,created_at) VALUES('release-context','release-context','Release context',0)");
  await pool.query("UPDATE users SET profile_private=$1 WHERE id='release-context'",[JSON.stringify(load('privateProfile').encodeProfile('release-context','Release context',''))]);
  const contextActivity=load('privateActivity'),contextReader=load('entityActivityReader');
  for (const [id,opinion] of [['777001','First release'],['777002','Second release'],[mergedCatalog.composition_work_id,'Whole work']]) {
    await (load('activityEntityIndex').isCanonicalEntityId(id)?contextActivity.writeActivity:seedHistoricalActivity)('release-context','SERIES',id,{}, {user_opinion:opinion,user_score:0});
  }
  await pool.query("UPDATE user_entity_status SET is_favorite=(entity_id='777001') WHERE user_id='release-context'");
  for (const [id,opinion] of [['777001','First release'],['777002','Second release'],[mergedCatalog.composition_work_id,'Whole work']]) {
    const canonical=id===mergedCatalog.composition_work_id;
    if(!canonical) await assert.rejects(contextReader.getEntityActivity('release-context','SERIES',id),e=>e.status===400);
    const state=canonical ? await contextReader.getEntityActivity('release-context','SERIES',id) : contextActivity.projectActivity((await pool.query("SELECT * FROM user_entity_status WHERE user_id='release-context' AND entity_type='SERIES' AND entity_id=$1",[id])).rows[0]);
    assert.equal(state.user_opinion,opinion,'shared work preserves exact release opinion');
    assert.equal(state.user_score,0);
    assert.equal(state.is_favorite,id==='777001','release favorite does not leak across shared work');
    if(canonical) assert.equal(await contextReader.getEntityActivity('owner','SERIES',id),null,'aggregate context remains account private');
  }
  const contextRows=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='release-context' ORDER BY entity_id")).rows;
  assert.equal(new Set(contextRows.map(row=>row.canonical_entity_id)).size,1);
  assert.equal(new Set(contextRows.filter(row=>row.release_entity_id).map(row=>row.release_entity_id)).size,2);
  assert.equal(contextRows.find(row=>row.entity_id===mergedCatalog.composition_work_id).release_entity_id,null);
  await assert.rejects(()=>pool.query('UPDATE user_entity_status SET release_entity_id=$2 WHERE id=$1',[contextRows[0].id,mergedCatalog.composition_work_id]),/foreign key/);
  await load('activityEntityIndex').backfillActivityEntities('release-context');
  assert.deepEqual((await pool.query("SELECT * FROM user_entity_status WHERE user_id='release-context' ORDER BY entity_id")).rows,contextRows,'backfill preserves encrypted data and release context on replay');
  await seedHistoricalActivity('release-context','SERIES','historical-aggregate-fixture',{}, {user_opinion:'Bound aggregate opinion',user_score:0});
  await pool.query("UPDATE user_entity_status SET canonical_entity_id=$1 WHERE user_id='release-context' AND entity_id='historical-aggregate-fixture'",[mergedCatalog.composition_work_id]);
  const boundAggregate=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='release-context' AND entity_id='historical-aggregate-fixture'")).rows[0];
  await pool.query("UPDATE user_entity_status SET updated_at=NOW()+INTERVAL '1 second' WHERE user_id='release-context' AND release_entity_id IS NOT NULL");
  const readAggregate=await contextReader.getEntityActivity('release-context','SERIES',mergedCatalog.composition_work_id);
  assert.equal(readAggregate.id,boundAggregate.id,'canonical work read reuses latest bound aggregate despite newer release context');
  assert.equal(readAggregate.entity_id,mergedCatalog.composition_work_id);
  assert.equal(readAggregate.user_opinion,'Bound aggregate opinion');
  assert.equal(readAggregate.user_score,0);
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE id=$1',[boundAggregate.id])).rows[0].activity_private,boundAggregate.activity_private,'canonical read preserves original AAD envelope');
  assert.equal(await contextReader.getEntityActivity('owner','SERIES',mergedCatalog.composition_work_id),null);
  const releaseComments=load('entityCommentWriter'),releaseCommentPages=load('entityCommentPage');
  for (const id of ['777001','777002',mergedCatalog.composition_work_id]) {
    await (load('activityEntityIndex').isCanonicalEntityId(id)?releaseComments.insertEntityComment:seedHistoricalComment)('release-context',{entityType:'SERIES',entityId:id,content:'Discussion '+id});
  }
  for (const id of ['777001','777002']) {
    assert.throws(()=>releaseCommentPages.readEntityCommentPageInput(new URLSearchParams({entity_type:'SERIES',entity_id:id})),e=>e.status===400);
  }
  const aggregateComments=await releaseCommentPages.getEntityCommentPage(releaseCommentPages.readEntityCommentPageInput(new URLSearchParams({entity_type:'SERIES',entity_id:mergedCatalog.composition_work_id})));
  assert.equal(aggregateComments.comments.length,1,'canonical work page excludes release discussions');
  assert.equal(aggregateComments.comments[0].content,'Discussion '+mergedCatalog.composition_work_id);
  const oldAggregateComment=await seedHistoricalComment('release-context',{entityType:'SERIES',entityId:'old-aggregate-comment',content:'Historical aggregate'});
  await pool.query('UPDATE entity_comments SET canonical_entity_id=$2 WHERE id=$1',[oldAggregateComment.id,mergedCatalog.composition_work_id]);
  const aggregateReply=await releaseComments.insertEntityComment('other',{entityType:'SERIES',entityId:mergedCatalog.composition_work_id,parentCommentId:oldAggregateComment.id,content:'Current aggregate reply'});
  assert.equal(aggregateReply.canonical_entity_id,mergedCatalog.composition_work_id,'UUID reply accepts bound historical aggregate');
  const releaseParent=(await pool.query("SELECT id FROM entity_comments WHERE user_id='release-context' AND entity_id='777001'")).rows[0];
  const commentCount=(await pool.query('SELECT count(*)::int AS n FROM entity_comments')).rows[0].n;
  await assert.rejects(releaseComments.insertEntityComment('other',{entityType:'SERIES',entityId:mergedCatalog.composition_work_id,parentCommentId:releaseParent.id,content:'Wrong context'}),e=>e.status===400);
  await assert.rejects(releaseComments.insertEntityComment('other',{entityType:'SERIES',entityId:work.id,parentCommentId:oldAggregateComment.id,content:'Wrong work'}),e=>e.status===400);
  await assert.rejects(releaseComments.insertEntityComment('other',{entityType:'SERIES',entityId:'777001',content:'Old input'}),e=>e.status===400);
  await pool.query('UPDATE entity_comments SET canonical_entity_id=NULL WHERE id=$1',[oldAggregateComment.id]);
  await assert.rejects(releaseComments.insertEntityComment('other',{entityType:'SERIES',entityId:mergedCatalog.composition_work_id,parentCommentId:oldAggregateComment.id,content:'Unbound parent'}),e=>e.status===400);
  await pool.query('UPDATE entity_comments SET canonical_entity_id=$2 WHERE id=$1',[oldAggregateComment.id,mergedCatalog.composition_work_id]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM entity_comments')).rows[0].n,commentCount,'invalid context and old IDs insert no comment');
  await pool.query('DELETE FROM entity_comments WHERE id=$1',[aggregateReply.id]);
  await pool.query("DELETE FROM users WHERE id='release-context'");
  await pool.query('DELETE FROM anime_catalog WHERE mal_id=777002');
  console.log('Release contexts: two seasons share work identity while retaining separate private opinions, score zero and aggregate work state; typed FK and backfill replay passed.');
  assert.notEqual(mergedCatalog.canonical_entity_id,mergedCatalog.composition_work_id,'legacy route identity remains independently preserved');
  const changes=(await pool.query('SELECT * FROM canonical_membership_history WHERE child_id=ANY($1::text[])',[oldMergeSeasons.map(s=>s.id)])).rows;
  assert.equal(changes.length,1);
  assert.equal(changes[0].previous_parent_id,oldMergeParents.find(row=>row.child_id===changes[0].child_id).parent_id);
  assert.equal(changes[0].next_parent_id,mergedParents[0].parent_id);
  assert.equal(crypto.createHash('sha256').update(changes[0].source_snapshot).digest('hex'),changes[0].source_hash);
  assert.deepEqual(JSON.parse(changes[0].source_snapshot).relations,mergedEdges,'historical move retains source proof after live snapshot changes');
  await assert.rejects(()=>pool.query('UPDATE canonical_membership_history SET source_key=$2 WHERE id=$1',[changes[0].id,'forged']),/immutable/);
  await assert.rejects(()=>pool.query('DELETE FROM canonical_membership_history WHERE id=$1',[changes[0].id]),/immutable/);
  await database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,777001,[...mergedNodes].reverse(),mergedEdges,{reconcile:true}));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_membership_history WHERE child_id=ANY($1::text[])',[oldMergeSeasons.map(s=>s.id)])).rows[0].n,1,'merge replay adds no duplicate history');
  for (const season of oldMergeSeasons) assert.equal((await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season',season===oldMergeSeasons[0]?'777001':'777002',null))).id,season.id,'merge preserves season aliases');
  await pool.query('DELETE FROM anime_catalog WHERE mal_id=777001');
  const beforeSplitHistory=(await pool.query('SELECT count(*)::int AS n FROM canonical_membership_history')).rows[0].n;
  await assert.rejects(()=>database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,777001,mergedNodes,[],{reconcile:true})),/positive source evidence/,'missing edge alone is insufficient to split persisted work');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_membership_history')).rows[0].n,beforeSplitHistory);
  const correctedEdges=[observedEdge(777001,777002,'SPIN_OFF')];
  await database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,777001,mergedNodes,correctedEdges,{reconcile:true}));
  const splitParents=(await pool.query('SELECT child_id,parent_id FROM canonical_memberships WHERE child_id=ANY($1::text[]) ORDER BY child_id',[oldMergeSeasons.map(s=>s.id)])).rows;
  assert.equal(new Set(splitParents.map(row=>row.parent_id)).size,2,'source correction to spin-off separates works');
  const splitUniverses=(await pool.query("SELECT DISTINCT parent_id FROM canonical_memberships WHERE parent_kind='UNIVERSE' AND child_id=ANY($1::text[])",[splitParents.map(row=>row.parent_id)])).rows;
  assert.equal(splitUniverses.length,1,'source-proven spin-off retains shared universe');
  await database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,777001,[...mergedNodes].reverse(),correctedEdges,{reconcile:true}));
  assert.deepEqual((await pool.query('SELECT child_id,parent_id FROM canonical_memberships WHERE child_id=ANY($1::text[]) ORDER BY child_id',[oldMergeSeasons.map(s=>s.id)])).rows,splitParents,'split replay preserves IDs');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_membership_history')).rows[0].n,beforeSplitHistory+1,'split is recorded once');
  const crossoverUniverse=await createEntity('UNIVERSE','retained-crossover-context');
  const crossoverWork=splitParents[0].parent_id;
  await database.withTransaction(client=>index.linkContentEntities(client,crossoverUniverse.id,crossoverWork,null,'fixture:explicit-crossover'));
  const crossoverParents=(await pool.query("SELECT parent_id FROM canonical_memberships WHERE child_id=$1 AND parent_kind='UNIVERSE' ORDER BY parent_id",[crossoverWork])).rows;
  await database.withTransaction(client=>hierarchy.indexCatalogHierarchy(client,777001,mergedNodes,correctedEdges,{reconcile:true}));
  assert.deepEqual((await pool.query("SELECT parent_id FROM canonical_memberships WHERE child_id=$1 AND parent_kind='UNIVERSE' ORDER BY parent_id",[crossoverWork])).rows,crossoverParents,'provider graph replay preserves explicitly linked crossover contexts');
  const movedReleaseId=oldMergeSeasons[0].id===changes[0].child_id ? 777001 : 777002;
  await catalogContext.saveAnimesToCatalog([{mal_id:movedReleaseId,idAnilist:movedReleaseId,title:'Rebinding fixture',images:{},genres:[],sourceNodes:mergedNodes,sourceRelations:correctedEdges}],'fixture');
  await pool.query("INSERT INTO users(id,username,display_name,created_at) VALUES('rebind-fixture','rebind-fixture','Rebind',0)");
  const rebindActivity=load('privateActivity'),rebindIndex=load('activityEntityIndex');
  await seedHistoricalActivity('rebind-fixture','SERIES',String(movedReleaseId),{parentSeriesId:movedReleaseId},{user_opinion:'Keep private opinion',watched_seconds:25});
  const rebindRow=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='rebind-fixture'")).rows[0];
  const historyComments=load('entityCommentWriter');
  const historyComment=await seedHistoricalComment('rebind-fixture',{entityType:'SERIES',entityId:String(movedReleaseId),content:'Historical release comment'});
  await pool.query('UPDATE entity_comments SET canonical_entity_id=$2 WHERE id=$1',[historyComment.id,changes[0].previous_parent_id]);
  const commentBefore=(await pool.query('SELECT * FROM entity_comments WHERE id=$1',[historyComment.id])).rows[0];
  await pool.query("CREATE FUNCTION reject_comment_rebind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.canonical_entity_id IS DISTINCT FROM NEW.canonical_entity_id THEN RAISE EXCEPTION 'fixture comment downstream failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER reject_comment_rebind BEFORE UPDATE ON entity_comments FOR EACH ROW EXECUTE FUNCTION reject_comment_rebind()');
  await assert.rejects(()=>historyComments.backfillCommentEntities('rebind-fixture'),/comment downstream failure/);
  assert.deepEqual((await pool.query('SELECT * FROM entity_comments WHERE id=$1',[historyComment.id])).rows[0],commentBefore,'downstream error restores complete comment record');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM comment_binding_history WHERE comment_id=$1',[historyComment.id])).rows[0].n,0,'downstream error rolls back proof audit');
  await pool.query('DROP TRIGGER reject_comment_rebind ON entity_comments');
  await pool.query('DROP FUNCTION reject_comment_rebind()');
  await historyComments.backfillCommentEntities('rebind-fixture');
  const commentAfter=(await pool.query('SELECT * FROM entity_comments WHERE id=$1',[historyComment.id])).rows[0];
  assert.equal(commentAfter.canonical_entity_id,rebindRow.canonical_entity_id);
  for (const field of ['content','entity_id','release_entity_id','parent_comment_id','user_id','created_at','updated_at']) assert.deepEqual(commentAfter[field],commentBefore[field],'historical comment rebind preserves '+field);
  const commentProof=(await pool.query('SELECT * FROM comment_binding_history WHERE comment_id=$1',[historyComment.id])).rows;
  assert.equal(commentProof.length,1);assert.ok(commentProof[0].membership_proof_ids.length>0);
  await historyComments.backfillCommentEntities('rebind-fixture');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM comment_binding_history WHERE comment_id=$1',[historyComment.id])).rows[0].n,1);
  await assert.rejects(()=>pool.query('UPDATE comment_binding_history SET next_entity_id=$2 WHERE id=$1',[commentProof[0].id,changes[0].previous_parent_id]),/immutable/);
  await assert.rejects(()=>pool.query('UPDATE entity_comments SET release_entity_id=$2 WHERE id=$1',[historyComment.id,rebindRow.canonical_entity_id]),/foreign key/);
  await pool.query('UPDATE user_entity_status SET canonical_entity_id=$2,is_favorite=TRUE WHERE id=$1',[rebindRow.id,changes[0].previous_parent_id]);
  const oldBound=(await pool.query('SELECT * FROM user_entity_status WHERE id=$1',[rebindRow.id])).rows[0];
  await rebindIndex.backfillActivityEntities('rebind-fixture',{limit:1});
  const newBound=(await pool.query('SELECT * FROM user_entity_status WHERE id=$1',[rebindRow.id])).rows[0];
  assert.equal(newBound.canonical_entity_id,rebindRow.canonical_entity_id,'proven history migrates old work reference to current composition');
  for (const field of ['entity_id','activity_private','status','is_favorite','updated_at','created_at']) assert.deepEqual(newBound[field],oldBound[field],'work migration preserves '+field);
  const rebindProof=(await pool.query('SELECT * FROM activity_binding_history WHERE status_id=$1',[rebindRow.id])).rows;
  assert.equal(rebindProof.length,1);assert.ok(rebindProof[0].membership_proof_ids.length>0);
  await rebindIndex.backfillActivityEntities('rebind-fixture',{limit:1});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM activity_binding_history WHERE status_id=$1',[rebindRow.id])).rows[0].n,1,'rebind replay produces no duplicate audit');
  await assert.rejects(()=>pool.query('UPDATE activity_binding_history SET previous_entity_id=$2 WHERE id=$1',[rebindProof[0].id,newBound.canonical_entity_id]),/immutable/);
  const unprovenWork=await createEntity('WORK','unproven-activity-rebind');
  await pool.query('UPDATE entity_comments SET canonical_entity_id=$2 WHERE id=$1',[historyComment.id,unprovenWork.id]);
  const badComment=(await pool.query('SELECT * FROM entity_comments WHERE id=$1',[historyComment.id])).rows[0];
  await assert.rejects(()=>historyComments.backfillCommentEntities('rebind-fixture'),/identity conflict/);
  assert.deepEqual((await pool.query('SELECT * FROM entity_comments WHERE id=$1',[historyComment.id])).rows[0],badComment,'unproven comment migration rolls back all fields');
  console.log('Historical comment reconciliation: source membership proof updates only canonical reference, preserves release/content/author/dates, audits once, rejects unproven changes and rolls back audit on downstream failure.');
  await pool.query('UPDATE user_entity_status SET canonical_entity_id=$2 WHERE id=$1',[rebindRow.id,unprovenWork.id]);
  await assert.rejects(()=>rebindIndex.backfillActivityEntities('rebind-fixture',{limit:1}),/identity conflict/);
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE id=$1',[rebindRow.id])).rows[0].activity_private,oldBound.activity_private,'unproven rebind rolls back without touching encrypted data');
  await pool.query("DELETE FROM users WHERE id='rebind-fixture'");
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM activity_binding_history WHERE status_id=$1',[rebindRow.id])).rows[0].n,0,'account deletion removes private binding audit');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM comment_binding_history WHERE comment_id=$1',[historyComment.id])).rows[0].n,0,'account deletion removes comment binding audit');
  await pool.query('DELETE FROM anime_catalog WHERE mal_id=$1',[movedReleaseId]);
  console.log('Activity historical reconciliation: actual account backfill follows immutable membership proof, preserves AEAD/favorite/status/dates, rejects unproven rebinding and cascades private audit.');
  console.log('Canonical reconciliation: actual writer merges proven works, retains immutable source proof, preserves aliases and outside-snapshot links, replay and downstream rollback passed.');
  console.log('Catalog hierarchy: real writer creates typed links; source mainline, film separation, stable expansion/replay and conflict rollback passed.');
  const canonicalActivity=load('privateActivity');
  const activityIndex=load('activityEntityIndex');
  const activityId=`${release.mal_id}:s0:e1`;
  await pool.query("INSERT INTO users(id,username,display_name,created_at) VALUES ('canonical-alpha','canonical-alpha','Alpha',0),('canonical-beta','canonical-beta','Beta',0)");
  await Promise.all([
    seedHistoricalActivity('canonical-alpha','EPISODE',activityId,{parentSeriesId:release.mal_id,seasonIdx:0,episodeNumber:1},{watched_seconds:10,user_opinion:'Alpha private'}),
    seedHistoricalActivity('canonical-beta','EPISODE',activityId,{parentSeriesId:release.mal_id,seasonIdx:0,episodeNumber:1},{watched_seconds:20,user_opinion:'Beta private'}),
  ]);
  const canonicalRows=(await pool.query('SELECT * FROM user_entity_status WHERE entity_id=$1 ORDER BY user_id',[activityId])).rows;
  assert.equal(canonicalRows.length,2);
  assert.equal(typeof canonicalRows[0].canonical_entity_id,'string');
  assert.equal(canonicalRows[0].canonical_entity_id,canonicalRows[1].canonical_entity_id,'same source episode is shared across accounts');
  assert.equal(canonicalActivity.projectActivity(canonicalRows[0]).user_opinion,'Alpha private');
  assert.equal(canonicalActivity.projectActivity(canonicalRows[1]).user_opinion,'Beta private');
  assert.notDeepEqual(canonicalRows[0].activity_private,canonicalRows[1].activity_private);
  const beforeBinding=canonicalRows[0].activity_private;
  await canonicalActivity.writeActivity('canonical-alpha','SEASON',releaseRow.composition_season_id,{}, {user_opinion:'Stable canonical season'});
  const stableSeasonBefore=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='canonical-alpha' AND entity_id=$1",[releaseRow.composition_season_id])).rows[0];
  assert.equal(stableSeasonBefore.canonical_entity_id,releaseRow.composition_season_id);
  await pool.query('UPDATE anime_catalog SET seasons_json=$2 WHERE mal_id=$1',[release.mal_id,JSON.stringify([{id:222},{id:123456}])]);
  await canonicalActivity.writeActivity('canonical-alpha','SEASON',releaseRow.composition_season_id,{}, {watched_seconds:7});
  const stableSeasonAfter=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='canonical-alpha' AND entity_id=$1",[releaseRow.composition_season_id])).rows[0];
  assert.equal(stableSeasonAfter.id,stableSeasonBefore.id,'direct canonical season identity survives display reorder');
  assert.equal(canonicalActivity.projectActivity(stableSeasonAfter).user_opinion,'Stable canonical season');
  await pool.query('UPDATE anime_catalog SET seasons_json=$2 WHERE mal_id=$1',[release.mal_id,JSON.stringify([])]);
  await assert.rejects(()=>canonicalActivity.writeActivity('canonical-alpha','SEASON',releaseRow.composition_work_id,{},{}),e=>e.status===400);
  await assert.rejects(()=>canonicalActivity.writeActivity('canonical-alpha','SERIES',privateWork.id,{},{}),e=>e.status===400);
  await database.withTransaction(client=>activityIndex.bindActivityEntity(client,'canonical-alpha','EPISODE',activityId));
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE id=$1',[canonicalRows[0].id])).rows[0].activity_private,beforeBinding,'binding does not rewrite ciphertext or AAD');
  await pool.query('UPDATE user_entity_status SET canonical_entity_id=NULL WHERE id=$1',[canonicalRows[1].id]);
  const migratedActivity=await activityIndex.backfillActivityEntities('canonical-beta',{limit:1});
  assert.equal(migratedActivity.processed,1);assert.equal(migratedActivity.unresolved,0);
  const migratedRow=(await pool.query('SELECT * FROM user_entity_status WHERE id=$1',[canonicalRows[1].id])).rows[0];
  assert.equal(migratedRow.canonical_entity_id,canonicalRows[0].canonical_entity_id);
  assert.deepEqual(migratedRow.activity_private,canonicalRows[1].activity_private,'account-scoped backfill preserves existing ciphertext');
  await activityIndex.backfillActivityEntities('canonical-beta',{limit:1});
  assert.equal((await pool.query('SELECT canonical_entity_id FROM user_entity_status WHERE id=$1',[canonicalRows[1].id])).rows[0].canonical_entity_id,migratedRow.canonical_entity_id);
  assert.equal((await pool.query('SELECT parent_id FROM canonical_memberships WHERE child_id=$1',[canonicalRows[0].canonical_entity_id])).rows[0].parent_id,releaseRow.composition_season_id);
  await assert.rejects(()=>pool.query('UPDATE user_entity_status SET canonical_entity_id=$2 WHERE id=$1',[canonicalRows[0].id,releaseRow.composition_work_id]),/foreign key/);
  await pool.query('UPDATE anime_catalog SET seasons_json=$2,source_nodes_json=$3 WHERE mal_id=$1',[release.mal_id,JSON.stringify([{id:111}]),JSON.stringify(expandedNodes)]);
  await assert.rejects(()=>canonicalActivity.writeActivity('canonical-alpha','EPISODE',activityId,{}, {watched_seconds:99}),e=>e.status===400);
  const afterConflict=(await pool.query('SELECT * FROM user_entity_status WHERE id=$1',[canonicalRows[0].id])).rows[0];
  assert.deepEqual(afterConflict.activity_private,beforeBinding,'old coordinate writer rejected without private update');
  assert.equal(afterConflict.canonical_entity_id,canonicalRows[0].canonical_entity_id);
  await pool.query('UPDATE anime_catalog SET seasons_json=$2,source_nodes_json=$3 WHERE mal_id=$1',[release.mal_id,JSON.stringify([]),JSON.stringify(release.sourceNodes)]);
  await pool.query("DELETE FROM users WHERE id IN ('canonical-alpha','canonical-beta')");
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_entities WHERE id=$1',[canonicalRows[0].canonical_entity_id])).rows[0].n,1,'account deletion preserves shared episode');
  console.log('Historical activity fixtures: native binding shares stable episode IDs with separate account AEAD, unchanged ciphertext, typed FK and rejected old writer input. Current UUID writer season updates passed.');
  assert.equal(typeof releaseRow.canonical_entity_id,'string');
  await catalogContext.saveAnimesToCatalog([{...release,idMal:undefined,idAnilist:undefined,sourceRelations:undefined,sourceNodes:undefined,title:'Updated label'}],'fixture');
  const updatedRelease=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0];
  assert.equal(updatedRelease.canonical_entity_id,releaseRow.canonical_entity_id);assert.equal(updatedRelease.id_mal,release.idMal);assert.equal(updatedRelease.id_anilist,release.idAnilist);
  assert.deepEqual(updatedRelease.source_relations_json,release.sourceRelations,'absent source snapshot does not erase observed graph');
  assert.deepEqual(updatedRelease.source_nodes_json,release.sourceNodes,'missing node snapshot preserves source metadata');
  await catalogContext.saveAnimesToCatalog([{...release,title:'Updated label',sourceRelations:[]}],'fixture');
  assert.deepEqual((await pool.query('SELECT source_relations_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].source_relations_json,[],'confirmed empty source graph differs from missing snapshot');
  await assert.rejects(()=>catalogContext.saveAnimesToCatalog([{...release,title:'Wrong namespace',idAnilist:5555}],'fixture'));
  assert.equal((await pool.query('SELECT title FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].title,'Updated label');
  await assert.rejects(()=>catalogContext.saveAnimesToCatalog([{...release,mal_id:123457}],'fixture'));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM anime_catalog WHERE mal_id=123457')).rows[0].count,0,'alias conflict rolls back catalog insert');
  await catalogContext.saveAnimesToCatalog([{...release,mal_id:123458,idMal:undefined,idAnilist:undefined}],'fixture');
  await catalogContext.saveAnimesToCatalog([{...release,mal_id:123459,idMal:undefined,idAnilist:undefined,episodes:0}],'fixture');
  assert.equal((await pool.query('SELECT episodes FROM anime_catalog WHERE mal_id=123459')).rows[0].episodes,0,'known zero is not converted to unknown');
  const legacyAliases=(await pool.query('SELECT namespace FROM canonical_aliases WHERE entity_id=(SELECT canonical_entity_id FROM anime_catalog WHERE mal_id=123458)')).rows;
  assert.deepEqual(legacyAliases.map(row=>row.namespace),['anirium:legacy:work'],'ambiguous legacy ID never gets a fabricated provider namespace');
  await assert.rejects(()=>pool.query('UPDATE anime_catalog SET canonical_entity_id=$1 WHERE mal_id=$2',[episode.id,release.mal_id]),'catalog must reference WORK kind');
  console.log('Catalog source identities: actual writer passed verified MAL/AniList persistence, stable work ID, absent metadata preservation, namespace conflict rollback and legacy-only mapping.');
  const backfill=load('catalogBackfill').backfillCatalogWorks;
  await pool.query(`INSERT INTO anime_catalog(mal_id,title,images_json,updated_at,id_mal)
    VALUES (201001,'Legacy A','{}',0,NULL),(201002,'Legacy B','{}',0,NULL),
           (201003,'Legacy C','{}',0,NULL),(201004,'Conflict D','{}',0,$1)`,[release.idMal]);
  const firstPage=await backfill({afterId:201000,limit:2});
  assert.deepEqual(plain(firstPage),{afterId:201000,processed:2,nextAfterId:201002,exhausted:false});
  const pageIds=()=>pool.query('SELECT canonical_entity_id FROM anime_catalog WHERE mal_id IN (201001,201002) ORDER BY mal_id');
  const originalPageIds=plain((await pageIds()).rows);
  await Promise.all([backfill({afterId:201000,limit:2}),backfill({afterId:201000,limit:2})]);
  assert.deepEqual(plain((await pageIds()).rows),originalPageIds,'replay/concurrency preserve identity');
  await assert.rejects(()=>backfill({afterId:firstPage.nextAfterId,limit:2}));
  assert.equal((await pool.query('SELECT canonical_entity_id FROM anime_catalog WHERE mal_id=201003')).rows[0].canonical_entity_id,null,'conflict in last row rolls entire page back');
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM canonical_aliases WHERE namespace='anirium:legacy:work' AND value='201003'")).rows[0].count,0);
  await pool.query('UPDATE anime_catalog SET id_mal=NULL WHERE mal_id=201004');
  const lastPage=await backfill({afterId:firstPage.nextAfterId,limit:2});
  assert.deepEqual(plain(lastPage),{afterId:201002,processed:2,nextAfterId:201004,exhausted:true});
  assert.equal((await backfill({afterId:lastPage.nextAfterId,limit:2})).processed,0);
  for (const options of [{afterId:-1},{afterId:'201000'},{afterId:null},{limit:null},{limit:0},{limit:201},{limit:1.5}]) await assert.rejects(()=>backfill(options));
  await pool.query("INSERT INTO anime_catalog(mal_id,title,images_json,updated_at) VALUES(201000,'Late low ID','{}',0)");
  assert.equal((await backfill({afterId:lastPage.nextAfterId,limit:2})).processed,0,'a highwater cursor alone cannot prove population coverage');
  assert.equal((await pool.query('SELECT canonical_entity_id FROM anime_catalog WHERE mal_id=201000')).rows[0].canonical_entity_id,null);
  await backfill({afterId:200999,limit:1});
  assert.equal(typeof (await pool.query('SELECT canonical_entity_id FROM anime_catalog WHERE mal_id=201000')).rows[0].canonical_entity_id,'string','reconciliation scan picks up late low-ID insert');
  console.log('Catalog backfill: real PostgreSQL passed bounded pages, committed cursor, concurrent replay and whole-page rollback on downstream conflict.');
  save('old');
  const profiles = load('userProfiles'), lib = load('privateData'), migration = load('privateDataMigration');
  await pool.query("INSERT INTO users(id,username,display_name,created_at) VALUES('plugin-owner-A','plugin-A','A',0),('plugin-owner-B','plugin-B','B',0)");
  await profiles.toggleUserAddon('plugin-owner-A','player-pro',false);
  const officialPlayer=(await profiles.getUserInstalledAddons('plugin-owner-A')).find(row=>row.addon_id==='player-pro');
  const officialDescriptor=JSON.parse(fs.readFileSync('src/addons/player-pro/manifest.json','utf8'));
  assert.equal(officialPlayer.selected_source_kind,'official-package');assert.equal(officialPlayer.selected_version,officialDescriptor.version);assert.equal(officialPlayer.enabled,false);
  await assert.rejects(()=>database.withTransaction(client=>load('pluginReleaseIndex').selectPluginRelease(client,'plugin-owner-A',officialPlayer.canonical_plugin_id,officialDescriptor)),'same descriptor cannot silently acquire a different provenance');
  assert.equal((await profiles.getUserInstalledAddons('plugin-owner-A')).find(row=>row.addon_id==='player-pro').selected_release_id,officialPlayer.selected_release_id);
  await assert.rejects(()=>profiles.installUserAddon('plugin-owner-A',{id:'player-pro',version:'99.0.0',origin:'official'}));
  await profiles.toggleUserAddon('plugin-owner-B','player-pro',true);
  await pool.query("UPDATE user_addons SET config_json=$1,selected_release_id=NULL WHERE user_id='plugin-owner-B' AND addon_id='player-pro'",[JSON.stringify(lib.encryptPrivateJson({id:'player-pro',version:'99.0.0',privateConfig:'B-package-config'},lib.addonPrivateContext('plugin-owner-B','player-pro')))]);
  await load('accountPluginIndex').backfillAccountPlugins('plugin-owner-B');
  const repairedOfficial=(await profiles.getUserInstalledAddons('plugin-owner-B')).find(row=>row.addon_id==='player-pro');
  assert.equal(repairedOfficial.selected_version,officialDescriptor.version);assert.equal(repairedOfficial.selected_source_kind,'official-package');assert.equal(repairedOfficial.config_json.privateConfig,'B-package-config');
  await Promise.all([
    profiles.installUserAddon('plugin-owner-A',{id:'shared-binding-fixture',version:'1.0.0',privateConfig:'A-secret'}),
    profiles.installUserAddon('plugin-owner-B',{id:'shared-binding-fixture',version:'1.0.0',privateConfig:'B-secret'})
  ]);
  const bindings=(await pool.query("SELECT user_id,canonical_plugin_id,config_json FROM user_addons WHERE addon_id='shared-binding-fixture' ORDER BY user_id")).rows;
  assert.equal(bindings.length,2);assert.equal(bindings[0].canonical_plugin_id,bindings[1].canonical_plugin_id);
  assert.ok(bindings[0].canonical_plugin_id);
  const ownerAccounts=(await pool.query("SELECT id,canonical_account_id FROM users WHERE id LIKE 'plugin-owner-%' ORDER BY id")).rows;
  assert.notEqual(ownerAccounts[0].canonical_account_id,ownerAccounts[1].canonical_account_id);
  assert.ok(ownerAccounts.every(row=>row.canonical_account_id));
  await assert.rejects(()=>pool.query('UPDATE users SET canonical_account_id=$1 WHERE id=$2',[ownerAccounts[1].canonical_account_id,'plugin-owner-A']),'DB rejects another account identity');
  await assert.rejects(()=>pool.query("UPDATE user_addons SET canonical_plugin_id=$1 WHERE user_id='plugin-owner-A' AND addon_id='shared-binding-fixture'",[work.id]),'DB rejects non-plugin target');
  await profiles.toggleUserAddon('plugin-owner-A','shared-binding-fixture',false);
  const addonA=(await profiles.getUserInstalledAddons('plugin-owner-A')).find(row=>row.addon_id==='shared-binding-fixture');
  const addonB=(await profiles.getUserInstalledAddons('plugin-owner-B')).find(row=>row.addon_id==='shared-binding-fixture');
  assert.equal(addonA.enabled,false);assert.equal(addonB.enabled,true);
  assert.equal(addonA.config_json.privateConfig,'A-secret');assert.equal(addonB.config_json.privateConfig,'B-secret');
  assert.equal(addonA.canonical_plugin_id,addonB.canonical_plugin_id);
  assert.equal(addonA.selected_release_id,addonB.selected_release_id,'private config differs without duplicating one release');
  assert.equal(addonA.selected_version,'1.0.0');
  await profiles.installUserAddon('plugin-owner-B',{id:'shared-binding-fixture',version:'2.0.0',privateConfig:'B-secret'});
  const updatedAddonB=(await profiles.getUserInstalledAddons('plugin-owner-B')).find(row=>row.addon_id==='shared-binding-fixture');
  assert.equal(updatedAddonB.selected_version,'2.0.0');assert.notEqual(updatedAddonB.selected_release_id,addonA.selected_release_id);
  assert.equal((await profiles.getUserInstalledAddons('plugin-owner-A')).find(row=>row.addon_id==='shared-binding-fixture').selected_release_id,addonA.selected_release_id,'B upgrade does not upgrade A');
  await assert.rejects(()=>pool.query("UPDATE canonical_plugin_releases SET version='forged' WHERE id=$1",[addonA.selected_release_id]));
  await profiles.installUserAddon('plugin-owner-B',{id:'shared-binding-fixture',version:'1.0.0',name:'Different descriptor',privateConfig:'B-secret'});
  const descriptorVariant=(await profiles.getUserInstalledAddons('plugin-owner-B')).find(row=>row.addon_id==='shared-binding-fixture');
  assert.notEqual(descriptorVariant.selected_release_id,addonA.selected_release_id,'same version label cannot overwrite a different descriptor snapshot');
  await profiles.installUserAddon('plugin-owner-B',{id:'versionless-binding',privateConfig:'legacy-secret'});
  assert.equal((await profiles.getUserInstalledAddons('plugin-owner-B')).find(row=>row.addon_id==='versionless-binding').selected_release_id,null,'no invented release version');
  await profiles.installUserAddon('plugin-owner-B',{id:'remote-version-fixture',kind:'remote-manifest',manifestUrl:'https://example.invalid/private-location',version:'9.0.0'});
  assert.equal((await profiles.getUserInstalledAddons('plugin-owner-B')).find(row=>row.addon_id==='remote-version-fixture').selected_release_id,null,'remote registration is not a resolved release');
  const beforeReleaseFailure=(await pool.query("SELECT * FROM user_addons WHERE user_id='plugin-owner-A' AND addon_id='shared-binding-fixture'")).rows[0];
  await assert.rejects(()=>profiles.installUserAddon('plugin-owner-A',{id:'shared-binding-fixture',version:'3.0.0',capabilities:['_invalid'],privateConfig:'corrupted'}));
  assert.deepEqual((await pool.query("SELECT * FROM user_addons WHERE user_id='plugin-owner-A' AND addon_id='shared-binding-fixture'")).rows[0],beforeReleaseFailure,'invalid release rolls back private config and selected snapshot together');
  const sharedReleaseDump=JSON.stringify((await pool.query('SELECT * FROM canonical_plugin_releases')).rows);
  assert.ok(!sharedReleaseDump.includes('A-secret')&&!sharedReleaseDump.includes('B-secret')&&!sharedReleaseDump.includes('private-location'),'shared releases contain no account config or locator');
  await pool.query("INSERT INTO user_addons(user_id,addon_id,enabled,installed_at) VALUES('plugin-owner-B','legacy-binding',FALSE,0)");
  const pluginMigration=load('accountPluginIndex').backfillAccountPlugins;
  const pluginPage=await pluginMigration('plugin-owner-B',{limit:1});
  assert.equal(pluginPage.processed,1);assert.equal(pluginPage.nextAfterAddonId,'legacy-binding');assert.equal(pluginPage.exhausted,false);
  const legacyPlugin=(await pool.query("SELECT canonical_plugin_id,enabled,config_json FROM user_addons WHERE user_id='plugin-owner-B' AND addon_id='legacy-binding'")).rows[0];
  assert.ok(legacyPlugin.canonical_plugin_id);assert.equal(legacyPlugin.enabled,false);
  await assert.rejects(()=>pool.query("UPDATE user_addons SET canonical_plugin_id=$1 WHERE user_id='plugin-owner-A' AND addon_id='shared-binding-fixture'",[legacyPlugin.canonical_plugin_id]),'release FK rejects cross-plugin identity');
  await pluginMigration('plugin-owner-B',{limit:1});
  assert.deepEqual((await pool.query("SELECT canonical_plugin_id,enabled,config_json FROM user_addons WHERE user_id='plugin-owner-B' AND addon_id='legacy-binding'")).rows[0],legacyPlugin,'backfill/replay leaves legacy config and state untouched');
  const remainingPluginPage=await pluginMigration('plugin-owner-B',{afterAddonId:pluginPage.nextAfterAddonId,limit:4});
  assert.equal(remainingPluginPage.processed,4);assert.equal(remainingPluginPage.exhausted,true);
  await assert.rejects(()=>pluginMigration('plugin-owner-B',{limit:null}));
  const beforeBindingRollback=(await pool.query('SELECT count(*)::int AS count FROM canonical_entities')).rows[0].count;
  await assert.rejects(()=>database.withTransaction(async client=>{
    await client.query("INSERT INTO user_addons(user_id,addon_id,enabled,installed_at) VALUES('plugin-owner-A','binding-rollback',TRUE,0)");
    await load('accountPluginIndex').registerAccountPlugin(client,'plugin-owner-A','binding-rollback');
    throw new Error('binding downstream failure');
  }));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM canonical_entities')).rows[0].count,beforeBindingRollback);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_addons WHERE addon_id='binding-rollback'")).rows[0].count,0);
  await pool.query("DELETE FROM users WHERE id='plugin-owner-A'");
  const pluginPrivateMigrationClient=await pool.connect();
  try { await load('privateDataMigration').migrateAddonPrivateBatch(pluginPrivateMigrationClient,['',''],500); }
  finally { pluginPrivateMigrationClient.release(); }
  assert.equal((await profiles.getUserInstalledAddons('plugin-owner-B')).find(row=>row.addon_id==='shared-binding-fixture').config_json.privateConfig,'B-secret');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM canonical_entities WHERE id=$1',[addonB.canonical_plugin_id])).rows[0].count,1,'account deletion preserves shared definition');
  await pool.query("DELETE FROM users WHERE id='plugin-owner-B'");
  console.log('Account plugin index: actual concurrent install/toggle/read passed shared identity, private account/config isolation, typed FKs, rollback and account deletion.');
  // Two independent Core modules contend for the same final slot in real PostgreSQL.
  await pool.query("INSERT INTO users(id,username,display_name,created_at) VALUES ('cap-owner','cap-owner','Cap',0),('cap-other','cap-other','Other cap',0)");
  for(let index=0;index<49;index++) await profiles.installUserAddon('cap-owner',{id:`cap.seed.${index}`,privateConfig:'cap-private'});
  modules.delete('userProfiles');
  const secondProfiles=load('userProfiles');
  const attempts=await Promise.allSettled(Array.from({length:6},(_,index)=>(index%2?secondProfiles:profiles).installUserAddon('cap-owner',{id:`cap.race.${index}`,privateConfig:'cap-race-private'})));
  assert.equal(attempts.filter(row=>row.status==='fulfilled').length,1,'exactly one last-slot winner across two Core modules');
  assert.ok(attempts.filter(row=>row.status==='rejected').every(row=>row.reason.status===409&&row.reason.reason==='addon_install_limit'));
  const capCount=async()=>Number((await pool.query("SELECT count(*)::int AS count FROM user_addons WHERE user_id='cap-owner' AND addon_id<>'player-pro'")).rows[0].count);
  assert.equal(await capCount(),50);
  await profiles.installUserAddon('cap-owner',{id:'cap.seed.0',privateConfig:'updated-private'});
  assert.equal(await capCount(),50,'existing addon update consumes no slot');
  const capRows=await profiles.getUserInstalledAddons('cap-owner');
  assert.equal(capRows.find(row=>row.addon_id==='cap.seed.0').config_json.privateConfig,'updated-private');
  assert.ok(!(await pool.query("SELECT config_json::text AS text FROM user_addons WHERE user_id='cap-owner'")).rows.some(row=>row.text.includes('updated-private')));
  await assert.rejects(()=>secondProfiles.toggleUserAddon('cap-owner','cap.toggle-bypass',true),error=>error.status===409);
  await profiles.toggleUserAddon('cap-owner','player-pro',false);
  await secondProfiles.toggleUserAddon('cap-owner','player-pro',true);
  await profiles.toggleUserAddon('cap-owner','cap.seed.0',false);
  assert.equal(await capCount(),50,'Player preference and existing toggles remain usable at cap');
  await secondProfiles.installUserAddon('cap-other',{id:'cap.seed.0',privateConfig:'other-private'});
  assert.equal((await secondProfiles.getUserInstalledAddons('cap-other')).length,1,'another account has its own capacity');
  await profiles.uninstallUserAddon('cap-owner','cap.seed.48');
  assert.equal(await capCount(),49);
  await pool.query("CREATE FUNCTION reject_cap_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.addon_id='cap.fail' THEN RAISE EXCEPTION 'fixture insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_cap_fixture BEFORE INSERT ON user_addons FOR EACH ROW EXECUTE FUNCTION reject_cap_fixture()");
  await assert.rejects(()=>profiles.installUserAddon('cap-owner',{id:'cap.fail',privateConfig:'failed-private'}));
  assert.equal(await capCount(),49,'failed SQL insert leaves no row or slot residue');
  await pool.query('DROP TRIGGER reject_cap_fixture ON user_addons; DROP FUNCTION reject_cap_fixture()');
  await profiles.installUserAddon('cap-owner',{id:'cap.after-failure',privateConfig:'recovered'});
  assert.equal(await capCount(),50,'rollback releases account lock and permits recovery');
  await pool.query("DELETE FROM user_addons WHERE user_id IN ('cap-owner','cap-other'); DELETE FROM users WHERE id IN ('cap-owner','cap-other')");
  const manifest = { id: 'fixture.provider', capabilities: ['provider.server'], manifestUrl: 'https://provider.fixture.invalid/manifest', privateConfig: 'fixture-secret' };
  await profiles.installUserAddon('owner', manifest);
  const remoteReference = { id: 'remote-0123456789abcdef0123456789abcdef', kind: 'remote-manifest', manifestUrl: 'https://account-addon.example/manifest' };
  await profiles.installUserAddon('owner', remoteReference);
  const remoteStored = (await pool.query("SELECT config_json FROM user_addons WHERE user_id='owner' AND addon_id=$1", [remoteReference.id])).rows[0].config_json;
  assert.ok(!JSON.stringify(remoteStored).includes(remoteReference.manifestUrl), 'account manifest URL remains encrypted');
  assert.deepEqual(JSON.parse(JSON.stringify((await profiles.getUserInstalledAddons('owner')).find(addon => addon.addon_id === remoteReference.id).config_json)), remoteReference);
  await profiles.toggleUserAddon('owner', remoteReference.id, false);
  assert.equal((await profiles.getUserInstalledAddons('owner')).find(addon => addon.addon_id === remoteReference.id).enabled, false);
  await profiles.toggleUserAddon('owner', remoteReference.id, true);
  assert.equal((await profiles.getUserInstalledAddons('owner')).find(addon => addon.addon_id === remoteReference.id).enabled, true);
  await profiles.uninstallUserAddon('owner', remoteReference.id);
  assert.ok(!(await profiles.getUserInstalledAddons('owner')).some(addon => addon.addon_id === remoteReference.id));
  const returned = await profiles.updateUserProfile('owner', { settings: { preferredSubtitles: 'private-language', autoNextEpisode: true } });
  assert.equal(returned.id, 'owner', 'profile update returns the requested owner, not default/current session');
  const storedSettings = (await pool.query("SELECT settings_json FROM users WHERE id='owner'")).rows[0].settings_json;
  assert.equal(storedSettings._anirium_private, 1);
  assert.ok(!JSON.stringify(storedSettings).includes('private-language'));
  await Promise.all([
    profiles.updateUserProfile('owner', { settings: { preferredAudio: 'private-audio' } }),
    profiles.updateUserProfile('owner', { settings: { telemetryHud: true } }),
  ]);
  const merged = (await profiles.getAllProfiles()).find(profile => profile.id === 'owner');
  assert.equal(merged.settings.preferredSubtitles, 'private-language');
  assert.equal(merged.settings.preferredAudio, 'private-audio');
  assert.equal(merged.settings.telemetryHud, true, 'concurrent patches must preserve both updates');
  const snapshotSettings = (await pool.query("SELECT settings_json FROM users WHERE id='owner'")).rows[0].settings_json;
  await pool.query("UPDATE users SET settings_json=$1 WHERE id='other'", [JSON.stringify(snapshotSettings)]);
  await assert.rejects(() => profiles.getAllProfiles(), 'cross-owner settings envelope fails without default profiles');
  await assert.rejects(() => profiles.updateUserProfile('other', { display_name: 'must-not-write' }), 'corruption must prevent profile mutation');
  assert.equal((await pool.query("SELECT display_name FROM users WHERE id='other'")).rows[0].display_name, 'Other');
  await pool.query("UPDATE users SET settings_json=$1 WHERE id='other'",[JSON.stringify(lib.encryptPrivateJson({},lib.profileSettingsPrivateContext('other')))]);
  const googleInput = { googleId: 'private-fixture', email: 'private@example.invalid', name: 'Private fixture', avatarUrl: '' };
  const google = await profiles.upsertGoogleUserProfile(googleInput, 'private-google-session');
  assert.match(google.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(!google.id.includes(googleInput.googleId));
  const concurrentGoogle=await Promise.all(Array.from({length:6},(_,index)=>profiles.upsertGoogleUserProfile({...googleInput,googleId:'concurrent-google'},`concurrent-google-${index}`)));
  assert.equal(new Set(concurrentGoogle.map(profile=>profile.id)).size,1,'concurrent Google signup creates one internal account');
  assert.notEqual(concurrentGoogle[0].id,google.id);
  assert.match(google.username, /^user_[0-9a-f]{24}$/);
  assert.ok(!google.username.includes('private'), 'new public username must not expose email prefix');
  await profiles.updateUserProfile(google.id, { settings: { preferredSubtitles: 'preserved-google' } });
  const relogin = await profiles.upsertGoogleUserProfile({ ...googleInput, name: 'New display' }, 'private-google-next');
  assert.equal(relogin.id,google.id);
  const authSnapshot=async()=>plain({users:(await pool.query('SELECT * FROM users ORDER BY id')).rows,
    mappings:(await pool.query('SELECT * FROM external_identities ORDER BY provider,key_id,subject_hash')).rows,
    sessions:(await pool.query('SELECT * FROM active_session ORDER BY key')).rows});
  const googleIdentityCipher=(await pool.query('SELECT google_subject_private FROM users WHERE id=$1',[google.id])).rows[0].google_subject_private;
  assert.equal(googleIdentityCipher._anirium_private,1);assert.ok(!JSON.stringify(googleIdentityCipher).includes(googleInput.googleId));
  await pool.query('UPDATE external_identities SET user_id=$1 WHERE user_id=$2',[concurrentGoogle[0].id,google.id]);
  const tamperedMappingSnapshot=await authSnapshot();
  await assert.rejects(()=>profiles.upsertGoogleUserProfile(googleInput,'mapping-tampered-login'),/Identity binding mismatch/);
  assert.deepEqual(await authSnapshot(),tamperedMappingSnapshot,'mapping reassignment cannot log in to another encrypted identity');
  await pool.query('UPDATE external_identities SET user_id=$1 WHERE subject_hash=ANY($2::text[])',[google.id,load('identityLookup').googleIdentityLookups(googleInput.googleId).map(item=>item.hash)]);
  await pool.query('UPDATE users SET google_subject_private=NULL WHERE id=$1',[google.id]);
  const missingBindingSnapshot=await authSnapshot();
  await assert.rejects(()=>profiles.upsertGoogleUserProfile(googleInput,'missing-binding-login'),/Invalid encrypted identity/);
  assert.deepEqual(await authSnapshot(),missingBindingSnapshot,'missing subject on UUID cannot be silently backfilled from a mapping');
  await pool.query('UPDATE users SET google_subject_private=$1 WHERE id=$2',[JSON.stringify(googleIdentityCipher),google.id]);
  const beforeAuthFailure=await authSnapshot();
  await pool.query(`CREATE FUNCTION reject_auth_session() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.key='fail-login-session' THEN RAISE EXCEPTION 'fixture session failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER reject_auth_session BEFORE INSERT OR UPDATE ON active_session FOR EACH ROW EXECUTE FUNCTION reject_auth_session()');
  try {
    await assert.rejects(()=>profiles.upsertGoogleUserProfile({...googleInput,googleId:'atomic-new-google'},'fail-login-session'));
    assert.deepEqual(await authSnapshot(),beforeAuthFailure,'new account, mappings and profile roll back when session fails');
    await assert.rejects(()=>profiles.upsertGoogleUserProfile({...googleInput,name:'Must roll back'},'fail-login-session'));
    assert.deepEqual(await authSnapshot(),beforeAuthFailure,'existing encrypted profile and sessions remain unchanged after failure');
  } finally { await pool.query('DROP TRIGGER reject_auth_session ON active_session');await pool.query('DROP FUNCTION reject_auth_session()'); }
  const priorIdentity=beforeAuthFailure.users.find(row=>row.id===google.id).profile_private;
  await pool.query('UPDATE users SET profile_private=$1 WHERE id=$2',[JSON.stringify({...priorIdentity,tag:Buffer.alloc(16).toString('base64')}),google.id]);
  const beforeTamperedLogin=await authSnapshot();
  await assert.rejects(()=>profiles.upsertGoogleUserProfile(googleInput,'tampered-profile-login'));
  assert.deepEqual(await authSnapshot(),beforeTamperedLogin,'verified login cannot silently overwrite a tampered envelope or create a session');
  await pool.query('UPDATE users SET profile_private=$1 WHERE id=$2',[JSON.stringify(priorIdentity),google.id]);
  assert.equal(relogin.username, google.username, 're-login preserves the generated public pseudonym');
  assert.equal(relogin.settings.preferredSubtitles, 'preserved-google', 'Google re-login must preserve encrypted preferences');
  const raw = (await pool.query("SELECT config_json FROM user_addons WHERE user_id='owner' AND addon_id=$1", [manifest.id])).rows[0].config_json;
  assert.equal(raw._anirium_private, 1);
  assert.ok(!JSON.stringify(raw).includes(manifest.privateConfig));
  assert.deepEqual(plain((await profiles.getUserInstalledAddons('owner'))[0].config_json), manifest);
  await profiles.toggleUserAddon('owner', 'new-toggle', true);
  assert.equal((await pool.query("SELECT config_json FROM user_addons WHERE addon_id='new-toggle'")).rows[0].config_json._anirium_private, 1);
  await pool.query('INSERT INTO user_addons(user_id,addon_id,installed_at,config_json) VALUES ($1,$2,0,$3)', ['other', 'legacy', JSON.stringify(manifest)]);
  await assert.rejects(()=>profiles.getUserInstalledAddons('other'),'runtime refuses plaintext addon configuration before explicit migration');
  const client = await pool.connect();
  const run = async () => {
    let checkpoint = ['', ''], scanned = 0, changed = 0;
    for (;;) {
      const batch = await migration.migrateAddonPrivateBatch(client, checkpoint, 2);
      scanned += batch.scanned; changed += batch.changed; checkpoint = batch.checkpoint;
      if (batch.scanned === 0) return { scanned, changed };
    }
  };
  const migrateSettings = async () => {
    let checkpoint = '', changed = 0;
    for (;;) {
      const batch = await migration.migrateProfileSettingsBatch(client, checkpoint, 2);
      changed += batch.changed; checkpoint = batch.checkpoint;
      if (!batch.scanned) return changed;
    }
  };
  try {
    const privateProfiles = load('privateProfile');
    const identityBefore = (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    const originalIdentity = new Map(identityBefore.map(row => [row.id, plain(row.profile_private == null ? {displayName:row.display_name,avatarUrl:row.avatar_url??""} : privateProfiles.readProfile(row))]));
    const profileBatch = await migration.migratePrivateProfileBatch(client, '', 500);
    assert.equal(profileBatch.scanned, identityBefore.length);
    assert.equal((await migration.migratePrivateProfileBatch(client, '', 500)).changed, 0, 'private profile migration idempotent');
    let identityRows = (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    for (const row of identityRows) {
      assert.equal(row.display_name, 'Conta'); assert.equal(row.avatar_url, '');
      assert.deepEqual(plain(row.profile_private == null ? {displayName:row.display_name,avatarUrl:row.avatar_url??""} : privateProfiles.readProfile(row)), originalIdentity.get(row.id));
      assert.equal(row.profile_private._anirium_private, 1);
    }
    assert.equal(relogin.display_name, 'New display', 'OAuth returns decrypted profile');
    const ownerIdentity = identityRows.find(row => row.id === 'owner').profile_private;
    const otherIdentity = identityRows.find(row => row.id === 'other').profile_private;
    await pool.query("UPDATE users SET profile_private=$1 WHERE id='other'", [JSON.stringify(ownerIdentity)]);
    await assert.rejects(() => profiles.getAllProfiles(), 'profile owner AAD rejects swapped envelope');
    await pool.query("UPDATE users SET profile_private=$1 WHERE id='other'", [JSON.stringify(otherIdentity)]);
    save('next');
    await Promise.all([
      migration.migratePrivateProfileBatch(client, '', 500),
      profiles.updateUserProfile('owner', { display_name: 'Nome cifrado atualizado' }),
      profiles.updateUserProfile('owner', { settings: { autoNextEpisode: false } }),
    ]);
    const updatedIdentity = (await profiles.getAllProfiles()).find(row => row.id === 'owner');
    assert.equal(updatedIdentity.display_name, 'Nome cifrado atualizado');
    assert.equal(updatedIdentity.settings.autoNextEpisode, false);
    identityRows = (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    assert.ok(identityRows.every(row => row.profile_private.kid === 'next'));
    await pool.query("UPDATE users SET profile_private=$1 WHERE id='other'", [JSON.stringify(identityRows.find(row => row.id === 'owner').profile_private)]);
    save('old');
    await assert.rejects(() => migration.migratePrivateProfileBatch(client, '', 500));
    assert.equal((await pool.query('SELECT profile_private FROM users WHERE id=$1', [google.id])).rows[0].profile_private.kid, 'next', 'failed profile batch rolls back prior rekeys');
    for (const row of identityRows) await pool.query('UPDATE users SET profile_private=$1 WHERE id=$2', [JSON.stringify(row.profile_private), row.id]);
    assert.equal((await profiles.getAllProfiles()).find(row => row.id === 'owner').display_name, 'Nome cifrado atualizado', 'encrypted identity restore retains historical keys');
    await pool.query("UPDATE users SET settings_json='{}'::jsonb WHERE id='other'");
    await assert.rejects(()=>profiles.getAllProfiles(),'plaintext settings require explicit migration before current profile reads');
    assert.equal(await migrateSettings(), 2, 'legacy settings migrated and concurrently updated settings rekeyed');
    assert.equal(await migrateSettings(), 0);
    const settingsBackupFile = join(temporary, 'encrypted-settings-backup.json');
    fs.writeFileSync(settingsBackupFile, JSON.stringify((await pool.query('SELECT id,settings_json FROM users ORDER BY id')).rows), { mode: 0o600 });
    assert.ok(!fs.readFileSync(settingsBackupFile, 'utf8').includes('private-language'));
    assert.equal((await run()).changed, 1, 'legacy migrated once');
    assert.equal((await run()).changed, 0, 'migration idempotent');
    const backup = (await pool.query('SELECT * FROM user_addons ORDER BY user_id,addon_id')).rows;
    const backupFile = join(temporary, 'encrypted-backup.json');
    fs.writeFileSync(backupFile, JSON.stringify(backup), { mode: 0o600 });
    assert.ok(!fs.readFileSync(backupFile, 'utf8').includes(manifest.privateConfig));
    save('next');
    await Promise.all([
      migration.migrateProfileSettingsBatch(client, '', 500),
      profiles.updateUserProfile('owner', { settings: { autoSkipIntro: true } }),
    ]);
    assert.equal((await profiles.getAllProfiles()).find(profile => profile.id === 'owner').settings.autoSkipIntro, true, 'migration racing a profile patch must not lose the patch');
    assert.equal(await migrateSettings(), 0, 'race batch rotated profile keys');
    assert.equal(await migrateSettings(), 0);
    const profileBeforeFailure = (await pool.query('SELECT id,settings_json FROM users ORDER BY id')).rows;
    await pool.query("UPDATE users SET settings_json=$1 WHERE id='other'", [JSON.stringify(profileBeforeFailure.find(row => row.id === 'owner').settings_json)]);
    save('old');
    await assert.rejects(() => migration.migrateProfileSettingsBatch(client, '', 500));
    assert.equal((await pool.query('SELECT settings_json FROM users WHERE id=$1', [google.id])).rows[0].settings_json.kid, 'next', 'profile batch must roll back earlier rekey writes');
    await pool.query("UPDATE users SET settings_json=$1 WHERE id='other'", [JSON.stringify(profileBeforeFailure.find(row => row.id === 'other').settings_json)]);
    save('next');
    assert.equal((await run()).changed, 3, 'all envelopes rotated to active key');
    assert.equal((await run()).changed, 0);
    const before = JSON.stringify((await pool.query('SELECT * FROM user_addons ORDER BY user_id,addon_id')).rows);
    const corrupted = { ...raw, tag: Buffer.alloc(16).toString('base64') };
    await pool.query("UPDATE user_addons SET config_json=$1 WHERE user_id='other'", [JSON.stringify(corrupted)]);
    await assert.rejects(() => profiles.getUserInstalledAddons('other'), 'authentication failure cannot produce a successful empty addon list');
    save('old');
    await assert.rejects(() => migration.migrateAddonPrivateBatch(client, ['', ''], 500));
    const ownerRows = (await pool.query("SELECT config_json FROM user_addons WHERE user_id='owner'")).rows;
    assert.ok(ownerRows.every(row => row.config_json.kid === 'next'), 'failed batch rolled back earlier rows');
    await pool.query('DELETE FROM user_addons');
    for (const row of JSON.parse(fs.readFileSync(backupFile, 'utf8'))) {
      await pool.query('INSERT INTO user_addons(user_id,addon_id,enabled,installed_at,config_json) VALUES($1,$2,$3,$4,$5)', [row.user_id,row.addon_id,row.enabled,row.installed_at,JSON.stringify(row.config_json)]);
    }
    env.ANIRIUM_PRIVATE_DATA_STRICT = '1';
    for (const row of JSON.parse(fs.readFileSync(settingsBackupFile, 'utf8'))) await pool.query('UPDATE users SET settings_json=$1 WHERE id=$2', [JSON.stringify(row.settings_json),row.id]);
    assert.equal((await profiles.getAllProfiles()).find(profile => profile.id === 'owner').settings.preferredAudio, 'private-audio', 'encrypted preferences restored with historical key');
    assert.deepEqual(plain((await profiles.getUserInstalledAddons('owner')).find(row => row.addon_id === manifest.id).config_json), manifest, 'encrypted backup restored with historical key');
    assert.deepEqual(plain((await profiles.getUserInstalledAddons('other'))[0].config_json), manifest);
    assert.notEqual(before, '', 'fixture snapshot existed');
  } finally { client.release(); }
  delete env.ANIRIUM_PRIVATE_DATA_STRICT;
  const activity = load('privateActivity');
  save('old');
  await pool.query("UPDATE users SET level_tier=2 WHERE id='owner'");
  await pool.query("INSERT INTO users(id,username,display_name,created_at,level_tier) VALUES('progress-link','progress-link','Progress',0,2)");
  await assert.rejects(profiles.saveWatchProgress('progress-link',release.mal_id,0,1,15,100,seasonA.id),e=>e.status===409);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='progress-link'")).rows[0].n,0,'stale release guard runs before any private write');
  await profiles.saveWatchProgress('progress-link',release.mal_id,0,1,15,100,releaseRow.composition_season_id);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='progress-link' AND entity_type='EPISODE' AND canonical_entity_id IS NOT NULL")).rows[0].n,1,'matching source season accepted by actual progress writer');
  await pool.query("DELETE FROM users WHERE id='progress-link'");
  const canonicalFixture={mal_id:880001,idAnilist:880001,title:'Canonical progress',images:{},genres:[],sourceNodes:[{namespace:'anilist:media',id:'880001',type:'ANIME',format:'TV',episodes:2}],sourceRelations:[],episodes:2};
  await catalogContext.saveAnimesToCatalog([canonicalFixture],'fixture');
  const canonicalCatalog=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=880001')).rows[0];
  await pool.query("INSERT INTO users(id,username,display_name,created_at,level_tier) VALUES('canonical-progress','canonical-progress','Canonical',0,2)");
  await profiles.saveWatchProgress('canonical-progress',880001,0,1,20,100,canonicalCatalog.composition_season_id);
  const canonicalEpisodeBefore=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='canonical-progress' AND entity_type='EPISODE'")).rows[0];
  await seedHistoricalActivity('canonical-progress','EPISODE','880001:s0:e1',{parentSeriesId:880001,seasonIdx:0,episodeNumber:1},{watched_seconds:19,total_seconds:100});
  await pool.query("UPDATE user_entity_status SET updated_at=TIMESTAMPTZ '1970-01-01' WHERE user_id='canonical-progress' AND entity_id='880001:s0:e1'");
  await pool.query('UPDATE anime_catalog SET seasons_json=$1 WHERE mal_id=880001',[JSON.stringify([{id:999999},{id:880001}])]);
  await profiles.saveWatchProgress('canonical-progress',880001,1,1,45,100,canonicalCatalog.composition_season_id);
  const canonicalEpisodeAfter=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='canonical-progress' AND entity_type='EPISODE' AND entity_id=$1",[canonicalEpisodeBefore.entity_id])).rows[0];
  assert.equal(canonicalEpisodeAfter.id,canonicalEpisodeBefore.id,'canonical progress survives changed display season index');
  assert.equal(load('privateActivity').projectActivity(canonicalEpisodeAfter).watched_seconds,45);
  const canonicalResume=(await profiles.getWatchHistory('canonical-progress'))[0];
  assert.equal((await profiles.getWatchHistory('canonical-progress')).length,1,'old alias and canonical row show one latest episode');
  assert.equal(canonicalResume.seasonIdx,1,'actual history reader derives current season position after reorder');
  assert.equal(canonicalResume.seasonEntityId,canonicalCatalog.composition_season_id);
  assert.equal(canonicalResume.canonicalEntityId,canonicalEpisodeAfter.canonical_entity_id);
  assert.equal(canonicalResume.resumeAvailable,true);
  await pool.query('UPDATE user_entity_status SET parent_series_id=2147483000,episode_number=99,season_idx=99 WHERE id=$1',[canonicalEpisodeAfter.id]);
  const staleResume=(await profiles.getWatchHistory('canonical-progress'))[0];
  assert.equal(staleResume.animeId,880001);
  assert.equal(staleResume.episodeNumber,1);
  assert.equal(staleResume.seasonIdx,1);
  assert.equal(staleResume.resumeAvailable,true);
  assert.equal(staleResume.progressSeconds,45);
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE id=$1',[canonicalEpisodeAfter.id])).rows[0].activity_private,canonicalEpisodeAfter.activity_private);
  await pool.query("UPDATE user_entity_status SET updated_at=TIMESTAMPTZ '1969-12-31' WHERE user_id='canonical-progress' AND entity_id='880001:s0:e1'");
  await pool.query("UPDATE user_entity_status SET updated_at=TIMESTAMPTZ '1970-01-01' WHERE id=$1",[canonicalEpisodeAfter.id]);
  assert.equal((await profiles.getWatchHistory('canonical-progress'))[0].updatedAt,0,'history preserves actual epoch zero');
  await pool.query('UPDATE user_entity_status SET updated_at=NULL WHERE id=$1',[canonicalEpisodeAfter.id]);
  assert.equal((await profiles.getWatchHistory('canonical-progress'))[0].updatedAt,null,'unknown activity date is not replaced with now');
  await pool.query('UPDATE user_entity_status SET parent_series_id=880001,episode_number=1,season_idx=0,updated_at=$2 WHERE id=$1',[canonicalEpisodeAfter.id,canonicalEpisodeAfter.updated_at]);
  await seedHistoricalActivity('canonical-progress','EPISODE','unbound-resume-fixture',{}, {watched_seconds:80,total_seconds:100});
  assert.equal((await profiles.getWatchHistory('canonical-progress')).length,1,'unbound history does not enter the current contract');
  await pool.query("DELETE FROM user_entity_status WHERE user_id='canonical-progress' AND entity_id='unbound-resume-fixture'");
  const entityReader=load('entityActivityReader');
  await assert.rejects(entityReader.getEntityActivity('canonical-progress','EPISODE','880001:s0:e1'),e=>e.status===400);
  assert.equal((await entityReader.getEntityActivity('canonical-progress','EPISODE',canonicalEpisodeAfter.entity_id)).watched_seconds,45);
  assert.equal(await entityReader.getEntityActivity('other','EPISODE',canonicalEpisodeAfter.entity_id),null,'entity reader never reads another account activity');
  const beforeReadonly=(await pool.query('SELECT count(*)::int AS n FROM canonical_entities')).rows[0].n;
  await assert.rejects(entityReader.getEntityActivity('canonical-progress','EPISODE','880001:s1:e777'),e=>e.status===400);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM canonical_entities')).rows[0].n,beforeReadonly,'reading absent episode never creates a canonical entity');
  await pool.query('UPDATE anime_catalog SET seasons_json=$1 WHERE mal_id=880001',[JSON.stringify([{id:999999}])]);
  assert.equal((await profiles.getWatchHistory('canonical-progress'))[0].resumeAvailable,false,'history never guesses a position when canonical release is absent');
  assert.equal((await profiles.getWatchHistory('canonical-progress'))[0].seasonIdx,null,'unknown season position remains null');
  await pool.query('UPDATE anime_catalog SET seasons_json=$1 WHERE mal_id=880001',[JSON.stringify([{id:999999},{id:880001}])]);
  await pool.query(`CREATE FUNCTION fail_canonical_progress_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='canonical-progress' AND NEW.entity_type='SEASON' THEN RAISE EXCEPTION 'fixture canonical parent failed'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER fail_canonical_progress_parent BEFORE UPDATE ON user_entity_status FOR EACH ROW EXECUTE FUNCTION fail_canonical_progress_parent()');
  await assert.rejects(profiles.saveWatchProgress('canonical-progress',880001,1,3,90,100,canonicalCatalog.composition_season_id),/Failed to persist watch progress/);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='canonical-progress' AND entity_type='EPISODE'")).rows[0].n,2,'canonical cascade failure rolls back newly inserted episode');
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE id=$1',[canonicalEpisodeAfter.id])).rows[0].activity_private,canonicalEpisodeAfter.activity_private);
  await pool.query('DROP TRIGGER fail_canonical_progress_parent ON user_entity_status');
  await pool.query('DROP FUNCTION fail_canonical_progress_parent()');
  await profiles.saveWatchProgress('canonical-progress',880001,1,1,100,100,canonicalCatalog.composition_season_id);
  await profiles.saveWatchProgress('canonical-progress',880001,1,2,100,100,canonicalCatalog.composition_season_id);
  assert.equal((await profiles.getWatchHistory('canonical-progress')).length,0,'new completed canonical state suppresses stale incomplete alias');
  const canonicalParents=(await pool.query("SELECT entity_type,completed FROM user_entity_status WHERE user_id='canonical-progress' AND entity_type <> 'EPISODE'")).rows;
  assert.equal(canonicalParents.length,3);assert.ok(canonicalParents.every(row=>row.completed===true),'known complete episodes cascade through season/work/universe');
  await profiles.saveWatchProgress('canonical-progress',880001,1,1,10,100,canonicalCatalog.composition_season_id);
  assert.ok((await pool.query("SELECT completed FROM user_entity_status WHERE user_id='canonical-progress'")).rows.filter(row=>row.completed===false).length>=4,'reopened episode reopens canonical parents');
  await Promise.all([profiles.saveWatchProgress('canonical-progress',880001,1,1,100,100,canonicalCatalog.composition_season_id),profiles.saveWatchProgress('canonical-progress',880001,1,2,100,100,canonicalCatalog.composition_season_id)]);
  assert.ok((await pool.query("SELECT completed FROM user_entity_status WHERE user_id='canonical-progress' AND entity_id<>'880001:s0:e1'")).rows.every(row=>row.completed===true),'concurrent canonical episodes serialize into coherent complete hierarchy');
  await catalogContext.saveAnimesToCatalog([{...canonicalFixture,sourceNodes:[{...canonicalFixture.sourceNodes[0],episodes:null}]}],'fixture');
  await profiles.saveWatchProgress('canonical-progress',880001,0,1,100,100,canonicalCatalog.composition_season_id);
  assert.equal((await pool.query("SELECT completed FROM user_entity_status WHERE user_id='canonical-progress' AND entity_type='SEASON'")).rows[0].completed,false,'unknown count cannot complete canonical season');
  await pool.query("DELETE FROM users WHERE id='canonical-progress'");
  await pool.query("INSERT INTO users(id,username,display_name,created_at,level_tier) VALUES('progress-inherit','progress-inherit','Inherit',0,2)");
  await seedHistoricalActivity('progress-inherit','EPISODE','880001:s0:e1',{parentSeriesId:880001,seasonIdx:0,episodeNumber:1,containsSpoilers:true},{watched_seconds:20,total_seconds:100,user_score:7.5,user_opinion:'Existing private opinion',audio_track_used:'Existing audio'});
  await pool.query("UPDATE user_entity_status SET is_favorite=TRUE WHERE user_id='progress-inherit'");
  const originalPrivate=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='progress-inherit'")).rows[0];
  await profiles.saveWatchProgress('progress-inherit',880001,0,1,35,100,canonicalCatalog.composition_season_id);
  const inheritedRow=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='progress-inherit' AND canonical_entity_id=$1",[originalPrivate.canonical_entity_id])).rows[0];
  assert.equal(inheritedRow.id,originalPrivate.id,'canonical progress updates existing linked record');
  assert.equal(inheritedRow.entity_id,originalPrivate.entity_id,'canonical update preserves original AAD identity');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='progress-inherit' AND entity_type='EPISODE'")).rows[0].n,1);
  const inheritedData=load('privateActivity').projectActivity(inheritedRow);
  assert.equal(inheritedData.user_score,7.5);assert.equal(inheritedData.user_opinion,'Existing private opinion');assert.equal(inheritedData.audio_track_used,'Existing audio');
  assert.equal(inheritedData.watched_seconds,35);assert.equal(inheritedRow.is_favorite,true);assert.equal(inheritedRow.contains_spoilers,true);
  assert.equal((await profiles.getBookmarkItems('progress-inherit')).length,1,'latest canonical episode favorite hides duplicate legacy favorite');
  const canonicalPage=await load('entityStatusPage').getEntityStatusPage('progress-inherit',{entityType:'EPISODE',limit:20,time:null,id:null});
  assert.equal(canonicalPage.statuses.length,1,'status page deduplicates aliases before paging');
  assert.equal(canonicalPage.statuses[0].entity_id,inheritedRow.canonical_entity_id);
  assert.equal(canonicalPage.statuses[0].user_score,7.5);assert.equal(canonicalPage.statuses[0].user_opinion,'Existing private opinion');
  const seasonProgressReader=load('seasonProgressReader');
  const selectedProgress=await seasonProgressReader.getSeasonProgress('progress-inherit',880001,7,canonicalCatalog.composition_season_id);
  assert.equal(selectedProgress.length,1);assert.equal(selectedProgress[0].watchedSeconds,35);assert.equal(selectedProgress[0].number,1);assert.equal(selectedProgress[0].userScore,7.5);
  assert.equal((await seasonProgressReader.getSeasonProgress('other',880001,0,canonicalCatalog.composition_season_id)).length,0,'season progress read isolates account');
  await assert.rejects(()=>seasonProgressReader.getSeasonProgress('progress-inherit',880001,0,seasonA.id),e=>e.status===409);
  assert.notDeepEqual(inheritedRow.activity_private,originalPrivate.activity_private,'progress update replaces the encrypted payload on the original record');
  assert.throws(()=>load('privateActivity').readActivity({...inheritedRow,entity_id:inheritedRow.canonical_entity_id}),'updated payload remains authenticated to original physical identity');
  await load('privateActivity').writeActivity('progress-inherit','EPISODE',inheritedRow.canonical_entity_id,{}, {user_score:null,user_opinion:null});
  await pool.query('UPDATE user_entity_status SET is_favorite=FALSE WHERE id=$1',[inheritedRow.id]);
  await profiles.saveWatchProgress('progress-inherit',880001,0,1,55,100,canonicalCatalog.composition_season_id);
  const afterClear=(await pool.query('SELECT * FROM user_entity_status WHERE id=$1',[inheritedRow.id])).rows[0];
  assert.equal(load('privateActivity').projectActivity(afterClear).user_opinion,null);assert.equal(load('privateActivity').projectActivity(afterClear).user_score,null);assert.equal(afterClear.is_favorite,false,'subsequent progress never resurrects cleared legacy fields');
  assert.equal((await profiles.getBookmarkItems('progress-inherit')).length,0,'removed canonical favorite is not resurrected by old alias');
  assert.equal((await pool.query('SELECT is_favorite FROM user_entity_status WHERE id=$1',[originalPrivate.id])).rows[0].is_favorite,false,'reused record retains explicit favorite removal');
  await load('privateActivity').writeActivity('progress-inherit','EPISODE',inheritedRow.canonical_entity_id,{}, {user_score:0});
  assert.equal((await seasonProgressReader.getSeasonProgress('progress-inherit',880001,0,canonicalCatalog.composition_season_id))[0].userScore,0,'season progress preserves score zero');
  await pool.query("DELETE FROM users WHERE id='progress-inherit'");
  await pool.query('DELETE FROM anime_catalog WHERE mal_id=880001');
  console.log('Canonical playback progress: actual writer preserves episode identity under reorder, cascades known completion, reopens parents and refuses completion for unknown count.');
  await pool.query("INSERT INTO users(id,username,display_name,created_at,level_tier) VALUES ('bookmark-canonical','bookmark-canonical','Bookmark',0,2)");
  await pool.query("UPDATE users SET profile_private=$1 WHERE id='bookmark-canonical'",[JSON.stringify(load('privateProfile').encodeProfile('bookmark-canonical','Bookmark',''))]);
  const arcAccountActivity=load('privateActivity'),arcAccountReader=load('entityActivityReader'),arcAccountPages=load('entityStatusPage');
  const arcAccountText={field:'title',locale:'pt-br',form:'default',sourceKey:'anirium:editorial',value:'Arco próprio da base'};
  await database.withTransaction(client=>contentInfo.setContentEntityTexts(client,arcFixture.arc.id,[arcAccountText]));
  await arcAccountActivity.writeActivity('bookmark-canonical','ARC',arcFixture.arc.id,{status:'on_hold',completed:false,containsSpoilers:false},{user_score:0,user_opinion:'Opinião privada sobre o arco'});
  assert.equal(await arcAccountReader.getEntityActivity('other','ARC',arcFixture.arc.id),null);
  await arcAccountActivity.writeActivity('other','ARC',arcFixture.arc.id,{status:'completed',completed:true},{user_score:8,user_opinion:'Outra opinião privada'});
  const arcOwned=await arcAccountReader.getEntityActivity('bookmark-canonical','ARC',arcFixture.arc.id);
  assert.equal(arcOwned.user_score,0);assert.equal(arcOwned.completed,false);assert.equal(arcOwned.status,'on_hold');
  assert.equal((await arcAccountReader.getEntityActivity('other','ARC',arcFixture.arc.id)).user_score,8);
  const arcRaw=()=>pool.query("SELECT * FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type='ARC' AND canonical_entity_id=$1",[arcFixture.arc.id]).then(result=>result.rows[0]);
  const arcBeforeFavorite=await arcRaw();
  assert.equal(arcBeforeFavorite.user_opinion,null,'private opinion is not copied into plaintext catalog/account fields');
  assert.throws(()=>arcAccountActivity.readActivity({...arcBeforeFavorite,user_id:'other'}));
  await assert.rejects(()=>arcAccountActivity.writeActivity('bookmark-canonical','ARC',arcFixture.arc.id,{completed:'true'},{}),/activity boolean/);
  await assert.rejects(()=>arcAccountActivity.writeActivity('bookmark-canonical','ARC',arcFixture.arc.id,{containsSpoilers:0},{}),/activity boolean/);
  await assert.rejects(()=>arcAccountActivity.writeActivity('bookmark-canonical','ARC',arcFixture.arc.id,{episodeNumber:1},{}),error=>error.status===400);
  await assert.rejects(()=>profiles.toggleEntityBookmark('bookmark-canonical','ARC',arcFixture.arc.id,123),error=>error.status===400);
  assert.throws(()=>load('apiInput').validateCanonicalEntityStatusInput({entityType:'ARC',entityId:arcFixture.arc.id,seasonIdx:0}),error=>error.status===400);
  await assert.rejects(()=>arcAccountActivity.writeActivity('bookmark-canonical','ARC',arcFixture.work.id,{},{}),error=>error.status===400);
  await assert.rejects(()=>arcAccountReader.getEntityActivity('bookmark-canonical','ARC','old-arc-alias'),error=>error.status===400);
  const privateAccountArc=await database.withTransaction(client=>index.ensureEntity({namespace:'arc-account-private',value:crypto.randomUUID(),sourceKey:'fixture'},{kind:'ARC',ownerId:'other'},client));
  await assert.rejects(()=>profiles.toggleEntityBookmark('bookmark-canonical','ARC',privateAccountArc.id),error=>error.status===400);
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','ARC',arcFixture.arc.id),true);
  const arcToggles=await Promise.all([1,2].map(()=>profiles.toggleEntityBookmark('bookmark-canonical','ARC',arcFixture.arc.id)));
  assert.deepEqual(arcToggles.sort(),[false,true]);
  assert.deepEqual((await arcRaw()).activity_private,arcBeforeFavorite.activity_private);
  assert.equal((await profiles.getBookmarkItems('bookmark-canonical','ARC'))[0].animeTitle,arcAccountText.value);
  assert.equal((await profiles.getBookmarkItems('other','ARC')).length,0);
  const arcPageInput=arcAccountPages.readEntityStatusPageInput(new URLSearchParams({entity_type:'ARC',limit:'20'}));
  const arcStatus=(await arcAccountPages.getEntityStatusPage('bookmark-canonical',arcPageInput)).statuses[0];
  assert.equal(arcStatus.entity_id,arcFixture.arc.id);assert.equal(arcStatus.user_score,0);assert.equal(arcStatus.anime_title_portuguese,arcAccountText.value);
  assert.equal(arcStatus.parent_series_id,null,'arc classification never invents catalog navigation');
  assert.equal((await arcAccountPages.getEntityStatusPage('other',arcPageInput)).statuses[0].user_opinion,'Outra opinião privada');
  await database.withTransaction(client=>contentInfo.setContentEntityTexts(client,arcFixture.arc.id,[{...arcAccountText,value:'Arco atualizado na fonte única'}]));
  assert.equal((await profiles.getBookmarkItems('bookmark-canonical','ARC'))[0].animeTitle,'Arco atualizado na fonte única');
  assert.equal((await arcAccountPages.getEntityStatusPage('bookmark-canonical',arcPageInput)).statuses[0].anime_title_portuguese,'Arco atualizado na fonte única');
  await assert.rejects(()=>pool.query('UPDATE user_entity_status SET canonical_entity_id=$2::text,entity_id=$2::text WHERE id=$1',[arcBeforeFavorite.id,arcFixture.work.id]),/foreign key/);
  for(const mutation of ['canonical_entity_id=NULL','parent_series_id=1','season_idx=0','episode_number=1','completed=NULL',"status='invalid'"])
    await assert.rejects(()=>pool.query(`UPDATE user_entity_status SET ${mutation} WHERE id=$1`,[arcBeforeFavorite.id]),/activity_arc_scope/);
  await assert.rejects(()=>pool.query("INSERT INTO user_entity_status(user_id,entity_type,entity_id,canonical_entity_id,status,activity_private) SELECT user_id,entity_type,entity_id,canonical_entity_id,status,activity_private FROM user_entity_status WHERE id=$1",[arcBeforeFavorite.id]),/unique constraint/);
  const arcOtherClass=await database.withTransaction(client=>arcs.registerArc(client,arcFixture.universe.id,{namespace:'arc-account-test',value:crypto.randomUUID(),sourceKey:'fixture'}));
  await assert.rejects(()=>database.withTransaction(async client=>{
    await arcAccountActivity.writeActivity('bookmark-canonical','ARC',arcOtherClass.id,{}, {user_score:1},client);
    throw new Error('arc account downstream failure');
  }),/downstream failure/);
  assert.equal(await arcAccountReader.getEntityActivity('bookmark-canonical','ARC',arcOtherClass.id),null);
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','ARC',arcOtherClass.id),true,'favorite creates a directly bound ARC state');
  assert.equal((await arcAccountReader.getEntityActivity('bookmark-canonical','ARC',arcOtherClass.id)).is_favorite,true);
  await profiles.removeEntityBookmark('bookmark-canonical','ARC',arcOtherClass.id);
  await pool.query("DELETE FROM user_entity_status WHERE user_id='bookmark-canonical' AND canonical_entity_id=$1",[arcOtherClass.id]);
  const arcComments=load('entityCommentWriter'),arcCommentPages=load('entityCommentPage');
  const arcRoot=await arcComments.insertEntityComment('bookmark-canonical',{entityType:'ARC',entityId:arcFixture.arc.id,content:'Discussão pública do arco',isSpoiler:false});
  const arcReply=await arcComments.insertEntityComment('other',{entityType:'ARC',entityId:arcFixture.arc.id,parentCommentId:arcRoot.id,content:'Resposta no mesmo arco',isSpoiler:true});
  const otherArcRoot=await arcComments.insertEntityComment('other',{entityType:'ARC',entityId:arcOtherClass.id,content:'Discussão de outro arco'});
  await assert.rejects(()=>pool.query('UPDATE entity_comments SET parent_comment_id=$2 WHERE id=$1',[arcRoot.id,otherArcRoot.id]),/foreign key/);
  await pool.query('DELETE FROM entity_comments WHERE id=$1',[otherArcRoot.id]);
  for(const mutation of ['canonical_entity_id=NULL','parent_series_id=1','episode_number=1','is_spoiler=NULL'])
    await assert.rejects(()=>pool.query(`UPDATE entity_comments SET ${mutation} WHERE id=$1`,[arcRoot.id]),/comment_arc_scope/);
  await assert.rejects(()=>arcComments.insertEntityComment('other',{entityType:'ARC',entityId:arcOtherClass.id,parentCommentId:arcRoot.id,content:'Outro arco'}),error=>error.status===400);
  const arcCommentInput=arcCommentPages.readEntityCommentPageInput(new URLSearchParams({entity_type:'ARC',entity_id:arcFixture.arc.id,limit:'1'}));
  const arcCommentFirst=await arcCommentPages.getEntityCommentPage(arcCommentInput);
  assert.equal(arcCommentFirst.comments[0].id,arcRoot.id);assert.equal(arcCommentFirst.comments[0].is_spoiler,false);
  const arcCommentSecond=await arcCommentPages.getEntityCommentPage(arcCommentPages.readEntityCommentPageInput(new URLSearchParams({entity_type:'ARC',entity_id:arcFixture.arc.id,limit:'1',cursor:arcCommentFirst.nextCommentCursor})));
  assert.equal(arcCommentSecond.comments[0].id,arcReply.id);assert.equal(arcCommentSecond.comments[0].is_spoiler,true);
  for(let repeat=0;repeat<2;repeat++)await profiles.removeEntityBookmark('bookmark-canonical','ARC',arcFixture.arc.id);
  assert.equal((await profiles.getBookmarkItems('bookmark-canonical','ARC')).length,0);
  assert.deepEqual((await arcRaw()).activity_private,arcBeforeFavorite.activity_private);
  assert.equal((await arcAccountReader.getEntityActivity('bookmark-canonical','ARC',arcFixture.arc.id)).user_opinion,'Opinião privada sobre o arco');
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','UNIVERSE',arcFixture.universe.id),true);
  const ownUniverseFavorite=(await profiles.getBookmarkItems('bookmark-canonical','UNIVERSE'))[0];
  assert.equal(ownUniverseFavorite.animeTitle,textVariant.value,'universe reads its own full title instead of inventing a label from UUID');
  const ownUniverseStatuses=await arcAccountPages.getEntityStatusPage('bookmark-canonical',{entityType:'UNIVERSE',limit:20,time:null,id:null});
  assert.equal(ownUniverseStatuses.statuses[0].anime_title_portuguese,textVariant.value);
  await profiles.removeEntityBookmark('bookmark-canonical','UNIVERSE',arcFixture.universe.id);
  await pool.query("DELETE FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type='UNIVERSE' AND canonical_entity_id=$1",[arcFixture.universe.id]);
  await pool.query('DELETE FROM entity_comments WHERE id=$1',[arcReply.id]);
  await pool.query('DELETE FROM entity_comments WHERE id=$1',[arcRoot.id]);
  await pool.query("DELETE FROM user_entity_status WHERE user_id IN ('other','bookmark-canonical') AND entity_type='ARC' AND canonical_entity_id=$1",[arcFixture.arc.id]);
  console.log('Account ARC native PostgreSQL: shared canonical identity, independent encrypted states, typed booleans/zero, owner AAD, concurrent favorite/removal preservation, own title single-source update, SQL wrong-kind/private rejection, downstream rollback and public same-arc comment paging passed.');
  const bookmarkId=`${release.mal_id}:s0:e1`;
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','SERIES',releaseRow.composition_work_id),true);
  assert.equal((await pool.query("SELECT canonical_entity_id FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_id=$1",[releaseRow.composition_work_id])).rows[0].canonical_entity_id,releaseRow.composition_work_id,'canonical work favorite uses stable public work ID');
  assert.ok((await profiles.getUserBookmarks('bookmark-canonical',true)).includes(release.mal_id),'UUID work favorite resolves indexed catalog navigation without numeric entity_id');
  const workBookmarkBefore=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_id=$1",[releaseRow.composition_work_id])).rows[0];
  await pool.query('UPDATE user_entity_status SET parent_series_id=2147483000 WHERE id=$1',[workBookmarkBefore.id]);
  assert.ok((await profiles.getUserBookmarks('bookmark-canonical',true)).includes(release.mal_id),'stale parent route cannot hide canonical work favorite');
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE id=$1',[workBookmarkBefore.id])).rows[0].activity_private,workBookmarkBefore.activity_private,'navigation reader preserves private envelope');
  assert.equal((await profiles.getUserBookmarks('other',true)).includes(release.mal_id),false,'canonical favorite navigation remains owner scoped');
  await profiles.toggleEntityBookmark('bookmark-canonical','SERIES',releaseRow.composition_work_id);
  assert.equal((await profiles.getUserBookmarks('bookmark-canonical',true)).includes(release.mal_id),false,'unfavorite disappears from canonical navigation');
  await seedHistoricalActivity('bookmark-canonical','EPISODE',bookmarkId,{parentSeriesId:release.mal_id,seasonIdx:0,episodeNumber:1},{});
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',releaseRow.composition_season_id,release.mal_id,0,1,releaseRow.composition_season_id),true);
  await seedHistoricalActivity('bookmark-canonical','EPISODE',bookmarkId,{}, {user_score:0,user_opinion:'Private favorite opinion'});
  const bookmarkBefore=(await pool.query('SELECT * FROM user_entity_status WHERE user_id=$1 AND entity_id=$2',['bookmark-canonical',bookmarkId])).rows[0];
  assert.equal(typeof bookmarkBefore.canonical_entity_id,'string');
  const toggleResults=await Promise.all([profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',bookmarkBefore.canonical_entity_id,release.mal_id,0,1),profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',bookmarkBefore.canonical_entity_id,release.mal_id,0,1)]);
  assert.deepEqual(toggleResults.sort(),[false,true]);
  const bookmarkAfter=(await pool.query('SELECT * FROM user_entity_status WHERE user_id=$1 AND entity_id=$2',['bookmark-canonical',bookmarkId])).rows[0];
  assert.equal(bookmarkAfter.is_favorite,true,'two concurrent toggles preserve initial favorite state');
  assert.equal(bookmarkAfter.canonical_entity_id,bookmarkBefore.canonical_entity_id);
  assert.deepEqual(bookmarkAfter.activity_private,bookmarkBefore.activity_private,'favorite updates preserve private activity ciphertext');
  assert.equal((await profiles.getBookmarkItems('bookmark-canonical'))[0].canonicalEntityId,bookmarkBefore.canonical_entity_id,'actual bookmark reader exposes bound canonical ID');
  const beforeReorderCipher=bookmarkAfter.activity_private;
  const originalBookmarkSeasons=(await pool.query('SELECT seasons_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].seasons_json;
  await pool.query('UPDATE anime_catalog SET seasons_json=$2::jsonb WHERE mal_id=$1',[release.mal_id,JSON.stringify([{id:222},{id:release.idAnilist}])]);
  const bookmarkIdentity=load('bookmarkIdentity');
  const beforeReorderItems=await profiles.getBookmarkItems('bookmark-canonical');
  assert.equal(beforeReorderItems[0].seasonIdx,1,'bookmark reader projects current season position from stable identity');
  assert.equal(beforeReorderItems[0].score,0);
  const reorderedStatusPage=await load('entityStatusPage').getEntityStatusPage('bookmark-canonical',{entityType:'EPISODE',limit:20,time:null,id:null});
  assert.equal(reorderedStatusPage.statuses[0].season_idx,1,'status playback projection follows stable release after reorder');
  assert.equal(reorderedStatusPage.statuses[0].user_opinion,'Private favorite opinion');
  await pool.query('UPDATE user_entity_status SET parent_series_id=2147483000,episode_number=99 WHERE id=$1',[bookmarkAfter.id]);
  const staleEpisodePage=await load('entityStatusPage').getEntityStatusPage('bookmark-canonical',{entityType:'EPISODE',limit:20,time:null,id:null});
  assert.equal(staleEpisodePage.statuses[0].parent_series_id,release.mal_id,'status route comes from canonical release membership despite stale metadata');
  assert.equal(staleEpisodePage.statuses[0].episode_number,1,'episode ordinal comes from canonical membership');
  assert.equal(staleEpisodePage.statuses[0].user_opinion,'Private favorite opinion');
  const staleFavorite=(await profiles.getBookmarkItems('bookmark-canonical','EPISODE'))[0];
  assert.equal(staleFavorite.animeId,release.mal_id,'favorite route follows canonical release despite stale parent');
  assert.equal(staleFavorite.episodeNumber,1,'favorite ordinal follows canonical membership');
  assert.equal(staleFavorite.seasonIdx,1,'favorite position follows current reorder');
  assert.equal(staleFavorite.score,0);
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE id=$1',[bookmarkAfter.id])).rows[0].activity_private,beforeReorderCipher);
  await pool.query('UPDATE user_entity_status SET parent_series_id=$2,episode_number=1 WHERE id=$1',[bookmarkAfter.id,release.mal_id]);
  assert.equal(bookmarkIdentity.isEpisodeBookmarked(beforeReorderItems,1,releaseRow.composition_season_id),true,'client matches release identity after reorder');
  const otherRelease=await database.withTransaction(client=>index.resolveEntityAlias(client,'anilist:season','222',null));
  assert.equal(bookmarkIdentity.isEpisodeBookmarked(beforeReorderItems,1,otherRelease.id),false,'old numeric route never marks different release favorite');
  assert.equal(bookmarkIdentity.isEpisodeBookmarked([{entityType:'EPISODE',entityId:`${release.mal_id}:s0:e1`,episodeNumber:1}],1,releaseRow.composition_season_id),false,'old coordinate alone does not mark a canonical release favorite');
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',releaseRow.composition_season_id,release.mal_id,1,1,releaseRow.composition_season_id),false,'stable release toggle removes original legacy favorite');
  const toggledLegacy=(await pool.query('SELECT * FROM user_entity_status WHERE id=$1',[bookmarkAfter.id])).rows[0];
  assert.equal(toggledLegacy.entity_id,bookmarkId);assert.deepEqual(toggledLegacy.activity_private,beforeReorderCipher,'reordered favorite update preserves legacy AAD/cipher');
  assert.equal(load('privateActivity').projectActivity(toggledLegacy).user_opinion,'Private favorite opinion');
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',bookmarkBefore.canonical_entity_id,release.mal_id,1,1),true,'canonical toggle reuses existing legacy status without duplicate');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='bookmark-canonical' AND canonical_entity_id=$1",[bookmarkBefore.canonical_entity_id])).rows[0].n,1);
  await assert.rejects(()=>profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',bookmarkBefore.canonical_entity_id,123459,0,1),e=>e.status===409);
  await assert.rejects(()=>profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',parent111,release.mal_id,1,2,parent111),e=>e.status===409);
  await pool.query('UPDATE anime_catalog SET seasons_json=$2::jsonb WHERE mal_id=$1',[release.mal_id,JSON.stringify(originalBookmarkSeasons)]);
  await assert.rejects(profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',bookmarkId,release.mal_id,1,1),e=>e.status===400);
  await pool.query(`CREATE FUNCTION reject_bookmark_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='bookmark-canonical' AND NEW.entity_type='EPISODE' AND NEW.episode_number=2 THEN RAISE EXCEPTION 'fixture binding failed'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER reject_bookmark_binding BEFORE UPDATE OF canonical_entity_id ON user_entity_status FOR EACH ROW EXECUTE FUNCTION reject_bookmark_binding()');
  assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical','EPISODE',releaseRow.composition_season_id,release.mal_id,0,2,releaseRow.composition_season_id),false);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id=$1 AND entity_type='EPISODE' AND episode_number=2",['bookmark-canonical'])).rows[0].n,0,'failed canonical binding rolls back inserted favorite');
  await pool.query('DROP TRIGGER reject_bookmark_binding ON user_entity_status');
  await pool.query('DROP FUNCTION reject_bookmark_binding()');
  await seedHistoricalActivity('bookmark-canonical','EPISODE','second-episode-alias',{}, {watched_seconds:14,user_opinion:'Second private alias'});
  await pool.query("UPDATE user_entity_status SET canonical_entity_id=$1 WHERE user_id='bookmark-canonical' AND entity_id='second-episode-alias'",[bookmarkBefore.canonical_entity_id]);
  await pool.query("UPDATE user_entity_status SET is_favorite=TRUE WHERE user_id='bookmark-canonical' AND canonical_entity_id=$1",[bookmarkBefore.canonical_entity_id]);
  const aliasBefore=(await pool.query("SELECT entity_id,activity_private,status,completed FROM user_entity_status WHERE user_id='bookmark-canonical' AND canonical_entity_id=$1 ORDER BY id",[bookmarkBefore.canonical_entity_id])).rows;
  assert.equal(aliasBefore.length,2,'fixture has two stored records of same canonical episode');
  await seedHistoricalActivity('bookmark-canonical','EPISODE','unbound-favorite-fixture',{}, {watched_seconds:4});
  await pool.query("UPDATE user_entity_status SET is_favorite=TRUE WHERE user_id='bookmark-canonical' AND entity_id='unbound-favorite-fixture'");
  const canonicalFavorites=await profiles.getBookmarkItems('bookmark-canonical','EPISODE');
  assert.equal(canonicalFavorites.length,1,'reader shows one canonical episode and excludes unbound old record');
  assert.equal(canonicalFavorites[0].entityId,bookmarkBefore.canonical_entity_id);
  assert.equal((await profiles.getBookmarkItems('bookmark-canonical')).filter(item=>item.entityType==='EPISODE').every(item=>item.entityId===bookmarkBefore.canonical_entity_id),true,'profile exposes canonical deletion target');
  await assert.rejects(profiles.removeEntityBookmark('bookmark-canonical','EPISODE',bookmarkId),e=>e.status===400);
  await profiles.removeEntityBookmark('other','EPISODE',bookmarkBefore.canonical_entity_id);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='bookmark-canonical' AND canonical_entity_id=$1 AND is_favorite",[bookmarkBefore.canonical_entity_id])).rows[0].n,2);
  for(let replay=0;replay<2;replay++) await profiles.removeEntityBookmark('bookmark-canonical','EPISODE',bookmarkBefore.canonical_entity_id);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='bookmark-canonical' AND canonical_entity_id=$1 AND is_favorite",[bookmarkBefore.canonical_entity_id])).rows[0].n,0);
  assert.deepEqual((await pool.query("SELECT entity_id,activity_private,status,completed FROM user_entity_status WHERE user_id='bookmark-canonical' AND canonical_entity_id=$1 ORDER BY id",[bookmarkBefore.canonical_entity_id])).rows,aliasBefore,'removal preserves private fields for every bound record');
  for(const [degree,target] of [['UNIVERSE',releaseRow.composition_universe_id],['SERIES',releaseRow.composition_work_id],['SEASON',releaseRow.composition_season_id]]) {
    const oldId=`old-favorite-${degree}`;
    await activity.writeActivity('bookmark-canonical',degree,target,{}, {watched_seconds:9,user_opinion:'Canonical private favorite'});
    await seedHistoricalActivity('bookmark-canonical',degree,oldId,{}, {watched_seconds:7,user_opinion:'Historical private favorite'});
    await pool.query("UPDATE user_entity_status SET canonical_entity_id=$2,is_favorite=TRUE WHERE user_id='bookmark-canonical' AND entity_type=$1 AND entity_id IN ($2,$3)",[degree,target,oldId]);
    const ordered=(await pool.query("SELECT id FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND canonical_entity_id=$2 ORDER BY id",[degree,target])).rows;
    await pool.query("UPDATE user_entity_status SET updated_at=CASE WHEN id=$3 THEN TIMESTAMPTZ '2026-01-02' ELSE TIMESTAMPTZ '2026-01-01' END WHERE user_id='bookmark-canonical' AND entity_type=$1 AND canonical_entity_id=$2",[degree,target,ordered[0].id]);
    const statusBefore=(await load('entityStatusPage').getEntityStatusPage('bookmark-canonical',{entityType:degree,limit:20,time:null,id:null})).statuses.find(row=>row.entity_id===target);
    assert.equal(statusBefore.id,ordered[0].id,'fixture timestamp order deliberately opposes UUID order');
    if(degree==='SEASON') assert.equal(statusBefore.parent_series_id,release.mal_id,'season without parent metadata resolves route from canonical work and release map');
    const before=(await pool.query("SELECT entity_id,activity_private,status,completed,updated_at FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND canonical_entity_id=$2 ORDER BY id",[degree,target])).rows;
    assert.equal(before.length,2);
    const items=await profiles.getBookmarkItems('bookmark-canonical',degree);
    assert.equal(items.length,1,'one latest bound favorite per canonical entity');
    assert.equal(items[0].entityId,target,'all degree deletion targets are canonical UUIDs');
    if(degree==='SEASON') assert.equal(items[0].animeId,release.mal_id,'favorite season without parent resolves canonical route');
    await profiles.removeEntityBookmark('other',degree,target);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND canonical_entity_id=$2 AND is_favorite",[degree,target])).rows[0].n,2);
    await assert.rejects(profiles.removeEntityBookmark('bookmark-canonical',degree,oldId),e=>e.status===400);
    for(let replay=0;replay<2;replay++) await profiles.removeEntityBookmark('bookmark-canonical',degree,target);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND canonical_entity_id=$2 AND is_favorite",[degree,target])).rows[0].n,0);
    assert.equal((await profiles.getBookmarkItems('bookmark-canonical',degree)).length,0);
    assert.deepEqual((await pool.query("SELECT entity_id,activity_private,status,completed,updated_at FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND canonical_entity_id=$2 ORDER BY id",[degree,target])).rows,before,'removal preserves original IDs, AAD envelopes, timestamps and progress for both records');
    const statusAfter=(await load('entityStatusPage').getEntityStatusPage('bookmark-canonical',{entityType:degree,limit:20,time:null,id:null})).statuses.find(row=>row.entity_id===target);
    assert.deepEqual({...statusAfter,is_favorite:true},{...statusBefore},'favorite removal changes only favorite in the latest status projection');
    await pool.query("UPDATE user_entity_status SET is_favorite=TRUE,updated_at=TIMESTAMPTZ '1970-01-01' WHERE user_id='bookmark-canonical' AND entity_type=$1 AND entity_id=$2",[degree,oldId]);
    assert.equal((await profiles.getBookmarkItems('bookmark-canonical',degree)).length,0,'older favorite cannot resurrect newer removed canonical state');
    if(degree==='SERIES') assert.equal((await profiles.getUserBookmarks('bookmark-canonical',true)).includes(release.mal_id),false);
    await profiles.removeEntityBookmark('bookmark-canonical',degree,target);
    if(degree==='UNIVERSE'||degree==='SERIES') {
      await pool.query("DELETE FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND entity_id=$2",[degree,target]);
      const prior=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND entity_id=$2",[degree,oldId])).rows[0];
      assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical',degree,target),true);
      const reused=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='bookmark-canonical' AND entity_type=$1 AND canonical_entity_id=$2",[degree,target])).rows;
      assert.equal(reused.length,1,'UUID toggle reuses linked historical record without duplication');
      assert.equal(reused[0].id,prior.id);
      assert.equal(reused[0].entity_id,oldId);
      assert.deepEqual(reused[0].activity_private,prior.activity_private,'reused record keeps original AAD envelope');
      assert.equal(activity.readActivity(reused[0]).user_opinion,'Historical private favorite');
      assert.equal(await profiles.toggleEntityBookmark('bookmark-canonical',degree,target),false);
    }
  }
  await pool.query("DELETE FROM users WHERE id='bookmark-canonical'");
  console.log('Canonical bookmarks: actual transactional toggle passed concurrent serialization, reader ID, private ciphertext preservation and binding failure rollback.');
  const commentWriter=load('entityCommentWriter');
  const commentInput={entityType:'EPISODE',entityId:`${release.mal_id}:s0:e1`,parentSeriesId:release.mal_id,episodeNumber:1,content:'Public episode comment',isSpoiler:false};
  const rootComment=await seedHistoricalComment('owner',commentInput);
  const commentEpisode=(await pool.query('SELECT canonical_entity_id FROM entity_comments WHERE id=$1',[rootComment.id])).rows[0].canonical_entity_id;
  assert.equal(typeof commentEpisode,'string');
  const replyComment=await seedHistoricalComment('other',{...commentInput,parentCommentId:rootComment.id,content:'Reply'});
  assert.equal(replyComment.canonical_entity_id,commentEpisode);
  await pool.query('UPDATE entity_comments SET canonical_entity_id=NULL WHERE id=ANY($1::uuid[])',[[rootComment.id,replyComment.id]]);
  const legacyComment=(await pool.query('SELECT * FROM entity_comments WHERE id=$1',[rootComment.id])).rows[0];
  const commentMigration=await commentWriter.backfillCommentEntities('owner',{limit:1});
  assert.equal(commentMigration.processed,1);assert.equal(commentMigration.unresolved,0);
  const migratedComment=(await pool.query('SELECT * FROM entity_comments WHERE id=$1',[rootComment.id])).rows[0];
  assert.equal(migratedComment.canonical_entity_id,commentEpisode);
  for (const field of ['content','entity_id','parent_comment_id','user_id','created_at','updated_at']) assert.deepEqual(migratedComment[field],legacyComment[field],'comment migration preserves '+field);
  assert.equal((await pool.query('SELECT canonical_entity_id FROM entity_comments WHERE id=$1',[replyComment.id])).rows[0].canonical_entity_id,null,'migration never touches another account reply');
  await commentWriter.backfillCommentEntities('owner',{limit:1});
  assert.equal((await pool.query('SELECT canonical_entity_id FROM entity_comments WHERE id=$1',[rootComment.id])).rows[0].canonical_entity_id,commentEpisode,'migration replay preserves ID');
  await commentWriter.backfillCommentEntities('other',{limit:1});
  const seasonComment=await seedHistoricalComment('owner',{entityType:'SEASON',entityId:`${release.mal_id}:s0`,content:'Season discussion'});
  const seasonReply=await commentWriter.insertEntityComment('other',{entityType:'SEASON',entityId:seasonComment.canonical_entity_id,parentCommentId:seasonComment.id,content:'Canonical season reply'});
  const seasonPageModule=load('entityCommentPage');
  const seasonPage=await seasonPageModule.getEntityCommentPage(seasonPageModule.readEntityCommentPageInput(new URLSearchParams({entity_type:'SEASON',entity_id:seasonComment.canonical_entity_id})));
  assert.deepEqual(seasonPage.comments.map(row=>row.id).sort(),[seasonComment.id,seasonReply.id].sort());
  await pool.query('DELETE FROM entity_comments WHERE id=$1',[seasonComment.id]);
  const canonicalReply=await commentWriter.insertEntityComment('other',{entityType:'EPISODE',entityId:commentEpisode,parentCommentId:rootComment.id,content:'Canonical reply'});
  assert.equal(canonicalReply.canonical_entity_id,commentEpisode,'reply accepts equivalent canonical episode identity');
  const commentPages=load('entityCommentPage');
  async function collectComments(entityId) {
    const ids=[];let cursor=null;
    do {
      const params=new URLSearchParams({entity_type:'EPISODE',entity_id:entityId,limit:'1'});
      if(cursor) params.set('cursor',cursor);
      const page=await commentPages.getEntityCommentPage(commentPages.readEntityCommentPageInput(params));
      assert.ok(page.comments.every(row=>row.entity_id===entityId),'comment projection exposes canonical identity');
      ids.push(...page.comments.map(row=>row.id));cursor=page.nextCommentCursor;
      assert.ok(ids.length<=3,'cursor advances without duplicates');
    } while(cursor);
    return ids;
  }
  const expectedComments=[rootComment.id,replyComment.id,canonicalReply.id].sort();
  await assert.rejects(()=>collectComments(commentInput.entityId),e=>e.status===400,'old comment reader coordinates rejected');
  assert.deepEqual((await collectComments(commentEpisode)).sort(),expectedComments,'canonical page includes migrated legacy discussion');
  const originalCommentSeasons=(await pool.query('SELECT seasons_json FROM anime_catalog WHERE mal_id=$1',[release.mal_id])).rows[0].seasons_json;
  await pool.query('UPDATE anime_catalog SET seasons_json=$2::jsonb WHERE mal_id=$1',[release.mal_id,JSON.stringify([{id:222},{id:release.idAnilist}])]);
  await commentWriter.backfillCommentEntities('owner');
  assert.deepEqual((await collectComments(commentEpisode)).sort(),expectedComments,'reorder preserves original episode discussion');
  await pool.query('UPDATE anime_catalog SET seasons_json=$2::jsonb WHERE mal_id=$1',[release.mal_id,JSON.stringify(originalCommentSeasons)]);
  for (const invalid of [{afterId:null},{afterId:'bad'},{limit:null},{limit:0},{limit:201}]) await assert.rejects(()=>commentWriter.backfillCommentEntities('owner',invalid));
  const beforeBadReply=(await pool.query("SELECT count(*)::int AS n FROM canonical_entities WHERE kind='EPISODE'")).rows[0].n;
  await assert.rejects(commentWriter.insertEntityComment('other',{...commentInput,entityId:`${release.mal_id}:s0:e19`,episodeNumber:19,parentCommentId:rootComment.id}),e=>e.status===400);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM canonical_entities WHERE kind='EPISODE'")).rows[0].n,beforeBadReply,'cross-entity reply rolls back newly resolved episode');
  await assert.rejects(commentWriter.insertEntityComment('owner',{...commentInput,parentSeriesId:release.mal_id+1}),e=>e.status===400);
  await assert.rejects(()=>pool.query('UPDATE entity_comments SET canonical_entity_id=$2 WHERE id=$1',[rootComment.id,releaseRow.composition_work_id]),/foreign key/);
  assert.equal((await pool.query('SELECT content FROM entity_comments WHERE id=$1',[rootComment.id])).rows[0].content,commentInput.content,'canonical linkage preserves public comment content');
  await pool.query('DELETE FROM entity_comments WHERE id=$1',[rootComment.id]);
  console.log('Canonical comments: current UUID writer accepts bound historical parents and rejects other entities, release contexts, unbound parents and old IDs; native migration preserves historical linkage and cursors.');
  await assert.rejects(profiles.saveWatchProgress('owner',1,0,1,55,100),e=>e.status===400,'old telemetry without canonical season is rejected');
  await catalogContext.saveAnimesToCatalog([{mal_id:1,idAnilist:1,title:'Migrated telemetry fixture',images:{},genres:[],sourceNodes:[{namespace:'anilist:media',id:'1',type:'ANIME',format:'TV',episodes:null}],sourceRelations:[]}],'fixture');
  await seedHistoricalActivity('owner','EPISODE','1:s0:e1',{parentSeriesId:1,seasonIdx:0,episodeNumber:1,status:'watching',completed:false},{watched_seconds:55,total_seconds:100});
  const ownerEpisode=(await pool.query("SELECT canonical_entity_id FROM user_entity_status WHERE user_id='owner' AND entity_id='1:s0:e1'")).rows[0].canonical_entity_id;
  await Promise.all([
    activity.writeActivity('owner','EPISODE',ownerEpisode,{}, { user_opinion: 'private-opinion', user_score: 8.5 }),
    activity.writeActivity('owner','EPISODE',ownerEpisode,{}, { watched_seconds: 65 }),
  ]);
  let stored = (await pool.query("SELECT * FROM user_entity_status WHERE user_id='owner' AND entity_type='EPISODE' AND entity_id='1:s0:e1'")).rows[0];
  assert.equal(stored.watched_seconds, 0); assert.equal(stored.user_opinion, null); assert.equal(stored.user_score, null);
  assert.ok(!JSON.stringify(stored.activity_private).includes('private-opinion'));
  let projected = activity.projectActivity(stored);
  assert.equal(projected.watched_seconds,65); assert.equal(projected.total_seconds,100); assert.equal(projected.user_opinion,'private-opinion');
  assert.ok(!('activity_private' in projected));
  const progressExports = {};
  const progressCode = ts.transpileModule(fs.readFileSync('src/app/api/progress/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(progressCode, {exports:progressExports,URL,console,process:{env},require(name) {
    if (name.startsWith('@/lib/')) return load(name.slice('@/lib/'.length));
    return require(name);
  }});
  const sessionSecret = 'a'.repeat(64);
  const sessionKey = 'web-' + crypto.createHash('sha256').update(sessionSecret).digest('hex');
  await pool.query('INSERT INTO active_session(key,user_id,updated_at) VALUES($1,$2,$3)',[sessionKey,'owner',Date.now()]);
  const {NextRequest} = require('next/server');
  await load('activityEntityIndex').backfillActivityEntities('owner');
  const migratedProgressSeason=(await pool.query('SELECT composition_season_id FROM anime_catalog WHERE mal_id=1')).rows[0].composition_season_id;
  const progressResponse = await progressExports.GET(new NextRequest('https://anirium.com.br/api/progress?animeId=1&seasonEntityId='+migratedProgressSeason,{headers:{cookie:`__Host-anirium_web_session=${sessionSecret}`}}));
  assert.equal(progressResponse.status,200);
  const progressJson = await progressResponse.json();
  assert.equal(progressJson.episodes[0].watchedSeconds,65);
  assert.equal(progressJson.episodes[0].userScore,8.5);
  assert.equal(progressJson.episodes[0].userOpinion,'private-opinion');
  assert.ok(!JSON.stringify(progressJson).includes('_anirium_private'));
  assert.throws(() => activity.projectActivity({...stored,user_id:'other'}));
  assert.throws(() => activity.projectActivity({...stored,entity_id:'2:s0:e1'}));
  assert.throws(() => activity.projectActivity({...stored,activity_private:{watched_seconds:65}}), 'new encrypted column never accepts plaintext fallback');
  await assert.rejects(() => activity.writeActivity('owner','EPISODE',ownerEpisode,{}, {watched_seconds:NaN}));
  assert.equal(activity.readActivity((await pool.query("SELECT * FROM user_entity_status WHERE entity_id='1:s0:e1'")).rows[0]).watched_seconds,65);
  const historicalEpisode=(await pool.query("SELECT canonical_entity_id FROM user_entity_status WHERE user_id='owner' AND entity_id='1:s0:e1'")).rows[0].canonical_entity_id;
  await profiles.toggleEntityBookmark('owner','EPISODE',historicalEpisode,1,0,1);
  assert.equal((await profiles.getBookmarkItems('owner'))[0].score,8.5);
  // More than twelve ineligible recent candidates must not crowd out eligible history.
  for (let number=2;number<116;number++) await seedHistoricalActivity('owner','EPISODE',`1:s0:e${number}`,{parentSeriesId:1,seasonIdx:0,episodeNumber:number},{watched_seconds:5,total_seconds:100});
  assert.equal((await profiles.getWatchHistory('owner'))[0].progressSeconds,65);
  await pool.query("INSERT INTO user_entity_status(user_id,entity_type,entity_id,status,watched_seconds,total_seconds,user_opinion,user_score,external_source_score) VALUES('other','EPISODE','legacy','watching',45,90,'legacy-private',8.5,0)");
  const plaintextActivity=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='other' AND entity_id='legacy'")).rows[0];
  assert.throws(()=>activity.readActivity(plaintextActivity),/requires encrypted data migration/,'current reader refuses unmigrated activity without STRICT flag');
  const oldNumericPayload={...activity.readActivity(stored),user_score:'7.5',external_source_score:'0.0'};
  const oldNumericEnvelope=load('privateData').encryptPrivateJson(oldNumericPayload,activity.activityContext({user_id:'other',entity_type:'EPISODE',entity_id:'legacy-numeric-json'}));
  await pool.query("INSERT INTO user_entity_status(user_id,entity_type,entity_id,status,activity_private) VALUES('other','EPISODE','legacy-numeric-json','watching',$1)",[JSON.stringify(oldNumericEnvelope)]);
  assert.throws(()=>activity.readActivity({user_id:'other',entity_type:'EPISODE',entity_id:'legacy-numeric-json',activity_private:oldNumericEnvelope}),/Invalid activity score/,'runtime refuses numeric strings in old encrypted payload');
  const activityClient = await pool.connect();
  try {
    const migrate = () => migration.migrateActivityBatch(activityClient,['','',''],500);
    const invalidNumericEnvelope=load('privateData').encryptPrivateJson({...oldNumericPayload,user_score:'invalid'},activity.activityContext({user_id:'other',entity_type:'EPISODE',entity_id:'legacy-numeric-json'}));
    await pool.query("UPDATE user_entity_status SET activity_private=$1 WHERE user_id='other' AND entity_id='legacy-numeric-json'",[JSON.stringify(invalidNumericEnvelope)]);
    await assert.rejects(migrate,/Invalid migrated activity score/);
    assert.equal((await pool.query("SELECT activity_private FROM user_entity_status WHERE user_id='other' AND entity_id='legacy'")).rows[0].activity_private,null,'invalid numeric payload rolls back earlier plaintext conversion in the same batch');
    await pool.query("UPDATE user_entity_status SET activity_private=$1 WHERE user_id='other' AND entity_id='legacy-numeric-json'",[JSON.stringify(oldNumericEnvelope)]);
    assert.ok((await migrate()).changed>0);
    assert.equal((await migrate()).changed,0);
    for(const [entityId,expected] of [['legacy',8.5],['legacy-numeric-json',7.5]]) {
      const typedRow=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='other' AND entity_id=$1",[entityId])).rows[0];
      const typed=load('privateData').decryptPrivateJson(typedRow.activity_private,activity.activityContext(typedRow));
      assert.equal(typeof typed.user_score,'number');assert.equal(typed.user_score,expected);
      assert.equal(typeof typed.external_source_score,'number');assert.equal(typed.external_source_score,0);
    }
    save('next');
    await Promise.all([migrate(),activity.writeActivity('owner','EPISODE',ownerEpisode,{}, {audio_track_used:'private-audio'})]);
    stored = (await pool.query("SELECT * FROM user_entity_status WHERE entity_id='1:s0:e1'")).rows[0];
    assert.equal(stored.activity_private.kid,'next'); assert.equal(activity.readActivity(stored).audio_track_used,'private-audio');
    assert.equal((await migrate()).changed,0);
    const backup = (await pool.query('SELECT * FROM user_entity_status ORDER BY user_id,entity_type,entity_id')).rows;
    await pool.query("UPDATE user_entity_status SET activity_private=$1 WHERE entity_id='legacy'",[JSON.stringify(stored.activity_private)]);
    save('old');
    await assert.rejects(migrate);
    assert.equal((await pool.query("SELECT activity_private FROM user_entity_status WHERE entity_id='1:s0:e1'")).rows[0].activity_private.kid,'next','failed migration rolls back prior rekey');
    await pool.query('DELETE FROM user_entity_status');
    for (const row of backup) await pool.query('INSERT INTO user_entity_status(user_id,entity_type,entity_id,status,activity_private) VALUES($1,$2,$3,$4,$5)',[row.user_id,row.entity_type,row.entity_id,row.status,JSON.stringify(row.activity_private)]);
    env.ANIRIUM_PRIVATE_DATA_STRICT='1';
    assert.equal(activity.readActivity((await pool.query("SELECT * FROM user_entity_status WHERE entity_id='legacy'")).rows[0]).watched_seconds,45);
    await seedHistoricalActivity('owner','EPISODE','strict-new',{}, {watched_seconds:12});
    await seedHistoricalActivity('owner','EPISODE','2:s0:e1',{parentSeriesId:2,seasonIdx:0,episodeNumber:1,status:'watching',completed:false},{watched_seconds:35,total_seconds:100});
    await assert.rejects(profiles.toggleEntityBookmark('owner','SERIES','3',3),e=>e.status===400);
    await assert.rejects(profiles.toggleEntityBookmark('owner','SERIES','4'),e=>e.status===400);
    await seedHistoricalActivity('owner','SERIES','3',{parentSeriesId:3,status:'plan_to_watch'},{});
    await seedHistoricalActivity('owner','SERIES','4',{parentSeriesId:4,status:'plan_to_watch'},{});
    await pool.query("UPDATE user_entity_status SET is_favorite=TRUE WHERE user_id='owner' AND entity_type='SERIES' AND entity_id IN ('3','4')");
    const seedProgressCatalog = async (routeId,counts) => {
      const sourceIds=counts.map((_,i)=>routeId+i*100000);
      const sourceNodes=sourceIds.map((id,i)=>({namespace:'anilist:media',id:String(id),type:'ANIME',format:'TV',episodes:counts[i]}));
      const sourceRelations=sourceIds.slice(1).map((id,i)=>({namespace:'anilist:media',fromId:String(sourceIds[i]),fromType:'ANIME',toId:String(id),toType:'ANIME',relationType:'SEQUEL'}));
      await catalogContext.saveAnimesToCatalog([{mal_id:routeId,idAnilist:routeId,title:'Canonical telemetry fixture '+routeId,images:{},genres:[],sourceNodes,sourceRelations}],'fixture');
      const row=(await pool.query('SELECT * FROM anime_catalog WHERE mal_id=$1',[routeId])).rows[0];
      return {work:row.composition_work_id,seasons:sourceIds.map(id=>row.composition_seasons_json[String(id)])};
    };
    const atomic=await seedProgressCatalog(60,[2]);
    const saveAtomic=(episode,seconds)=>profiles.saveWatchProgress('owner',60,0,episode,seconds,100,atomic.seasons[0]);
    const atomicEpisode=await database.withTransaction(client=>load('catalogReleaseIdentity').ensureReleaseEpisode(client,atomic.seasons[0],1));
    await pool.query(`CREATE FUNCTION reject_atomic_season() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='owner' AND NEW.entity_id='${atomic.seasons[0]}' THEN RAISE EXCEPTION 'synthetic cascade failure'; END IF; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER reject_atomic_season BEFORE INSERT OR UPDATE ON user_entity_status FOR EACH ROW EXECUTE FUNCTION reject_atomic_season()");
    await assert.rejects(saveAtomic(1,20),/Failed to persist watch progress/);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_entity_status WHERE user_id='owner' AND canonical_entity_id=$1",[atomicEpisode])).rows[0].count,0,'failed season rolls back inserted episode');
    await pool.query('DROP TRIGGER reject_atomic_season ON user_entity_status');
    await saveAtomic(1,20);
    const atomicBefore=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[atomicEpisode])).rows[0];
    await pool.query("CREATE TRIGGER reject_atomic_season BEFORE INSERT OR UPDATE ON user_entity_status FOR EACH ROW EXECUTE FUNCTION reject_atomic_season()");
    await assert.rejects(saveAtomic(1,100));
    const atomicAfter=(await pool.query("SELECT * FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[atomicEpisode])).rows[0];
    assert.deepEqual(atomicAfter,atomicBefore,'failed update preserves ciphertext metadata timestamp and progress');
    await pool.query('DROP TRIGGER reject_atomic_season ON user_entity_status');
    await pool.query('DROP FUNCTION reject_atomic_season()');
    await Promise.all([saveAtomic(1,100),saveAtomic(2,100)]);
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_type='SERIES' AND entity_id=$1",[atomic.work])).rows[0].status,'completed');
    console.log('Atomic canonical progress PostgreSQL: downstream failure rolls back episode; failed update preserves complete row; concurrent episodes complete coherent hierarchy.');

    const strictBefore=(await pool.query('SELECT count(*)::int AS n FROM user_entity_status')).rows[0].n;
    for(const oldId of ['50:s0:e1','legacy-coordinate','50','']) {
      await assert.rejects(activity.writeActivity('owner','EPISODE',oldId,{}, {watched_seconds:30}),e=>e.status===400 || /Invalid activity identity/.test(e.message));
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM user_entity_status')).rows[0].n,strictBefore,'old IDs rejected without insert');
    console.log('Activity current contract PostgreSQL: old coordinates and opaque IDs rejected without writes; canonical UUID partial updates and AAD exercised above.');

    const unknown=await seedProgressCatalog(40,[null]);
    await profiles.saveWatchProgress('owner',40,0,1,100,100,unknown.seasons[0]);
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[unknown.seasons[0]])).rows[0].status,'watching');
    const two=await seedProgressCatalog(41,[2,1]);
    const saveTwo=(season,episode,seconds=100)=>profiles.saveWatchProgress('owner',41,season,episode,seconds,100,two.seasons[season]);
    await saveTwo(0,99);
    await saveTwo(0,1);
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[two.seasons[0]])).rows[0].status,'watching','out-of-range episode cannot fill missing episode');
    await saveTwo(0,2);
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[two.seasons[0]])).rows[0].status,'completed');
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[two.work])).rows[0].status,'watching','unvisited second season prevents work completion');
    await saveTwo(1,1);
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[two.work])).rows[0].status,'completed');
    await saveTwo(0,2,20);
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[two.work])).rows[0].status,'watching');
    const partial=await seedProgressCatalog(42,[1,null]);
    await profiles.saveWatchProgress('owner',42,0,1,100,100,partial.seasons[0]);
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[partial.seasons[0]])).rows[0].status,'completed');
    assert.equal((await pool.query("SELECT status FROM user_entity_status WHERE user_id='owner' AND entity_id=$1",[partial.work])).rows[0].status,'watching');
    console.log('Canonical progress cascade PostgreSQL: unknown counts never complete; out-of-range excluded; all known releases required; changed progress reopens season/work.');

    await catalogContext.saveAnimesToCatalog([{mal_id:4,idAnilist:4,title:'Known fixture',title_portuguese:'Obra fixture',images:{},genres:[],sourceNodes:[{namespace:'anilist:media',id:'4',type:'ANIME',format:'TV',episodes:null}],sourceRelations:[]}],'fixture');
    const currentWork=(await pool.query('SELECT composition_work_id FROM anime_catalog WHERE mal_id=4')).rows[0].composition_work_id;
    await activity.writeActivity('owner','SERIES',currentWork,{status:'plan_to_watch'}, {user_score:0});
    await profiles.toggleEntityBookmark('owner','SERIES',currentWork);
    assert.equal((await profiles.getBookmarkItems('owner')).find(row=>row.entityType==='SERIES'&&row.entityId===currentWork).animeTitle,'Known fixture','unproven raw translation is not presented as Portuguese');
    const seriesPages=load('entityStatusPage');
    const joinedSeries=await seriesPages.getEntityStatusPage('owner',seriesPages.readEntityStatusPageInput(new URLSearchParams({entity_type:'SERIES',limit:'20'})));
    assert.equal(joinedSeries.statuses.find(row=>row.entity_id===currentWork).anime_title_portuguese,undefined,'status does not assign a language to historical text without provenance');
    assert.equal(joinedSeries.statuses.find(row=>row.entity_id===currentWork).parent_series_id,4,'current work without stored route resolves linked catalog entry');
    await pool.query("UPDATE user_entity_status SET parent_series_id=$2 WHERE user_id='owner' AND entity_id=$1",[currentWork,release.mal_id]);
    const currentSeriesAgain=await seriesPages.getEntityStatusPage('owner',seriesPages.readEntityStatusPageInput(new URLSearchParams({entity_type:'SERIES',limit:'20'})));
    assert.equal(currentSeriesAgain.statuses.find(row=>row.entity_id===currentWork).parent_series_id,4,'stale route to another work cannot override canonical catalog linkage');
    assert.ok(joinedSeries.statuses.every(row=>row.user_id==='owner'));

    assert.equal((await pool.query("SELECT parent_series_id FROM user_entity_status WHERE user_id='owner' AND entity_type='SERIES' AND entity_id='4'")).rows[0].parent_series_id,4);
    await assert.rejects(profiles.toggleEntityBookmark('owner','SERIES','5',6),e=>e.status===400);
    await assert.rejects(profiles.toggleEntityBookmark('owner','SERIES','5junk'),e=>e.status===400);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_entity_status WHERE user_id='owner' AND entity_id IN ('5','5junk')")).rows[0].count,0);
    await activity.writeActivity('owner','SERIES',currentWork,{}, {user_score:0});
    await pool.query("UPDATE user_entity_status SET created_at=NULL,season_idx=NULL,episode_number=NULL WHERE user_id='owner' AND entity_type='SERIES' AND entity_id=$1",[currentWork]);
    const unknownBookmark=(await profiles.getBookmarkItems('owner')).find(row=>row.entityType==='SERIES'&&row.entityId===currentWork);
    assert.equal(unknownBookmark.score,0);assert.equal(unknownBookmark.createdAt,null);assert.equal(unknownBookmark.status,'plan_to_watch');assert.equal(unknownBookmark.seasonIdx,undefined);assert.equal(unknownBookmark.episodeNumber,undefined);assert.ok(!unknownBookmark.animeTitle.includes('NaN'));
    await pool.query("UPDATE user_entity_status SET created_at=TIMESTAMPTZ '1970-01-01 00:00:00+00' WHERE user_id='owner' AND entity_type='SERIES' AND entity_id=$1",[currentWork]);
    assert.equal((await profiles.getBookmarkItems('owner')).find(row=>row.entityId===currentWork).createdAt,0);
    await seedHistoricalActivity('owner','SERIES','99junk',{parentSeriesId:99,isFavorite:true},{});
    await pool.query("UPDATE user_entity_status SET is_favorite=TRUE WHERE user_id='owner' AND entity_type='SERIES' AND entity_id='99junk'");
    assert.ok(!(await profiles.getUserBookmarks('owner',true)).includes(99));
    await assert.rejects(profiles.removeEntityBookmark('owner','SERIES','99junk'),e=>e.status===400);
    assert.ok(!(await profiles.getBookmarkItems('owner')).some(row=>row.entityId==='99junk'),'unbound old identity never becomes a public deletion target');
    console.log('Catalog identity/projection: real isolated PostgreSQL passed canonical own-parent insert, divergent/malformed reject with no row, encrypted score0, null/epoch0 dates, missing metadata, legacy-ID filtering and removal.');

    assert.ok((await profiles.getBookmarkItems('owner')).length > 0, 'new bookmarks readable in strict mode');
  } finally { activityClient.release(); }
  const pages=load('entityStatusPage');
  await pool.query("UPDATE user_entity_status SET updated_at='2026-10-03T12:34:56.123456Z' WHERE user_id='owner'");
  await pool.query("UPDATE user_entity_status SET updated_at=NULL WHERE user_id='owner' AND entity_id='strict-new'");
  const candidates=(await pool.query("SELECT id,canonical_entity_id FROM user_entity_status WHERE user_id='owner' AND entity_type='EPISODE' ORDER BY COALESCE(updated_at,TIMESTAMPTZ '1970-01-01 00:00:00+00') DESC,id DESC")).rows;
  const latestByEntity=new Map();
  for(const row of candidates) if(row.canonical_entity_id && !latestByEntity.has(row.canonical_entity_id)) latestByEntity.set(row.canonical_entity_id,row.id);
  const expected=[...latestByEntity.values()];
  const seen=[];let next=null;
  do {
    const params=new URLSearchParams({entity_type:'EPISODE',limit:'4'});
    if(next)params.set('cursor',next);
    const page=await pages.getEntityStatusPage('owner',pages.readEntityStatusPageInput(params));
    assert.ok(page.statuses.length<=4);
    assert.ok(!JSON.stringify(page.statuses).includes('activity_private'));
    assert.ok(page.statuses.every(row=>row.user_id==='owner'&&!('_page_time' in row)));
    seen.push(...page.statuses.map(row=>row.id));next=page.nextCursor;
    assert.ok(seen.length<1000,'pagination must terminate');
  } while(next);
  assert.deepEqual(seen,expected,'keyset pagination reaches all rows exactly once even with identical microsecond timestamps');
  for(const query of ['limit=21','limit=0','limit=1&limit=2','entity_type=unknown','cursor=bad','cursor='+Buffer.from(JSON.stringify(['2026-02-31T12:00:00.123456Z',crypto.randomUUID()])).toString('base64url')]) {
    assert.throws(()=>pages.readEntityStatusPageInput(new URLSearchParams(query)),error=>error.reason==='invalid_status_page');
  }
  // ensureDefaultProfiles executed the actual canonical DDL in this schema.
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='external_identities'::regclass AND contype='f'")).rows[0].count,1);
  const identityFile=join(temporary,'identity-keyring.json');
  await pool.query('DELETE FROM external_identities'); // Separate primitive test population.
  const identityKeys={old:crypto.randomBytes(32).toString('base64')};
  const saveIdentity=activeKeyId=>fs.writeFileSync(identityFile,JSON.stringify({activeKeyId,keys:Object.entries(identityKeys).map(([id,key])=>({id,key}))}),{mode:0o600});
  env.ANIRIUM_IDENTITY_KEYRING_FILE=identityFile;saveIdentity('old');
  const identities=load('externalIdentity');let createdIdentities=0;
  const createIdentity=async client=>{
    createdIdentities++;const id=crypto.randomUUID();
    await client.query("INSERT INTO users(id,username,display_name,avatar_url,created_at,settings_json,profile_private) VALUES($1,$2,'Conta','',0,$3,$4)",
      [id,'user_'+crypto.randomBytes(12).toString('hex'),JSON.stringify(lib.encryptPrivateJson({},lib.profileSettingsPrivateContext(id))),JSON.stringify(load('privateProfile').encodeProfile(id,'Private identity',''))]);
    return id;
  };
  const parallelIdentity=await Promise.all(Array.from({length:6},()=>identities.resolveGoogleAccount('verified-identity',createIdentity)));
  assert.equal(new Set(parallelIdentity).size,1);assert.equal(createdIdentities,1,'concurrent subject creates exactly one account');
  identityKeys.next=crypto.randomBytes(32).toString('base64');saveIdentity('next');
  assert.equal(await identities.resolveGoogleAccount('verified-identity',createIdentity),parallelIdentity[0],'rotation retains account and adds new lookup');
  assert.equal(createdIdentities,1);
  const mappings=(await pool.query('SELECT * FROM external_identities')).rows;
  assert.equal(mappings.length,2);assert.ok(!JSON.stringify(mappings).includes('verified-identity'));
  await pool.query("UPDATE external_identities SET user_id='other' WHERE key_id='next'");
  await assert.rejects(()=>identities.resolveGoogleAccount('verified-identity',createIdentity),/Conflicting/);
  assert.equal(createdIdentities,1,'conflicting historical mappings cannot create a third account');
  await pool.query('UPDATE external_identities SET user_id=$1 WHERE key_id=\'next\'',[parallelIdentity[0]]);
  let failedIdentity;
  await assert.rejects(()=>identities.resolveGoogleAccount('rollback-identity',async client=>{failedIdentity=await createIdentity(client);throw new Error('creation failure');}));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM users WHERE id=$1',[failedIdentity])).rows[0].count,0,'failed creator rolls account back');
  const secondIdentity=await identities.resolveGoogleAccount('separate-identity',createIdentity);
  assert.notEqual(secondIdentity,parallelIdentity[0],'different verified subjects resolve distinct accounts');
  assert.equal(await identities.resolveGoogleAccount('verified-identity',createIdentity),parallelIdentity[0]);
  assert.equal(await identities.resolveGoogleAccount('separate-identity',createIdentity),secondIdentity);
  await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[[parallelIdentity[0],secondIdentity]]);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM external_identities')).rows[0].count,0,'account deletion cascades identity mappings');
  const legacyId='google-legacy-fixture';
  const longOwner='legacy-'+ 'a'.repeat(120);
  await pool.query("INSERT INTO users(id,username,display_name,created_at) VALUES($1,'long-canonical-owner','Conta',0)",[longOwner]);
  const longAccount=await load('accountIdentity').backfillAccountIdentity(longOwner);
  assert.equal((await pool.query('SELECT owner_id FROM canonical_entities WHERE id=$1',[longAccount])).rows[0].owner_id,longOwner,'canonical account supports legacy owner length accepted by identity/private-data contracts');
  await load('privateActivity').writeActivity(longOwner,'EPISODE',episode.id,{}, {user_score:0,user_opinion:'Long owner fixture'});
  const longActivityBefore=(await pool.query('SELECT activity_private FROM user_entity_status WHERE user_id=$1',[longOwner])).rows[0].activity_private;
  assert.equal((await activityIndex.backfillActivityEntities(longOwner)).unresolved,0);
  assert.deepEqual((await pool.query('SELECT activity_private FROM user_entity_status WHERE user_id=$1',[longOwner])).rows[0].activity_private,longActivityBefore);
  await load('entityCommentWriter').insertEntityComment(longOwner,{entityType:'EPISODE',entityId:episode.id,content:'Long owner discussion fixture'});
  assert.equal((await load('entityCommentWriter').backfillCommentEntities(longOwner)).unresolved,0);
  await profiles.installUserAddon(longOwner,{id:'long-owner-addon',privateConfig:'Long owner private config'});
  const longAddonBefore=(await pool.query('SELECT config_json,enabled FROM user_addons WHERE user_id=$1',[longOwner])).rows[0];
  await load('accountPluginIndex').backfillAccountPlugins(longOwner);
  assert.deepEqual((await pool.query('SELECT config_json,enabled FROM user_addons WHERE user_id=$1',[longOwner])).rows[0],longAddonBefore);
  console.log('Legacy owner compatibility: 127-character account passed activity/comment/addon backfill with unchanged private envelopes/config and grants.');
  const noAddonLogin={googleId:'no-addon-fixture',email:'no-addon@example.invalid',name:'No addon account',avatarUrl:''};
  const noAddonProfile=await profiles.upsertGoogleUserProfile(noAddonLogin,'no-addon-login');
  const noAddonAccount=(await pool.query('SELECT canonical_account_id FROM users WHERE id=$1',[noAddonProfile.id])).rows[0].canonical_account_id;
  assert.ok(noAddonAccount,'actual authenticated profile writer binds account even without addons');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM user_addons WHERE user_id=$1',[noAddonProfile.id])).rows[0].n,0);
  const noAddonEntity=(await pool.query('SELECT kind,owner_id,visibility FROM canonical_entities WHERE id=$1',[noAddonAccount])).rows[0];
  assert.deepEqual(noAddonEntity,{kind:'ACCOUNT',owner_id:noAddonProfile.id,visibility:'account-private'});
  assert.equal((await profiles.upsertGoogleUserProfile(noAddonLogin,'no-addon-replay')).id,noAddonProfile.id);
  assert.equal((await pool.query('SELECT canonical_account_id FROM users WHERE id=$1',[noAddonProfile.id])).rows[0].canonical_account_id,noAddonAccount);
  await pool.query("INSERT INTO users(id,username,display_name,avatar_url,created_at,level_tier,settings_json,profile_private) VALUES($1,'legacy-prefix','Conta','',0,2,$2,$3)",
    [legacyId,JSON.stringify(lib.encryptPrivateJson({preferredAudio:'legacy-preserved'},lib.profileSettingsPrivateContext(legacyId))),JSON.stringify(load('privateProfile').encodeProfile(legacyId,'Legacy',''))]);
  await profiles.installUserAddon(legacyId,{id:'legacy-owned',privateConfig:'legacy-secret'});
  const linkedLegacy=await profiles.upsertGoogleUserProfile({googleId:'legacy-fixture',email:'legacy@example.invalid',name:'Legacy login',avatarUrl:''},'legacy-login');
  assert.notEqual(linkedLegacy.id,legacyId,'old Google-prefixed ID does not select a current account');
  assert.match(linkedLegacy.id,/^[0-9a-f-]{36}$/i);
  const currentSubject=(await pool.query('SELECT google_subject_private FROM users WHERE id=$1',[linkedLegacy.id])).rows[0].google_subject_private;
  load('identityLookup').authenticateGoogleSubject({id:linkedLegacy.id,google_subject_private:currentSubject},'legacy-fixture');
  assert.throws(()=>load('identityLookup').authenticateGoogleSubject({id:legacyId},'legacy-fixture'),/Invalid encrypted identity/,'prefix alone never authenticates a Google subject');
  assert.notEqual(linkedLegacy.settings.preferredAudio,'legacy-preserved');
  assert.equal((await profiles.getUserInstalledAddons(linkedLegacy.id)).length,0,'new current account does not inherit unrelated old account configuration');
  assert.equal((await profiles.upsertGoogleUserProfile({googleId:'legacy-fixture',email:'legacy@example.invalid',name:'Current login',avatarUrl:''},'current-login-replay')).id,linkedLegacy.id,'verified Google mapping reuses current UUID');
  const inventoryOwner=(await profiles.upsertGoogleUserProfile({googleId:'inventory-fixture',email:'inventory@example.invalid',name:'Inventory',avatarUrl:''},'inventory-login')).id;
  await profiles.installUserAddon(inventoryOwner,{id:'inventory-a'});
  await profiles.installUserAddon(inventoryOwner,{id:'inventory-b'});
  for(const entityId of ['inventory-a','inventory-b']) {
    const row={user_id:inventoryOwner,entity_type:'SERIES',entity_id:entityId};
    await pool.query("INSERT INTO user_entity_status(user_id,entity_type,entity_id,status,activity_private) VALUES($1,$2,$3,'watching',$4)",
      [inventoryOwner,row.entity_type,row.entity_id,JSON.stringify(lib.encryptPrivateJson({watched_seconds:0,total_seconds:0,user_score:0},load('privateActivity').activityContext(row)))]);
  }
  const inventory=load('privateDataInventory');
  const inspect=()=>database.withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return plain(await inventory.inspectPrivateData(client,{ownerId:inventoryOwner,batchSize:1}));
  });
  const originalInventoryRows=await pool.query('SELECT row_to_json(u) AS row FROM users u WHERE id=$1',[inventoryOwner]);
  const cleanInventory=await inspect();
  assert.equal(cleanInventory.privateDataReady,true);
  assert.equal(cleanInventory.counts.activity.scanned,2);
  assert.equal(cleanInventory.counts.addons.scanned,2,'composite keyset does not skip same-owner addons');
  assert.deepEqual((await pool.query('SELECT row_to_json(u) AS row FROM users u WHERE id=$1',[inventoryOwner])).rows,originalInventoryRows.rows,'inventory preserves stored account');
  await pool.query('UPDATE users SET profile_private=NULL,settings_json=$2,display_name=$3 WHERE id=$1',
    [inventoryOwner,JSON.stringify(lib.encryptPrivateJson({autoplay:'true'},lib.profileSettingsPrivateContext(inventoryOwner))),'residue']);
  const wrongActivity={user_id:inventoryOwner,entity_type:'SERIES',entity_id:'inventory-a'};
  await pool.query("UPDATE user_entity_status SET activity_private=$2,user_opinion='residue' WHERE user_id=$1 AND entity_id='inventory-a'",
    [inventoryOwner,JSON.stringify(lib.encryptPrivateJson({user_score:'7'},load('privateActivity').activityContext(wrongActivity)))]);
  await pool.query("UPDATE user_addons SET config_json=$2 WHERE user_id=$1 AND addon_id='inventory-a'",
    [inventoryOwner,JSON.stringify(lib.encryptPrivateJson({},lib.addonPrivateContext('other','inventory-a')))]);
  const invalidInventory=await inspect();
  assert.equal(invalidInventory.privateDataReady,false);
  assert.equal(invalidInventory.counts.profile.missingEnvelope,1);
  assert.equal(invalidInventory.counts.profile.residualPlaintext,1);
  assert.equal(invalidInventory.counts.settings.invalidCurrentPayload,1);
  assert.equal(invalidInventory.counts.activity.invalidCurrentPayload,1);
  assert.equal(invalidInventory.counts.activity.residualPlaintext,1);
  assert.equal(invalidInventory.counts.addons.invalidCurrentPayload,1);
  assert.equal(JSON.stringify(invalidInventory).includes(inventoryOwner),false,'aggregate report contains no account identity');
  await pool.query('DELETE FROM users WHERE id=$1',[inventoryOwner]);
  const settingsContract=load('privateProfileSettings');
  const settingsIds=['zz-settings-a','zz-settings-b','zz-settings-c'];
  for(const id of settingsIds) await pool.query("INSERT INTO users(id,username,display_name,avatar_url,created_at,profile_private,settings_json) VALUES($1,$1,'Conta','',0,$2,$3)",
    [id,JSON.stringify(load('privateProfile').encodeProfile(id,'Settings','')),JSON.stringify(settingsContract.encodeProfileSettings(id,{}))]);
  const historicalSettings={autoNextEpisode:'true',autoSkipIntro:'false',preferredAudio:'Original'};
  await pool.query('UPDATE users SET settings_json=$2 WHERE id=$1',[settingsIds[0],JSON.stringify(historicalSettings)]);
  const encryptedHistoricalSettings=lib.encryptPrivateJson({telemetryHud:'false',usePlayerOnEpisodes:'true'},lib.profileSettingsPrivateContext(settingsIds[1]));
  await pool.query('UPDATE users SET settings_json=$2 WHERE id=$1',[settingsIds[1],JSON.stringify(encryptedHistoricalSettings)]);
  const invalidSettings=lib.encryptPrivateJson({autoNextEpisode:'yes'},lib.profileSettingsPrivateContext(settingsIds[2]));
  await pool.query('UPDATE users SET settings_json=$2 WHERE id=$1',[settingsIds[2],JSON.stringify(invalidSettings)]);
  assert.throws(()=>settingsContract.readProfileSettings(settingsIds[1],encryptedHistoricalSettings),'authenticated flags must be booleans on current reads');
  await assert.rejects(()=>profiles.updateUserProfile(settingsIds[1],{display_name:'Still invalid'}),'current partial writes cannot preserve invalid settings');
  const settingsBefore=(await pool.query('SELECT id,settings_json,profile_private FROM users WHERE id=ANY($1::text[]) ORDER BY id',[settingsIds])).rows;
  const settingsClient=await pool.connect();
  try {
    await assert.rejects(()=>migration.migrateProfileSettingsBatch(settingsClient,'zz-settings',500));
    assert.deepEqual((await pool.query('SELECT id,settings_json,profile_private FROM users WHERE id=ANY($1::text[]) ORDER BY id',[settingsIds])).rows,settingsBefore,'invalid downstream flag rolls back earlier plaintext and same-key conversions');
    await pool.query('UPDATE users SET settings_json=$2 WHERE id=$1',[settingsIds[2],JSON.stringify(settingsContract.encodeProfileSettings(settingsIds[2],{autoNextEpisode:false}))]);
    assert.equal((await migration.migrateProfileSettingsBatch(settingsClient,'zz-settings',500)).changed,2);
    assert.equal((await migration.migrateProfileSettingsBatch(settingsClient,'zz-settings',500)).changed,0,'typed migration replay preserves existing ciphertext');
    const typedRows=(await pool.query('SELECT id,settings_json FROM users WHERE id=ANY($1::text[]) ORDER BY id',[settingsIds])).rows;
    const first=plain(settingsContract.readProfileSettings(typedRows[0].id,typedRows[0].settings_json));
    assert.deepEqual(first,{autoNextEpisode:true,autoSkipIntro:false,preferredAudio:'Original'});
    assert.equal(typeof first.autoNextEpisode,'boolean');
    assert.deepEqual(plain(settingsContract.readProfileSettings(typedRows[1].id,typedRows[1].settings_json)),{telemetryHud:false,usePlayerOnEpisodes:true});
    assert.equal((await profiles.updateUserProfile(settingsIds[0],{settings:{telemetryHud:false}})).settings.autoNextEpisode,true);
  } finally { settingsClient.release(); }
  await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[settingsIds]);
  console.log('Typed profile settings: current read/partial-write rejects string flags; explicit plaintext and same-key migrations produce booleans, preserve text, rollback invalid downstream data and replay without changes.');
  console.log('Private inventory: read-only snapshot, paged activities/addons, typed settings/scores, missing profile, plaintext residue and wrong-owner authentication passed with aggregate-only output.');
  console.log('Private profiles/addons/activity and identity mapping: real disposable PostgreSQL passed encryption, concurrent merges, migrations, concurrent Google signup with UUID, rejection of prefix-only identity, current UUID replay, HMAC rotation, conflict rejection, rollback and cascade. No production migration.');
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  fs.rmSync(temporary, { recursive: true });
}





