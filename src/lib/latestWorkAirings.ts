import type { PoolClient } from 'pg';
import type { CanonicalAiringItem } from './canonicalAiringReader';
import { currentAiringsSQL } from './currentAiringsSQL';

/** Latest distinct works by scheduled broadcast time; source coverage and playback availability remain separate. */
export async function readLatestWorkAirings(client:PoolClient,input:{now:number;sourceKey:string;limit?:number}) {
  const limit=input?.limit===undefined?3:input.limit;
  if(!input || !Number.isSafeInteger(input.now) || input.now<0 || input.now>8640000000000000 ||
    typeof input.sourceKey!=='string' || !input.sourceKey.trim() || input.sourceKey.length>200 || input.sourceKey.includes('\0') ||
    !Number.isSafeInteger(limit) || limit<1 || limit>100)throw new Error('Invalid latest work airings');
  const result=(await client.query<{items:CanonicalAiringItem[];conflictingEpisodeIds:string[];conflictingEpisodeCount:number;conflictsHaveMore:boolean}>(`
    WITH current_airings AS (${currentAiringsSQL}), episode_heads AS (
      SELECT *,row_number() OVER(PARTITION BY "episodeId" ORDER BY "observedAt" DESC,"aliasId") AS episode_rank
      FROM current_airings
    ), conflicts AS (
      SELECT a."episodeId" FROM episode_heads a WHERE episode_rank=1
        AND EXISTS(SELECT 1 FROM current_airings b WHERE b."episodeId"=a."episodeId" AND b."observedAt"=a."observedAt"
          AND ROW(b."scheduledAt",b.cancelled) IS DISTINCT FROM ROW(a."scheduledAt",a.cancelled))
    ), eligible AS (
      SELECT a.* FROM episode_heads a WHERE episode_rank=1
        AND NOT EXISTS(SELECT 1 FROM conflicts b WHERE b."episodeId"=a."episodeId")
        AND a."scheduledAt"<= $2 AND a.cancelled IS DISTINCT FROM TRUE
    ), works AS (
      SELECT *,row_number() OVER(PARTITION BY "workId" ORDER BY "scheduledAt" DESC,"episodeId" DESC,"aliasId" DESC) AS work_rank FROM eligible
    ), selected AS (
      SELECT "episodeId","seasonId","workId","universeId","episodeNumber","aliasId",namespace,"externalId","scheduledAt","observedAt",cancelled
      FROM works WHERE work_rank=1 ORDER BY "scheduledAt" DESC,"episodeId" DESC,"aliasId" DESC LIMIT $3
    ) SELECT COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s."scheduledAt" DESC,s."episodeId" DESC,s."aliasId" DESC) FROM selected s),'[]'::jsonb) AS items,
      COALESCE((SELECT jsonb_agg("episodeId" ORDER BY "episodeId") FROM (SELECT "episodeId" FROM conflicts ORDER BY "episodeId" LIMIT 100) c),'[]'::jsonb) AS "conflictingEpisodeIds",
      (SELECT count(*)::double precision FROM conflicts) AS "conflictingEpisodeCount",
      (SELECT count(*)>100 FROM conflicts) AS "conflictsHaveMore"`,[input.sourceKey,input.now,limit])).rows[0];
  return {sourceKey:input.sourceKey,now:input.now,...result};
}
