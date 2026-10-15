import type { PoolClient } from "pg";
import { requireCatalogSeason, ensureReleaseEpisode } from "./catalogReleaseIdentity";
import { writeActivity } from "./privateActivity";

/** Caller owns account lock/tier validation and the complete transaction. */
export async function saveCanonicalWatchProgress(client: PoolClient, owner: string, routeId: number, seasonId: string, episodeNumber: number, seconds: number, duration: number) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
  await requireCatalogSeason(client,routeId,seasonId);
  const episodeId = await ensureReleaseEpisode(client,seasonId,episodeNumber);
  const complete = duration>0 && seconds/duration>=0.9;
  await writeActivity(owner,"EPISODE",episodeId,{parentSeriesId:routeId,episodeNumber,status:complete?"completed":"watching",completed:complete},{watched_seconds:Math.round(seconds),total_seconds:Math.round(duration)},client);
  const latest = async (kind:string,ids:string[]) => (await client.query(`SELECT DISTINCT ON(canonical_entity_id) canonical_entity_id,completed FROM user_entity_status
    WHERE user_id=$1 AND canonical_entity_kind=$2 AND canonical_entity_id=ANY($3::text[]) ORDER BY canonical_entity_id,COALESCE(updated_at,TIMESTAMPTZ '1970-01-01') DESC,id DESC`,[owner,kind,ids])).rows;
  const completionCache = new Map<string,boolean>();
  const seasonCompleted = async (targetSeasonId: string): Promise<boolean> => {
    if (completionCache.has(targetSeasonId)) return completionCache.get(targetSeasonId)!;
    const fact = (await client.query("SELECT episode_count FROM canonical_release_facts WHERE season_id=$1",[targetSeasonId])).rows[0];
  let seasonComplete = false;
  if (typeof fact?.episode_count === "number" && fact.episode_count>0) {
    const episodes = (await client.query(`SELECT m.child_id,m.display_order,a.value FROM canonical_memberships m JOIN canonical_aliases a
      ON a.entity_id=m.child_id AND a.namespace='anirium:release-episode' AND a.state='active'
      WHERE m.parent_id=$1 AND m.child_kind='EPISODE' AND m.display_order BETWEEN 1 AND $2`,[targetSeasonId,fact.episode_count])).rows.filter(row=>row.value===JSON.stringify([targetSeasonId,row.display_order])).map(row=>row.child_id);
    const states = await latest("EPISODE",episodes);
    seasonComplete = states.filter(row=>row.completed===true).length===fact.episode_count;
  }
    completionCache.set(targetSeasonId,seasonComplete);
    return seasonComplete;
  };
  const workCompleted = async (workId: string): Promise<boolean> => {
    const children = (await client.query("SELECT child_id FROM canonical_memberships WHERE parent_id=$1 AND child_kind='SEASON'",[workId])).rows;
    if (!children.length) return false;
    for (const child of children) if (!await seasonCompleted(child.child_id)) return false;
    return true;
  };
  const seasonComplete = await seasonCompleted(seasonId);
  await writeActivity(owner,"SEASON",seasonId,{status:seasonComplete?"completed":"watching",completed:seasonComplete},{},client);
  const works = (await client.query("SELECT parent_id FROM canonical_memberships WHERE child_id=$1 AND parent_kind='WORK'",[seasonId])).rows;
  for (const work of works) {
    const workComplete = await workCompleted(work.parent_id);
    await writeActivity(owner,"SERIES",work.parent_id,{status:workComplete?"completed":"watching",completed:workComplete},{},client);
    const universes = (await client.query("SELECT parent_id FROM canonical_memberships WHERE child_id=$1 AND parent_kind='UNIVERSE'",[work.parent_id])).rows;
    for (const universe of universes) {
      const children = (await client.query("SELECT child_id FROM canonical_memberships WHERE parent_id=$1 AND child_kind='WORK'",[universe.parent_id])).rows.map(row=>row.child_id);
      let universeComplete = children.length>0;
      for (const child of children) if (!await workCompleted(child)) { universeComplete=false; break; }
      await writeActivity(owner,"UNIVERSE",universe.parent_id,{status:universeComplete?"completed":"watching",completed:universeComplete},{},client);
    }
  }
}
