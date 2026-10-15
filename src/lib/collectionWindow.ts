import type { PoolClient } from "pg";
import { ingestAniListAiringBatch, type AniListAiringEntry } from "./airingIngestion";
const sourceKey='anilist:airing-schedule';
export async function startAiringCollection(client:PoolClient,scope:string,start:number,end:number,pageSize=50) {
  if(typeof scope!=='string' || !scope.trim() || scope.length>200 || scope.includes('\0') ||
    !Number.isSafeInteger(start) || start<0 || !Number.isSafeInteger(end) || end<=start || end>8640000000000000 ||
    !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>500) throw new Error('Invalid collection window');
  await client.query('INSERT INTO canonical_ingestion_checkpoints(source_key,scope) VALUES($1,$2) ON CONFLICT DO NOTHING',[sourceKey,scope]);
  await client.query(`INSERT INTO canonical_collection_windows(source_key,scope,window_start,window_end,page_size) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[sourceKey,scope,start,end,pageSize]);
  const window=(await client.query('SELECT * FROM canonical_collection_windows WHERE source_key=$1 AND scope=$2 FOR UPDATE',[sourceKey,scope])).rows[0];
  if(Number(window.window_start)!==start || Number(window.window_end)!==end || window.page_size!==pageSize) throw new Error('Collection window identity conflict');
  return {...window,window_start:Number(window.window_start),window_end:Number(window.window_end)};
}
export async function acceptAiringCollectionPage(client:PoolClient,input:{scope:string;page:number;observedAt:number;hasMore:boolean;entries:readonly AniListAiringEntry[]}) {
  if(typeof input.hasMore!=='boolean' || !Number.isSafeInteger(input.page) || input.page<1) throw new Error('Invalid collection page');
  const window=(await client.query('SELECT * FROM canonical_collection_windows WHERE source_key=$1 AND scope=$2 FOR UPDATE',[sourceKey,input.scope])).rows[0];
  if(!window || window.status!=='collecting' || window.next_page!==input.page) throw new Error('Stale collection page');
  const result=await ingestAniListAiringBatch(client,{scope:input.scope,expectedRevision:window.checkpoint_revision,
    nextCursor:JSON.stringify({page:input.page+1}),observedAt:input.observedAt,entries:input.entries});
  await client.query(`INSERT INTO canonical_collection_pages(source_key,scope,page,checkpoint_revision,has_more) VALUES($1,$2,$3,$4,$5)`,[sourceKey,input.scope,input.page,result.revision,input.hasMore]);
  await client.query(`UPDATE canonical_collection_windows SET next_page=next_page+1,checkpoint_revision=$3,status=$4 WHERE source_key=$1 AND scope=$2`,[sourceKey,input.scope,result.revision,input.hasMore?'collecting':'complete']);
  return result;
}
