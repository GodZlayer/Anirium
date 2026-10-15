import type { PoolClient } from "pg";
import { resolveEntityAlias, bindEntityAlias } from "./entityIndex";
import { ensureReleaseEpisode } from "./catalogReleaseIdentity";
import { recordEpisodeAiring } from "./contentFacts";

export interface AniListAiringEntry {id:number;mediaId:number;episode:number;airingAt:number;}
const sourceKey="anilist:airing-schedule";
const validText=(v:unknown,max:number)=>typeof v==='string' && !!v.trim() && v.length<=max && !v.includes('\0');
const positive=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v) && v>0 && v<=2147483647;

/** Caller commits this transaction. A missing identity rejects the entire page, never skips it. */
export async function ingestAniListAiringBatch(client:PoolClient,input:{scope:string;expectedRevision:number;nextCursor:string;observedAt:number;entries:readonly AniListAiringEntry[]}) {
  if(!validText(input.scope,200) || !validText(input.nextCursor,2000) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<0 || input.expectedRevision>=2147483647 ||
    !Number.isSafeInteger(input.observedAt) || input.observedAt<0 || input.observedAt>8640000000000000 || !Array.isArray(input.entries) || input.entries.length>500) throw new Error('Invalid airing ingestion batch');
  const seen=new Set<number>();
  for(const entry of input.entries) {
    if(!entry || !positive(entry.id) || !positive(entry.mediaId) || !positive(entry.episode) || typeof entry.airingAt!=='number' || !Number.isSafeInteger(entry.airingAt) || entry.airingAt<0 || entry.airingAt>8640000000000 || seen.has(entry.id)) throw new Error('Invalid airing ingestion entry');
    seen.add(entry.id);
  }
  await client.query(`INSERT INTO canonical_ingestion_checkpoints(source_key,scope) VALUES($1,$2) ON CONFLICT DO NOTHING`,[sourceKey,input.scope]);
  const checkpoint=(await client.query<{revision:number;observed_at:string|null}>(`SELECT revision,observed_at FROM canonical_ingestion_checkpoints WHERE source_key=$1 AND scope=$2 FOR UPDATE`,[sourceKey,input.scope])).rows[0];
  if(checkpoint.revision!==input.expectedRevision) throw new Error('Stale ingestion checkpoint');
  if(checkpoint.observed_at!==null && input.observedAt<Number(checkpoint.observed_at)) throw new Error('Older ingestion observation');
  // Match hierarchy lock order before creating release identities.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
  const revision=checkpoint.revision+1;
  const payload=input.entries.map(entry=>({id:String(entry.id),mediaId:String(entry.mediaId),episode:entry.episode,scheduledAt:entry.airingAt*1000}));
  await client.query(`INSERT INTO canonical_ingestion_batches(source_key,scope,revision,observed_at,entry_count,payload,payload_hash)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,encode(sha256(convert_to(($6::jsonb)::text,'UTF8')),'hex'))`,[sourceKey,input.scope,revision,input.observedAt,payload.length,JSON.stringify(payload)]);
  const episodeIds:string[]=[];
  for(const entry of input.entries) {
    const season=await resolveEntityAlias(client,'anilist:season',String(entry.mediaId),null);
    if(!season || season.kind!=='SEASON') throw new Error('Airing season identity unavailable');
    const episodeId=await ensureReleaseEpisode(client,season.id,entry.episode);
    await bindEntityAlias(episodeId,{namespace:sourceKey,value:String(entry.id),sourceKey},client);
    await recordEpisodeAiring(client,episodeId,{namespace:sourceKey,externalId:String(entry.id),sourceKey,observedAt:input.observedAt},entry.airingAt*1000,false);
    await client.query(`INSERT INTO canonical_ingestion_batch_items(source_key,scope,revision,entity_id,alias_id,season_alias_id,observed_at,entry)
      SELECT $1,$2,$3,$4,a.id,s.id,$5,$6::jsonb FROM canonical_aliases a,canonical_aliases s
      WHERE a.namespace=$1 AND a.value=$7 AND a.entity_id=$4 AND a.state='active'
        AND s.namespace='anilist:season' AND s.value=$8 AND s.entity_id=$9 AND s.state='active'`,
      [sourceKey,input.scope,revision,episodeId,input.observedAt,JSON.stringify({id:String(entry.id),mediaId:String(entry.mediaId),episode:entry.episode,scheduledAt:entry.airingAt*1000}),String(entry.id),String(entry.mediaId),season.id]);
    episodeIds.push(episodeId);
  }
  const updated=(await client.query<{revision:number;cursor:string}>(`UPDATE canonical_ingestion_checkpoints SET cursor=$3,revision=revision+1,observed_at=$4
    WHERE source_key=$1 AND scope=$2 RETURNING revision,cursor`,[sourceKey,input.scope,input.nextCursor,input.observedAt])).rows[0];
  return {...updated,episodeIds};
}

export async function readAiringIngestionCheckpoint(client:PoolClient,scope:string) {
  if(!validText(scope,200)) throw new Error('Invalid ingestion scope');
  return (await client.query<{cursor:string|null;revision:number}>(`SELECT cursor,revision FROM canonical_ingestion_checkpoints WHERE source_key=$1 AND scope=$2`,[sourceKey,scope])).rows[0] ?? {cursor:null,revision:0};
}
