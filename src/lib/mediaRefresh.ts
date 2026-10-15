import type { PoolClient } from 'pg';
import { withTransaction } from './postgres';
import { fetchAniListMediaSnapshot, ingestAniListMediaSnapshot } from './anilistMediaIngestion';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clock=(v:number)=>Number.isSafeInteger(v) && v>=0 && v<=8640000000000000;
export interface MediaRefreshJob {aliasId:string;mediaId:number;revision:number;dueAt:number}

/** Discover newly indexed source identities; preserve each existing durable schedule. */
export async function registerMediaRefreshJobs(client:PoolClient,intervalMs:number,dueAt:number) {
 if(!clock(intervalMs) || intervalMs<2100 || !clock(dueAt))throw new Error('Invalid refresh configuration');
 const result=await client.query(`INSERT INTO canonical_media_refresh_jobs(alias_id,interval_ms,due_at)
  SELECT a.id,$1,$2 FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
  WHERE a.namespace='anilist:season' AND a.state='active' AND a.value ~ '^[1-9][0-9]{0,9}$'
   AND CASE WHEN a.value ~ '^[1-9][0-9]{0,9}$' THEN a.value::numeric<=2147483647 ELSE FALSE END
   AND e.kind='SEASON' AND e.visibility='public' ON CONFLICT DO NOTHING`,[intervalMs,dueAt]);
 return result.rowCount??0;
}
export async function readDueMediaRefresh(client:PoolClient,now:number):Promise<MediaRefreshJob|null> {
 if(!clock(now))throw new Error('Invalid refresh clock');
 const row=(await client.query(`SELECT j.*,a.value FROM canonical_media_refresh_jobs j
  JOIN canonical_aliases a ON a.id=j.alias_id JOIN canonical_entities e ON e.id=a.entity_id
  WHERE j.due_at<=$1 AND a.state='active' AND a.namespace='anilist:season' AND e.kind='SEASON' AND e.visibility='public'
   AND NOT EXISTS(SELECT 1 FROM canonical_media_refresh_retries r WHERE r.alias_id=j.alias_id AND r.revision=j.revision AND r.retry_at>$1)
   AND NOT EXISTS(SELECT 1 FROM canonical_media_refresh_retries r WHERE r.rate_limit_until>$1)
   AND NOT EXISTS(SELECT 1 FROM canonical_collection_retries r JOIN canonical_collection_schedules s ON s.id=r.schedule_id
    WHERE s.source_key='anilist:airing-schedule' AND r.rate_limit_until>$1)
  ORDER BY j.due_at,j.alias_id LIMIT 1`,[now])).rows[0];
 return row?{aliasId:row.alias_id,mediaId:Number(row.value),revision:Number(row.revision),dueAt:Number(row.due_at)}:null;
}
function checked(job:MediaRefreshJob) {
 if(!uuid.test(job.aliasId) || !Number.isSafeInteger(job.mediaId) || job.mediaId<1 || job.mediaId>2147483647 ||
  !Number.isSafeInteger(job.revision) || job.revision<0 || !clock(job.dueAt))throw new Error('Invalid refresh identity');
}
/** Network is completed before this transaction. A failed/stale observation cannot advance the job. */
export async function commitMediaRefresh(client:PoolClient,job:MediaRefreshJob,media:any,observedAt:number) {
 checked(job);
 if(!clock(observedAt) || media?.id!==job.mediaId)throw new Error('Invalid refresh observation');
 const current=(await client.query(`SELECT j.*,a.value,a.state,a.namespace FROM canonical_media_refresh_jobs j
  JOIN canonical_aliases a ON a.id=j.alias_id WHERE j.alias_id=$1 FOR UPDATE OF j`,[job.aliasId])).rows[0];
 if(!current || Number(current.revision)!==job.revision || Number(current.due_at)!==job.dueAt ||
  current.state!=='active' || current.namespace!=='anilist:season' || current.value!==String(job.mediaId))throw new Error('Stale media refresh');
 if(observedAt<job.dueAt)throw new Error('Media refresh is not due');
 const dueAt=Math.max(job.dueAt,observedAt)+Number(current.interval_ms);
 if(!clock(dueAt))throw new Error('Refresh clock exhausted');
 const result=await ingestAniListMediaSnapshot(client,media,observedAt);
 const fact=(await client.query(`SELECT value #>> '{}' AS hash FROM canonical_content_facts
  WHERE alias_id=$1 AND source_key='anilist:media' AND field='source.topology.sha256' AND observed_at=$2`,[job.aliasId,observedAt])).rows[0];
 await client.query(`INSERT INTO canonical_media_refresh_receipts(alias_id,revision,observed_at,topology_hash) VALUES($1,$2,$3,$4)`,
  [job.aliasId,job.revision+1,observedAt,fact?.hash]);
 await client.query('UPDATE canonical_media_refresh_jobs SET revision=revision+1,due_at=$2,observed_at=$3 WHERE alias_id=$1',[job.aliasId,dueAt,observedAt]);
 return {...result,revision:job.revision+1,dueAt};
}
export async function collectMediaRefresh(job:MediaRefreshJob,fetcher:typeof fetch) {
 checked(job);
 const snapshot=await fetchAniListMediaSnapshot(job.mediaId,fetcher);
 return withTransaction(client=>commitMediaRefresh(client,job,snapshot.media,snapshot.observedAt));
}
export async function deferMediaRefresh(client:PoolClient,job:MediaRefreshJob,retryAt:number,code:'refresh_failed'|'source_rate_limited') {
 checked(job);
 if(!clock(retryAt) || !['refresh_failed','source_rate_limited'].includes(code))throw new Error('Invalid refresh retry');
 const current=(await client.query('SELECT revision FROM canonical_media_refresh_jobs WHERE alias_id=$1 FOR UPDATE',[job.aliasId])).rows[0];
 if(!current || Number(current.revision)!==job.revision)throw new Error('Stale media refresh');
 await client.query(`INSERT INTO canonical_media_refresh_retries(alias_id,revision,retry_at,failures,code,rate_limit_until)
  VALUES($1,$2,$3::bigint,1,$4,CASE WHEN $4::text='source_rate_limited' THEN $3::bigint ELSE 0::bigint END)
  ON CONFLICT(alias_id,revision) DO UPDATE SET retry_at=GREATEST(canonical_media_refresh_retries.retry_at,EXCLUDED.retry_at),
   failures=canonical_media_refresh_retries.failures+1,code=EXCLUDED.code,
   rate_limit_until=CASE WHEN EXCLUDED.code='source_rate_limited' THEN GREATEST(canonical_media_refresh_retries.retry_at,EXCLUDED.retry_at)
    ELSE canonical_media_refresh_retries.rate_limit_until END`,[job.aliasId,job.revision,retryAt,code]);
}
