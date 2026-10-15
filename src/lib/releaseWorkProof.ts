import type { PoolClient } from "pg";
import { catalogSeriesId } from "./catalogIdentity";

/** Evidence for moving one release's reference, never a whole-work aggregate. */
export async function releaseWorkProof(client: PoolClient, routeId: string, previous: string, next: string) {
  const route = catalogSeriesId(routeId);
  if (route === null) return null;
  const season = (await client.query(`SELECT c.composition_season_id FROM anime_catalog c JOIN canonical_memberships m
    ON m.child_id=c.composition_season_id AND m.parent_id=$2 AND m.parent_kind='WORK' WHERE c.mal_id=$1`,[route,next])).rows[0];
  if (!season) return null;
  const history = (await client.query<{id:string;previous_parent_id:string;next_parent_id:string}>("SELECT id,previous_parent_id,next_parent_id FROM canonical_membership_history WHERE child_id=$1 ORDER BY changed_at DESC,id DESC LIMIT 1001",[season.composition_season_id])).rows;
  if (history.length > 1000) throw new Error("Release reconciliation proof exceeds limit");
  const paths = new Map<string,string[]>([[previous,[]]]), queue = [previous];
  for (let cursor=0;cursor<queue.length && !paths.has(next);cursor++) {
    for (const edge of history) if (edge.previous_parent_id === queue[cursor] && !paths.has(edge.next_parent_id)) {
      paths.set(edge.next_parent_id,[...paths.get(queue[cursor])!,edge.id]);
      queue.push(edge.next_parent_id);
    }
  }
  const proof = paths.get(next);
  return proof?.length ? proof : null;
}
