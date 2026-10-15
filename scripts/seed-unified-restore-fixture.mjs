import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectTypescript} from './lib/project-typescript.mjs';
import {mediaDetailsFixture} from './fixtures/media-details.mjs';
const target=new URL(process.env.DATABASE_URL);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/anirium_security_fixture');
process.env.NODE_ENV='production';
const runtime=projectTypescript();
try {
  const db=runtime.load('src/lib/postgres.ts'),index=runtime.load('src/lib/entityIndex.ts'),arcs=runtime.load('src/lib/arcIndex.ts');
  const collection=runtime.load('src/lib/collectionWindow.ts'),schedule=runtime.load('src/lib/collectionSchedule.ts');
  const facts=runtime.load('src/lib/contentFacts.ts'),info=runtime.load('src/lib/contentEntityInfo.ts');
  const refresh=runtime.load('src/lib/mediaRefresh.ts'),media=runtime.load('src/lib/anilistMediaIngestion.ts');
  await db.ensurePostgresSchema();
  const pendingId='af000000-0000-4000-8000-000000000001',completeId='af000000-0000-4000-8000-000000000002';
  const fixture=await db.withTransaction(async client=>{
    const imdb=runtime.load('src/lib/imdbDatasetBatch.ts');
    await index.ensureEntity({namespace:'imdb:title',value:'tt5555555',sourceKey:'fixture:proven-imdb'},{kind:'WORK'},client);
    await index.ensureEntity({namespace:'imdb:title',value:'tt4444444',sourceKey:'fixture:proven-imdb'},{kind:'WORK'},client);
    const file=(await client.query("INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at) VALUES('ratings','plain',$1,120,3,1000) RETURNING id",['d'.repeat(64)])).rows[0];
    await imdb.commitImdbDatasetBatch(client,file.id,0,['tt5555555\t0.0\t0','tt3333333\t7\t2']);
    const archiveData='tt5555555\t0.0\t0\ntt3333333\t7\t2\ntt4444444\t8.5\t10\n';
    const archiveIndex=JSON.stringify({startRow:1,endRow:3,offset:0,length:Buffer.byteLength(archiveData),sha256:createHash('sha256').update(archiveData).digest('hex')})+'\n';
    await runtime.load('src/lib/imdbIndexedArchiveStore.ts').registerImdbIndexedArchiveDescriptor(client,file.id,{
      directoryId:'af000000-0000-4000-8000-000000000007',manifest:{dataset:'ratings',compression:'plain',sha256:'d'.repeat(64),byteSize:120,rowCount:3},
      indexSha256:createHash('sha256').update(archiveIndex).digest('hex'),indexByteSize:Buffer.byteLength(archiveIndex),dataByteSize:Buffer.byteLength(archiveData),batchCount:1});
    // SQL descriptor fixture only: no physical archive is asserted or exported by pg_dump.

    const sourceSnapshot=id=>({...mediaDetailsFixture(),id,idMal:null,type:'ANIME',format:'TV',episodes:12,status:'RELEASING',averageScore:0,countryOfOrigin:'JP',
      title:{romaji:'Atualização restaurável',english:null,native:'更新'},relations:{pageInfo:{hasNextPage:false},edges:[]}});
    await media.ingestAniListMediaSnapshot(client,sourceSnapshot(940010),1000);
    await media.ingestAniListMediaSnapshot(client,sourceSnapshot(940011),1000);
    await refresh.registerMediaRefreshJobs(client,3000,1000);
    const refreshAlias=(await client.query("SELECT id FROM canonical_aliases WHERE namespace='anilist:season' AND value='940010' AND state='active'")).rows[0].id;
    await refresh.commitMediaRefresh(client,{aliasId:refreshAlias,mediaId:940010,revision:0,dueAt:1000},sourceSnapshot(940010),2000);
    await refresh.deferMediaRefresh(client,{aliasId:refreshAlias,mediaId:940010,revision:1,dueAt:5000},24000,'refresh_failed');
    const make=(kind,value)=>index.ensureEntity({namespace:'restore:unified',value,sourceKey:'fixture'},{kind},client);
    const universe=await make('UNIVERSE','universe'),work=await make('WORK','work'),season=await make('SEASON','season');
    await index.linkContentEntities(client,universe.id,work.id,0,'fixture');
    await index.linkContentEntities(client,work.id,season.id,0,'fixture');
    await index.bindEntityAlias(season.id,{namespace:'anilist:season',value:'940002',sourceKey:'fixture:verified-season'},client);
    const arc=await arcs.registerArc(client,universe.id,{namespace:'restore:unified',value:'arc',sourceKey:'fixture'});
    await schedule.registerCollectionSchedule(client,{id:pendingId,start:1000,windowMs:10000,intervalMs:3000,lookbackMs:2000,dueAt:0});
    await collection.startAiringCollection(client,`schedule:${pendingId}:0`,1000,11000);
    const batch=await collection.acceptAiringCollectionPage(client,{scope:`schedule:${pendingId}:0`,page:1,observedAt:1000,hasMore:true,entries:[{id:940001,mediaId:940002,episode:1,airingAt:2}]});
    const episodeId=batch.episodeIds[0];
    await arcs.linkArcEpisode(client,arc.id,episodeId,0,'fixture');
    for(const entity of [universe,work,season,arc,{id:episodeId}])await info.setContentEntityTexts(client,entity.id,[{field:'title',locale:'pt-br',form:'default',sourceKey:'fixture',value:'Informação própria restaurável'}]);
    await facts.recordContentFacts(client,work.id,{namespace:'restore:unified',externalId:'work',sourceKey:'fixture',observedAt:1000},[
      {field:'restore.score',type:'number',value:0},{field:'restore.enabled',type:'boolean',value:false},
      {field:'restore.note',type:'string',value:'Dados próprios 日本語'},{field:'restore.absent',type:'null',value:null}]);
    await facts.recordEpisodeAiring(client,episodeId,{namespace:'anilist:airing-schedule',externalId:'940001',sourceKey:'anilist:airing-schedule',observedAt:2000},4000,false);
    await schedule.deferCollectionSchedule(client,pendingId,0,120000,'collection_failed');
    await schedule.registerCollectionSchedule(client,{id:completeId,start:1000,windowMs:10000,intervalMs:3000,lookbackMs:0,dueAt:0});
    await collection.startAiringCollection(client,`schedule:${completeId}:0`,1000,11000);
    await collection.acceptAiringCollectionPage(client,{scope:`schedule:${completeId}:0`,page:1,observedAt:1000,hasMore:false,entries:[]});
    await schedule.advanceCollectionSchedule(client,completeId,0,3000);
    return {arcId:arc.id};
  });
  await runtime.load('src/lib/privateActivity.ts').writeActivity('runtime-owner','ARC',fixture.arcId,{status:'on_hold',completed:false},{user_score:0,user_opinion:'Opinião ARC restaurável'});
  assert.equal(await runtime.load('src/lib/userProfiles.ts').toggleEntityBookmark('runtime-owner','ARC',fixture.arcId),true);
  const writer=runtime.load('src/lib/entityCommentWriter.ts');
  const parent=await writer.insertEntityComment('runtime-owner',{entityType:'ARC',entityId:fixture.arcId,content:'Raiz ARC restaurável',isSpoiler:false});
  await writer.insertEntityComment('runtime-other',{entityType:'ARC',entityId:fixture.arcId,parentCommentId:parent.id,content:'Resposta ARC restaurável',isSpoiler:true});
  console.log('Unified restore fixture populated: ARC hierarchy/texts/account ciphertext/comments, typed fact history/heads, ingestion manifests/checkpoints/pages, pending/completed windows, schedules and retries. Controlled fixture, no source egress.');
} finally {await runtime.close();}
