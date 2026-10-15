import type { PoolClient } from "pg";
import { resolveActivityEntity } from "./activityEntityIndex";
import { ApiInputError } from "./apiInput";

/** Preserve the episode/season a historical discussion actually addressed. */
export async function resolveCommentEntity(client: PoolClient, type: string, id: string, readOnly = false) {
  if (type === "EPISODE" || type === "SEASON") {
    if (!readOnly) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["comment-entity",type,id])]);
    const bound = (await client.query("SELECT DISTINCT canonical_entity_id FROM entity_comments WHERE entity_type=$1 AND entity_id=$2 AND canonical_entity_id IS NOT NULL LIMIT 2",[type,id])).rows;
    if (bound.length > 1) throw new ApiInputError(409,"comment_identity_conflict");
    if (bound[0]) return bound[0].canonical_entity_id as string;
  }
  return resolveActivityEntity(client,type,id,{readOnly});
}
