import type { PoolClient } from 'pg';
import { readCanonicalAiringPage } from './canonicalAiringReader';

type PageInput=Parameters<typeof readCanonicalAiringPage>[1];
export interface CanonicalAiringWeekInput {
  now:number; timeZone:string; sourceKey:string; limit?:number; after?:PageInput['after'];
}

/** A source-specific schedule, not a claim of streaming availability. Caller supplies the clock. */
export async function readCanonicalAiringWeek(client:PoolClient,input:CanonicalAiringWeekInput) {
  if(!input || !Number.isSafeInteger(input.now) || input.now<0 || input.now>253402214399999 ||
    typeof input.timeZone!=='string' || input.timeZone.length>100 || !input.timeZone || input.timeZone.includes('\0') ||
    typeof input.sourceKey!=='string' || !input.sourceKey.trim() || input.sourceKey.length>200 || input.sourceKey.includes('\0') ||
    (input.limit!==undefined && (!Number.isSafeInteger(input.limit) || input.limit<1 || input.limit>500)) ||
    input.after===null)
    throw new Error('Invalid canonical airing week');
  const bounds=(await client.query<{start:number;end:number;localToday:string}>(`
    WITH clock AS (SELECT (TIMESTAMPTZ 'epoch'+$1::bigint*INTERVAL '1 millisecond') AT TIME ZONE name AS local_now,name
      FROM pg_timezone_names WHERE name=$2), week AS (
      SELECT date_trunc('week',local_now) AS monday,local_now,name FROM clock)
    SELECT (extract(epoch FROM monday AT TIME ZONE name)*1000)::double precision AS start,
      (extract(epoch FROM (monday+INTERVAL '7 days') AT TIME ZONE name)*1000)::double precision AS end,
      to_char(local_now,'YYYY-MM-DD') AS "localToday" FROM week`,[input.now,input.timeZone])).rows[0];
  if(!bounds)throw new Error('Invalid canonical airing time zone');
  const page=await readCanonicalAiringPage(client,{start:Math.max(0,bounds.start),end:bounds.end,
    sourceKey:input.sourceKey,limit:input.limit,after:input.after});
  const dates=(await client.query<{at:number;localDate:string}>(`
    SELECT at::double precision AS at,to_char((TIMESTAMPTZ 'epoch'+at*INTERVAL '1 millisecond') AT TIME ZONE $2,'YYYY-MM-DD') AS "localDate"
    FROM unnest($1::bigint[]) AS at`,[page.items.map(item=>item.scheduledAt),input.timeZone])).rows;
  const localDates=new Map(dates.map(row=>[row.at,row.localDate]));
  return {...page,now:input.now,timeZone:input.timeZone,weekStart:bounds.start,weekEnd:bounds.end,localToday:bounds.localToday,
    items:page.items.map(item=>({...item,localDate:localDates.get(item.scheduledAt)!,
      scheduleState:item.scheduledAt<=input.now?'aired' as const:'upcoming' as const}))};
}
