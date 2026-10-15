import { validateCommentInput, validateCanonicalEntityStatusInput, ApiInputError } from "./apiInput";
import { resolveActivityEntity } from "./activityEntityIndex";
import { catalogEntityCoordinates } from "./catalogIdentity";
import { withTransaction } from "./postgres";
import { resolveCommentEntity } from "./commentEntityIdentity";
import type { PoolClient } from "pg";
import { releaseWorkProof } from "./releaseWorkProof";

async function bindCommentRelease(client: PoolClient, owner: string, id: string, type: string, routeId: string) {
  const coordinates = type === "SERIES" ? catalogEntityCoordinates(type,routeId) : null;
  if (!coordinates) return;
  const release = (await client.query("SELECT composition_season_id FROM anime_catalog WHERE mal_id=$1",[coordinates.parentSeriesId])).rows[0]?.composition_season_id;
  if (!release) return;
  const result = await client.query("UPDATE entity_comments SET release_entity_id=$3 WHERE id=$1 AND user_id=$2 AND (release_entity_id IS NULL OR release_entity_id=$3) RETURNING id",[id,owner,release]);
  if (result.rowCount !== 1) throw new Error("Comment release identity conflict");
}

export async function insertEntityComment(owner: string, input: Record<string,any>) {
  validateCommentInput(input);
  validateCanonicalEntityStatusInput(input);
  return withTransaction(async client => {
    if (!(await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[owner])).rows.length) throw new Error("Comment account unavailable");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
    const canonicalId = await resolveActivityEntity(client,input.entityType,input.entityId,{readOnly:true});
    const result = await client.query(`INSERT INTO entity_comments
      (user_id,entity_type,entity_id,parent_series_id,episode_number,parent_comment_id,content,is_spoiler,canonical_entity_id,created_at,updated_at)
      SELECT $1::text,$2::text,$3::text,$4::integer,$5::integer,$6::uuid,$7::text,$8::boolean,$9::text,NOW(),NOW()
      WHERE $6::uuid IS NULL OR EXISTS (SELECT 1 FROM entity_comments parent WHERE parent.id=$6::uuid AND parent.entity_type=$2::text
        AND parent.canonical_entity_id=$9::text AND ($2::text <> 'SERIES' OR parent.release_entity_id IS NULL))
      RETURNING id,created_at,canonical_entity_id`,[owner,input.entityType,input.entityId,input.parentSeriesId ?? null,input.episodeNumber ?? null,input.parentCommentId ?? null,input.content.trim(),input.isSpoiler ?? false,canonicalId]);
    if (!result.rows[0]) throw new ApiInputError(400,"invalid_parent_comment");
    return result.rows[0];
  });
}

/** Commit one account-scoped page. Reconcile from zero after concurrent inserts. */
export async function backfillCommentEntities(owner: string, options: { afterId?: string; limit?: number } = {}) {
  const afterId = options.afterId === undefined ? "" : options.afterId;
  const limit = options.limit === undefined ? 100 : options.limit;
  if (typeof owner !== "string" || !owner || owner.length > 256 || typeof afterId !== "string" || (afterId !== "" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(afterId)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid comment backfill page");
  return withTransaction(async client => {
    if (!(await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[owner])).rows.length) throw new Error("Comment account unavailable");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
    const rows = (await client.query("SELECT id,entity_type,entity_id,canonical_entity_id FROM entity_comments WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT $3 FOR UPDATE",[owner,afterId || null,limit+1])).rows;
    const page = rows.slice(0,limit);
    let unresolved = 0;
    for (const row of page) {
      const canonicalId = await resolveCommentEntity(client,row.entity_type,row.entity_id);
      if (canonicalId === null) { if (row.canonical_entity_id === null) unresolved++; continue; }
      await bindCommentRelease(client,owner,row.id,row.entity_type,row.entity_id);
      if (row.canonical_entity_id && row.canonical_entity_id !== canonicalId && row.entity_type === "SERIES") {
        const proof = await releaseWorkProof(client,row.entity_id,row.canonical_entity_id,canonicalId);
        if (!proof) throw new Error("Comment canonical identity conflict");
        await client.query("INSERT INTO comment_binding_history(comment_id,user_id,previous_entity_id,next_entity_id,membership_proof_ids) VALUES($1,$2,$3,$4,$5::jsonb)",[row.id,owner,row.canonical_entity_id,canonicalId,JSON.stringify(proof)]);
        await client.query("UPDATE entity_comments SET canonical_entity_id=$2 WHERE id=$1",[row.id,canonicalId]);
        continue;
      }
      const updated = await client.query("UPDATE entity_comments SET canonical_entity_id=$3 WHERE id=$1 AND user_id=$2 AND (canonical_entity_id IS NULL OR canonical_entity_id=$3) RETURNING id",[row.id,owner,canonicalId]);
      if (updated.rowCount !== 1) throw new Error("Comment canonical identity conflict");
    }
    return {processed:page.length,unresolved,nextAfterId:page.at(-1)?.id ?? afterId,exhausted:rows.length<=limit};
  });
}
