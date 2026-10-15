import { withTransaction } from "./postgres";
import { startAiringCollection, acceptAiringCollectionPage } from "./collectionWindow";
import type { AniListAiringEntry } from "./airingIngestion";
import { fetchAniListMediaSnapshot, ingestAniListMediaSnapshot } from './anilistMediaIngestion';
import { setTimeout as wait } from 'node:timers/promises';
const positive=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v) && v>0 && v<=2147483647;

function checkedBounds(start:number,end:number,pageSize:number) {
  if(!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end<=start ||
    !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>50 || start%1000!==0 || end%1000!==0 ||
    start<1000 || end/1000>2147483647) throw new Error('Invalid AniList collection bounds');
}
export async function fetchAniListAiringPage(input:{start:number;end:number;pageSize:number;page:number},fetcher:typeof fetch) {
  const {pageSize,page}=input;
  checkedBounds(input.start,input.end,pageSize);
  if(!positive(page)) throw new Error('Invalid AniList collection page');
  const observedAt=Date.now();
  const response=await fetcher('https://graphql.anilist.co', {method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({
    query:`query OwnAiringWindow($page:Int,$perPage:Int,$start:Int,$end:Int) {
      Page(page:$page,perPage:$perPage) { pageInfo { currentPage perPage hasNextPage }
        airingSchedules(airingAt_greater:$start,airingAt_lesser:$end,sort:TIME) { id mediaId episode airingAt }
      }
    }`,variables:{page,perPage:pageSize,start:input.start/1000-1,end:input.end/1000}})});
  if(!response.ok) {
    const error=new Error(response.status===429?'Airing source rate limited':'Airing source HTTP failure');
    Object.assign(error,{status:response.status,retryAfter:response.headers.get('Retry-After')});
    throw error;
  }
  const body=await response.json();
  const info=body?.data?.Page?.pageInfo,entries:unknown=body?.data?.Page?.airingSchedules;
  if(body?.errors?.length || info?.currentPage!==page || info?.perPage!==pageSize || typeof info?.hasNextPage!=='boolean' ||
    !Array.isArray(entries) || entries.length>pageSize || (info.hasNextPage && entries.length===0)) throw new Error('Invalid airing source page response');
  const seen=new Set<number>();
  for(const entry of entries) {
    if(!entry || !positive(entry.id) || !positive(entry.mediaId) || !positive(entry.episode) || typeof entry.airingAt!=='number' ||
      !Number.isSafeInteger(entry.airingAt) || entry.airingAt*1000<input.start || entry.airingAt*1000>=input.end || seen.has(entry.id)) throw new Error('Invalid airing source page entry');
    seen.add(entry.id);
  }
  return {observedAt,hasMore:info.hasNextPage as boolean,entries:entries as AniListAiringEntry[]};
}

/** One pending page per invocation. Network work never holds a database transaction. */
export async function collectAiringWindowPage(input:{scope:string;start:number;end:number;pageSize?:number},fetcher:typeof fetch) {
  const pageSize=input.pageSize??50;
  checkedBounds(input.start,input.end,pageSize);
  const window=await withTransaction(client=>startAiringCollection(client,input.scope,input.start,input.end,pageSize));
  if(window.status==='complete') return {status:'complete' as const,page:window.next_page-1,received:0};
  const page=window.next_page;
  const source=await fetchAniListAiringPage({...input,pageSize,page},fetcher);
  const mediaIds=[...new Set(source.entries.map(entry=>String(entry.mediaId)))];
  const known=await withTransaction(async client=>(await client.query<{value:string}>(`SELECT DISTINCT a.value FROM canonical_aliases a
    JOIN canonical_entities e ON e.id=a.entity_id
    JOIN canonical_memberships w ON w.child_id=e.id AND w.parent_kind='WORK' AND w.child_kind='SEASON'
    JOIN canonical_entities work ON work.id=w.parent_id AND work.visibility='public'
    JOIN canonical_memberships u ON u.child_id=work.id AND u.parent_kind='UNIVERSE' AND u.child_kind='WORK'
    JOIN canonical_entities universe ON universe.id=u.parent_id AND universe.visibility='public'
    WHERE a.namespace='anilist:season' AND a.value=ANY($1::text[])
      AND a.state='active' AND e.kind='SEASON' AND e.visibility='public'`,[mediaIds])).rows.map(row=>row.value));
  const snapshots:Awaited<ReturnType<typeof fetchAniListMediaSnapshot>>[]=[];
  for(const id of mediaIds.filter(id=>!known.includes(id))) {
    await wait(2100);
    snapshots.push(await fetchAniListMediaSnapshot(Number(id),fetcher));
  }
  await withTransaction(async client=>{
    if(snapshots.length) {
      // Match the native page order: window -> checkpoint -> hierarchy -> aliases.
      const current=(await client.query("SELECT next_page,status FROM canonical_collection_windows WHERE source_key='anilist:airing-schedule' AND scope=$1 FOR UPDATE",[input.scope])).rows[0];
      if(!current || current.next_page!==page || current.status!=='collecting')throw new Error('Stale collection page');
      await client.query("SELECT revision FROM canonical_ingestion_checkpoints WHERE source_key='anilist:airing-schedule' AND scope=$1 FOR UPDATE",[input.scope]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
      for(const snapshot of snapshots)await ingestAniListMediaSnapshot(client,snapshot.media,snapshot.observedAt);
    }
    await acceptAiringCollectionPage(client,{scope:input.scope,page,...source});
  });
  return {status:source.hasMore?'collecting' as const:'complete' as const,page,received:source.entries.length};
}
