import type { PoolClient } from "pg";

export interface CollectionScheduleInput {
  id: string; start: number; windowMs: number; intervalMs: number; lookbackMs: number; dueAt: number;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function registerCollectionSchedule(client:PoolClient,input:CollectionScheduleInput) {
  if(!uuid.test(input.id) || ![input.start,input.windowMs,input.intervalMs,input.lookbackMs,input.dueAt].every(Number.isSafeInteger) ||
    input.start<1000 || input.start%1000 || input.windowMs<1000 || input.windowMs%1000 || input.intervalMs<2100 ||
    input.lookbackMs<0 || input.lookbackMs>=input.windowMs || input.lookbackMs%1000 || input.dueAt<0 || input.start+input.windowMs>2147483647000)
    throw new Error('Invalid collection schedule');
  await client.query(`INSERT INTO canonical_collection_schedules(id,source_key,initial_start,window_ms,interval_ms,lookback_ms,next_start,due_at)
    VALUES($1,'anilist:airing-schedule',$2,$3,$4,$5,$2,$6) ON CONFLICT DO NOTHING`,[input.id,input.start,input.windowMs,input.intervalMs,input.lookbackMs,input.dueAt]);
  const row=(await client.query('SELECT * FROM canonical_collection_schedules WHERE id=$1',[input.id])).rows[0];
  if(Number(row.initial_start)!==input.start || Number(row.window_ms)!==input.windowMs || Number(row.interval_ms)!==input.intervalMs || Number(row.lookback_ms)!==input.lookbackMs)
    throw new Error('Collection schedule identity conflict');
  return row.id as string;
}
/** The pending window identity is durable; concurrent readers are resolved by page/checkpoint locks. */
export async function readDueCollectionSchedule(client:PoolClient,now:number) {
  if(!Number.isSafeInteger(now) || now<0) throw new Error('Invalid collection clock');
  const row=(await client.query(`SELECT s.* FROM canonical_collection_schedules s WHERE s.due_at<=$1
    AND NOT EXISTS(SELECT 1 FROM canonical_collection_retries r WHERE r.schedule_id=s.id AND r.sequence=s.sequence AND r.retry_at>$1)
    AND NOT EXISTS(SELECT 1 FROM canonical_collection_retries r JOIN canonical_collection_schedules origin ON origin.id=r.schedule_id
      WHERE origin.source_key=s.source_key AND r.rate_limit_until>$1)
    AND NOT EXISTS(SELECT 1 FROM canonical_media_refresh_retries r WHERE r.rate_limit_until>$1)
    ORDER BY s.due_at,s.id LIMIT 1`,[now])).rows[0];
  return row ? {id:row.id as string,sequence:Number(row.sequence),scope:`schedule:${row.id}:${row.sequence}`,start:Number(row.next_start),end:Number(row.next_start)+Number(row.window_ms)} : null;
}
export function collectionRetryAt(now:number,retryAfter:unknown) {
  if(!Number.isSafeInteger(now) || now<0 || now>8640000000000000-60000) throw new Error('Invalid retry clock');
  let requested=now+60000;
  if(typeof retryAfter==='string' && retryAfter.trim()) {
    const value=retryAfter.trim();
    if(/^\d+$/.test(value)) {
      const seconds=Number(value);
      if(Number.isSafeInteger(seconds) && seconds<=Math.floor((8640000000000000-now)/1000)) requested=now+seconds*1000;
      else requested=8640000000000000;
    } else {
      const instant=Date.parse(value);
      if(Number.isFinite(instant))requested=instant;
    }
  }
  return Math.max(now+60000,requested);
}
export async function deferCollectionSchedule(client:PoolClient,id:string,sequence:number,retryAt:number,code:'collection_failed'|'source_rate_limited') {
  if(!uuid.test(id) || !Number.isSafeInteger(sequence) || sequence<0 || !Number.isSafeInteger(retryAt) || retryAt<0 || retryAt>8640000000000000 ||
    !['collection_failed','source_rate_limited'].includes(code))throw new Error('Invalid collection retry');
  const row=(await client.query('SELECT sequence FROM canonical_collection_schedules WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row || Number(row.sequence)!==sequence)throw new Error('Stale collection retry');
  await client.query(`INSERT INTO canonical_collection_retries(schedule_id,sequence,retry_at,failures,code,rate_limit_until)
    VALUES($1,$2,$3::bigint,1,$4,CASE WHEN $4::text='source_rate_limited' THEN $3::bigint ELSE 0::bigint END)
    ON CONFLICT(schedule_id,sequence) DO UPDATE SET retry_at=GREATEST(canonical_collection_retries.retry_at,EXCLUDED.retry_at),
      failures=canonical_collection_retries.failures+1,
      rate_limit_until=CASE WHEN EXCLUDED.code='source_rate_limited' THEN GREATEST(canonical_collection_retries.retry_at,EXCLUDED.retry_at)
        ELSE canonical_collection_retries.rate_limit_until END,
      code=EXCLUDED.code`,[id,sequence,retryAt,code]);
}
export async function advanceCollectionSchedule(client:PoolClient,id:string,sequence:number,now:number) {
  if(!uuid.test(id) || !Number.isSafeInteger(sequence) || sequence<0 || !Number.isSafeInteger(now) || now<0) throw new Error('Invalid schedule advance');
  const result=await client.query(`UPDATE canonical_collection_schedules SET sequence=sequence+1,next_start=next_start+window_ms-lookback_ms,
    due_at=GREATEST(due_at+interval_ms,$3+interval_ms) WHERE id=$1 AND sequence=$2 RETURNING id`,[id,sequence,now]);
  if(!result.rowCount) throw new Error('Stale collection schedule');
}
