import { validateWatchProgressInput } from "./apiInput";
import { requireCatalogSeason } from "./catalogReleaseIdentity";
import { projectActivity } from "./privateActivity";
import { withTransaction } from "./postgres";

export async function getSeasonProgress(owner: string, routeId: number, seasonIdx: number, seasonEntityId: string, episodeEntityId?: string) {
  validateWatchProgressInput({animeId:routeId,seasonIdx,episode:1,progressSeconds:0,durationSeconds:0,seasonEntityId});
  if (episodeEntityId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(episodeEntityId)) throw new Error("Invalid canonical episode");
  return withTransaction(async client => {
    const seasonId = await requireCatalogSeason(client,routeId,seasonEntityId);
    const rows = (await client.query(`SELECT DISTINCT ON(s.canonical_entity_id) s.*,m.display_order AS canonical_number
      FROM user_entity_status s JOIN canonical_memberships m ON m.child_id=s.canonical_entity_id AND m.parent_id=$2 AND m.child_kind='EPISODE'
      JOIN canonical_aliases a ON a.entity_id=m.child_id AND a.namespace='anirium:release-episode' AND a.state='active'
        AND a.value='["'||$2::text||'",'||m.display_order::text||']'
      WHERE s.user_id=$1 AND s.entity_type='EPISODE'
        AND ($3::text IS NULL OR s.canonical_entity_id=$3)
      ORDER BY s.canonical_entity_id,s.updated_at DESC NULLS LAST,s.id DESC`,[owner,seasonId,episodeEntityId ?? null])).rows;
    return rows.map(projectActivity).map(row=>({number:row.canonical_number,seasonIdx,seasonEntityId:seasonId,canonicalEntityId:row.canonical_entity_id ?? undefined,status:row.status,watchedSeconds:row.watched_seconds,totalSeconds:row.total_seconds,completed:row.completed===true,userScore:row.user_score,userOpinion:row.user_opinion})).filter(row=>Number.isSafeInteger(row.number) && row.number>0).sort((a,b)=>a.number-b.number);
  });
}
