import type { PoolClient } from "pg";
import { currentAiringsSQL } from "./currentAiringsSQL";

interface AiringCursor {at:number;episodeId:string;aliasId:string;}
export interface CanonicalAiringItem {
  episodeId:string;seasonId:string;workId:string;universeId:string;episodeNumber:number|null;
  aliasId:string;namespace:string;externalId:string;scheduledAt:number;observedAt:number;cancelled:boolean|null;
}
const uuid=(v:unknown)=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const instant=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=8640000000000000;

/** Source-specific current events. A bounded page is not proof of source coverage. */
export async function readCanonicalAiringPage(client:PoolClient,input:{start:number;end:number;sourceKey:string;limit?:number;direction?:"asc"|"desc";after?:AiringCursor}) {
  const limit=input.limit??100,direction=input.direction??'asc',after=input.after;
  if(!instant(input.start) || !instant(input.end) || input.end<=input.start ||
    typeof input.sourceKey!=='string' || !input.sourceKey.trim() || input.sourceKey.length>200 || input.sourceKey.includes('\0') ||
    !Number.isSafeInteger(limit) || limit<1 || limit>500 || !['asc','desc'].includes(direction) ||
    (after && (!instant(after.at) || !uuid(after.episodeId) || !uuid(after.aliasId)))) throw new Error('Invalid canonical airing page');
  const comparison=direction==='asc'?'>':'<';
  const rows=(await client.query<CanonicalAiringItem>(`
    WITH current_airings AS (${currentAiringsSQL})
    SELECT * FROM current_airings
    WHERE "scheduledAt" >= $2 AND "scheduledAt" < $3 AND cancelled IS DISTINCT FROM TRUE
      AND ($4::bigint IS NULL OR ("scheduledAt","episodeId","aliasId") ${comparison} ($4,$5::text,$6::text))
    ORDER BY "scheduledAt" ${direction},"episodeId" ${direction},"aliasId" ${direction} LIMIT $7`,
    [input.sourceKey,input.start,input.end,after?.at??null,after?.episodeId??null,after?.aliasId??null,limit+1])).rows;
  const items=rows.slice(0,limit),hasMore=rows.length>limit,last=items[items.length-1];
  return {sourceKey:input.sourceKey,items,hasMore,nextCursor:hasMore?{at:last.scheduledAt,episodeId:last.episodeId,aliasId:last.aliasId}:null};
}
