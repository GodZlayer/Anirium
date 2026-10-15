import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {projectTypescript} from './lib/project-typescript.mjs';
const target=new URL(process.env.DATABASE_URL);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/anirium_security_fixture');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'anirium-imdb-process-')),source=path.join(temporary,'source.tsv'),packet=path.join(temporary,'input.json');
const runtime=projectTypescript();let activeChild,liveCapture;
async function run(input,interrupt=false,archiveAction){
 fs.writeFileSync(packet,JSON.stringify(input));
 const args=interrupt?['--import',pathToFileURL(path.resolve('scripts/fixtures/imdb-process-interrupt.mjs')).href]:[];
 const command=archiveAction?['scripts/run-imdb-archive.mjs',archiveAction,'--input',packet]:['scripts/import-imdb-file.mjs','--input',packet];
 const child=spawn(process.execPath,[...args,...command],{env:process.env,stdio:['ignore','pipe','pipe']});activeChild=child;
 let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;if(interrupt && stdout.includes('IMDB_TEST_COMMITTED_BEFORE_ACK'))child.kill();});child.stderr.on('data',data=>stderr+=data);
 const timer=setTimeout(()=>child.kill(),45000);
 try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve({code,stdout,stderr,pid:child.pid}));});}
 finally{clearTimeout(timer);activeChild=undefined;}
}
const result=(run,status='committed')=>JSON.parse(run.stdout.split(/\r?\n/).find(line=>line.startsWith(`{"status":"${status}"`)));
try{
 process.env.NODE_ENV='production';const db=runtime.load('src/lib/postgres.ts');await db.ensurePostgresSchema();
 const lifecycle=runtime.load('src/lib/imdbCaptureLifecycle.ts');liveCapture=await lifecycle.createImdbCaptureDirectory();
 const index=runtime.load('src/lib/entityIndex.ts');await index.ensureEntity({namespace:'imdb:title',value:'tt7000000',sourceKey:'fixture:verified'},{kind:'WORK'});
 const header=runtime.load('src/lib/imdbDatasetRows.ts').imdbDatasetHeaders.ratings;
 const text=header+'\n'+Array.from({length:205},(_,i)=>`tt${7000000+i}\t0.0\t0`).join('\n')+'\n';fs.writeFileSync(source,text);
 const input={path:source,dataset:'ratings',compression:'plain',observedAt:25000,maxBatches:1};
 const firstRun=await run(input);assert.equal(firstRun.code,0,firstRun.stderr);const first=result(firstRun);assert.equal(first.nextRow,100);assert.equal(first.appliedCount,1);
 const resumedRun=await run({...input,maxBatches:undefined,expectedManifest:first.manifest});assert.equal(resumedRun.code,0,resumedRun.stderr);
 const resumed=result(resumedRun);assert.equal(resumed.fileId,first.fileId);assert.equal(resumed.nextRow,205);assert.equal(resumed.committedBatches,2);
 const replayRun=await run({...input,expectedManifest:first.manifest});assert.equal(replayRun.code,0,replayRun.stderr);assert.equal(result(replayRun).committedBatches,0);
 const snapshot=()=>db.withTransaction(async client=>({files:(await client.query('SELECT * FROM canonical_dataset_files ORDER BY id')).rows,items:(await client.query('SELECT * FROM canonical_dataset_items ORDER BY file_id,row_number')).rows,batches:(await client.query('SELECT * FROM canonical_dataset_batches ORDER BY file_id,revision')).rows}));
 const before=await snapshot();assert.equal(before.items.length,205);assert.equal(before.batches.length,3);
 fs.writeFileSync(source,text.replace('0.0','1.0'));const changed=await run({...input,expectedManifest:first.manifest});assert.equal(changed.code,1);assert.match(changed.stderr,/file_identity_changed/);assert.deepEqual(await snapshot(),before);
 fs.writeFileSync(source,text+'invalid final row\n');assert.equal((await run(input)).code,1);assert.deepEqual(await snapshot(),before);
 console.log('IMDb CLI separate processes PostgreSQL: first100, second105, third replay0; exact205items/3receipts; changed pinned file and corrupt trailing row rejected without database changes.');
 const interruptedText=header+'\n'+Array.from({length:301},(_,i)=>`tt${7100000+i}\t5.0\t1`).join('\n')+'\n';fs.writeFileSync(source,interruptedText);
 const interruptedInput={...input,observedAt:26000,maxBatches:undefined};
 const interrupted=await run(interruptedInput,true);assert.match(interrupted.stdout,/IMDB_TEST_COMMITTED_BEFORE_ACK/);assert.notEqual(interrupted.code,0);
 const abandoned=fs.readdirSync(lifecycle.imdbCaptureRoot).map(id=>path.join(lifecycle.imdbCaptureRoot,id)).filter(directory=>{try{return JSON.parse(fs.readFileSync(path.join(directory,'lease.json'),'utf8')).pid===interrupted.pid;}catch{return false;}});
 assert.equal(abandoned.length,1,'killed importing process left one owned capture');assert.ok(fs.existsSync(path.join(abandoned[0],'batches.jsonl')));
 const hash=createHash('sha256').update(interruptedText).digest('hex');
 const file=await db.withTransaction(async client=>(await client.query('SELECT * FROM canonical_dataset_files WHERE sha256=$1',[hash])).rows[0]);
 assert.equal(Number(file.next_row),100);assert.equal(Number(file.revision),1);
 const recoveredRun=await run({...interruptedInput,expectedManifest:{dataset:'ratings',compression:'plain',sha256:hash,byteSize:Buffer.byteLength(interruptedText),rowCount:301}});
 assert.equal(recoveredRun.code,0,recoveredRun.stderr);assert.equal(fs.existsSync(abandoned[0]),false,'new process reclaimed dead owned capture');assert.ok(fs.existsSync(liveCapture),'live sibling capture preserved');const recovered=result(recoveredRun);assert.equal(recovered.fileId,file.id);assert.equal(recovered.nextRow,301);assert.equal(recovered.committedBatches,3);
 const recoveredCounts=await db.withTransaction(async client=>({items:(await client.query('SELECT count(*)::int AS n FROM canonical_dataset_items WHERE file_id=$1',[file.id])).rows[0].n,batches:(await client.query('SELECT count(*)::int AS n FROM canonical_dataset_batches WHERE file_id=$1',[file.id])).rows[0].n}));
 assert.deepEqual(recoveredCounts,{items:301,batches:4});
 console.log('IMDb capture lifecycle: actual killed-process spool reclaimed on restart and live sibling preserved.');
 console.log('IMDb abrupt process termination PostgreSQL: server committed100 before withheld acknowledgement, process killed, new process recovered same identity and remaining201 with exact301items/4receipts.');
 const archiveModule=runtime.load('src/lib/imdbIndexedArchive.ts'),archiveStore=runtime.load('src/lib/imdbIndexedArchiveStore.ts'),fileStore=runtime.load('src/lib/imdbDatasetFile.ts');
 const archiveRoot=path.join(temporary,'archive-root');
 const archiveText=header+'\n'+Array.from({length:205},(_,i)=>`tt${7200000+i}\t0.0\t0`).join('\n')+'\n';fs.writeFileSync(source,archiveText);
 const prepared=await archiveModule.prepareImdbIndexedArchive(source,{dataset:'ratings',compression:'plain'},archiveRoot);
 const filesBefore=(await snapshot()).files.length;
 await assert.rejects(()=>db.withTransaction(async client=>{const file=await fileStore.registerImdbDatasetFile(client,prepared.manifest,27000);await archiveStore.registerImdbIndexedArchiveDescriptor(client,file.id,prepared);throw new Error('archive downstream rollback');}),/downstream rollback/);
 assert.equal((await snapshot()).files.length,filesBefore);
 const registered=await db.withTransaction(async client=>{const file=await fileStore.registerImdbDatasetFile(client,prepared.manifest,27000);await archiveStore.registerImdbIndexedArchiveDescriptor(client,file.id,prepared);return file;});
 assert.deepEqual(JSON.parse(JSON.stringify(await db.withTransaction(client=>archiveStore.readImdbIndexedArchiveDescriptor(client,registered.id)))),JSON.parse(JSON.stringify(prepared)));
 assert.deepEqual(JSON.parse(JSON.stringify(await db.withTransaction(client=>archiveStore.registerImdbIndexedArchiveDescriptor(client,registered.id,prepared)))),JSON.parse(JSON.stringify(prepared)));
 await assert.rejects(()=>db.withTransaction(client=>archiveStore.registerImdbIndexedArchiveDescriptor(client,registered.id,{...prepared,indexSha256:'0'.repeat(64)})),/Conflicting/);
 await assert.rejects(()=>db.withTransaction(client=>archiveStore.registerImdbIndexedArchiveDescriptor(client,registered.id,{...prepared,manifest:{...prepared.manifest,rowCount:204}})),/source manifest mismatch/);
 await assert.rejects(()=>db.withTransaction(client=>client.query('INSERT INTO canonical_dataset_archives(file_id,directory_id,index_sha256,index_byte_size,data_byte_size,batch_count) VALUES($1,$2,$3,100,100,1)',[registered.id,prepared.directoryId,prepared.indexSha256])),/batch coverage/);
 for(const sql of ['UPDATE canonical_dataset_archives SET index_sha256=index_sha256 WHERE file_id=$1','DELETE FROM canonical_dataset_archives WHERE file_id=$1'])await assert.rejects(()=>db.withTransaction(client=>client.query(sql,[registered.id])),/immutable/);
 await assert.rejects(()=>db.withTransaction(client=>client.query('TRUNCATE canonical_dataset_archives')),/immutable/);
 fs.unlinkSync(source);
 const batchModule=runtime.load('src/lib/imdbDatasetBatch.ts');
 for await(const block of archiveModule.readImdbIndexedArchive(archiveRoot,prepared)){await db.withTransaction(client=>batchModule.commitImdbDatasetBatch(client,registered.id,0,block.lines));break;}
 const pinned=await db.withTransaction(client=>archiveStore.readImdbIndexedArchiveDescriptor(client,registered.id));let revision=1;
 for await(const block of archiveModule.readImdbIndexedArchive(archiveRoot,pinned,100)){await db.withTransaction(client=>batchModule.commitImdbDatasetBatch(client,registered.id,revision++,block.lines));}
 const archivedFile=(await snapshot()).files.find(file=>file.id===registered.id);assert.equal(Number(archivedFile.next_row),205);assert.equal(Number(archivedFile.revision),3);
 console.log('IMDb indexed archive PostgreSQL: descriptor manifest equality/replay/conflict/raw coverage/immutability and transactional rollback, SQL-pinned descriptor resumes physical blocks without source file, exact205 committed rows/3revisions. CLI integration and physical backup remain pending.');
 const cliArchiveRoot=path.join(temporary,'cli-archive-root');
 await index.ensureEntity({namespace:'imdb:title',value:'tt7300000',sourceKey:'fixture:verified'},{kind:'WORK'});
 const cliText=header+'\n'+Array.from({length:205},(_,i)=>`tt${7300000+i}\t0.0\t0`).join('\n')+'\n';fs.writeFileSync(source,cliText);
 const cliPreparedRun=await run({path:source,dataset:'ratings',compression:'plain',observedAt:28000,archiveRoot:cliArchiveRoot},false,'--prepare');
 assert.equal(cliPreparedRun.code,0,cliPreparedRun.stderr);const cliPrepared=result(cliPreparedRun,'prepared');assert.equal(cliPrepared.nextRow,0);
 const cliResumeInput={fileId:cliPrepared.fileId,archiveRoot:cliArchiveRoot,maxBatches:1};
 const cliFirstRun=await run(cliResumeInput,false,'--resume');assert.equal(cliFirstRun.code,0,cliFirstRun.stderr);assert.equal(result(cliFirstRun).nextRow,100);assert.equal(result(cliFirstRun).appliedCount,1);
 fs.unlinkSync(source);
 const cliRestRun=await run({...cliResumeInput,maxBatches:undefined},false,'--resume');assert.equal(cliRestRun.code,0,cliRestRun.stderr);assert.equal(result(cliRestRun).nextRow,205);assert.equal(result(cliRestRun).committedBatches,2);
 const cliReplayRun=await run(cliResumeInput,false,'--resume');assert.equal(cliReplayRun.code,0,cliReplayRun.stderr);assert.equal(result(cliReplayRun).committedBatches,0);
 const pinnedIndex=path.join(cliArchiveRoot,cliPrepared.archive.directoryId,'index.jsonl'),indexOriginal=fs.readFileSync(pinnedIndex);
 const snapshotBeforeCorruption=await snapshot();
 fs.writeFileSync(pinnedIndex,indexOriginal.toString().replace(/"sha256":"[0-9a-f]{64}"/,`"sha256":"${'0'.repeat(64)}"`));
 assert.equal((await run(cliResumeInput,false,'--resume')).code,1);assert.deepEqual(await snapshot(),snapshotBeforeCorruption);fs.writeFileSync(pinnedIndex,indexOriginal);
 console.log('IMDb persistent archive CLI separate processes: prepare0, resume100 with known typed zero, original source removed, resume105, replay0, altered SQL-pinned index rejects without record changes.');
 const killedText=header+'\n'+Array.from({length:301},(_,i)=>`tt${7400000+i}\t5.0\t1`).join('\n')+'\n';fs.writeFileSync(source,killedText);
 const killedPrepareRun=await run({path:source,dataset:'ratings',compression:'plain',observedAt:29000,archiveRoot:cliArchiveRoot},false,'--prepare');assert.equal(killedPrepareRun.code,0,killedPrepareRun.stderr);
 const killedPrepared=result(killedPrepareRun,'prepared');fs.unlinkSync(source);
 const killedResumeInput={fileId:killedPrepared.fileId,archiveRoot:cliArchiveRoot};
 const killedResume=await run(killedResumeInput,true,'--resume');assert.match(killedResume.stdout,/IMDB_TEST_COMMITTED_BEFORE_ACK/);assert.notEqual(killedResume.code,0);
 const killedState=(await snapshot()).files.find(file=>file.id===killedPrepared.fileId);assert.equal(Number(killedState.next_row),100);
 const recoveredArchiveRun=await run(killedResumeInput,false,'--resume');assert.equal(recoveredArchiveRun.code,0,recoveredArchiveRun.stderr);assert.equal(result(recoveredArchiveRun).nextRow,301);assert.equal(result(recoveredArchiveRun).committedBatches,3);
 console.log('IMDb persistent archive CLI abrupt kill: source absent,100 acknowledged-lost committed rows recovered by next process with remaining201, full301 rows and revision4.');



}finally{activeChild?.kill();if(liveCapture)await runtime.load('src/lib/imdbCaptureLifecycle.ts').releaseImdbCaptureDirectory(liveCapture);await runtime.close();fs.rmSync(temporary,{recursive:true,force:true});}
