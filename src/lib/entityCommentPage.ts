import { ApiInputError, validateCanonicalEntityStatusInput } from "./apiInput";
import { readEntityPageInput } from "./entityPageInput";
import { withTransaction } from "./postgres";
import { readProfile } from "./privateProfile";
import { resolveActivityEntity } from "./activityEntityIndex";

export function readEntityCommentPageInput(params: URLSearchParams) {
  if (params.getAll("entity_id").length !== 1) throw new ApiInputError(400, "invalid_comment_page");
  const entityType = params.get("entity_type");
  const entityId = params.get("entity_id")!;
  validateCanonicalEntityStatusInput({ entityType, entityId });
  const page = readEntityPageInput(params, "invalid_comment_page", [entityType!, entityId]);
  return { ...page, entityId };
}

export async function getEntityCommentPage(input: ReturnType<typeof readEntityCommentPageInput>) {
  validateCanonicalEntityStatusInput({ entityType: input.entityType, entityId: input.entityId });
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) throw new ApiInputError(400, "invalid_comment_page");
  return withTransaction(async client => {
  const canonicalId = await resolveActivityEntity(client,input.entityType!,input.entityId,{readOnly:true});
  const rows = (await client.query<any>(`SELECT c.id, c.entity_type, c.entity_id, c.canonical_entity_id, c.parent_comment_id,
    c.content, c.is_spoiler, c.upvotes, c.created_at, c.updated_at,
    u.username, u.display_name, u.avatar_url, u.badge_label, u.id AS _author_id, u.profile_private AS _author_private,
    to_char(COALESCE(COALESCE(c.created_at, TIMESTAMPTZ '1970-01-01 00:00:00+00'), TIMESTAMPTZ '1970-01-01 00:00:00+00') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS _page_time
    FROM entity_comments c JOIN users u ON u.id=c.user_id
    WHERE c.entity_type=$1 AND c.canonical_entity_id=$2
      AND ($1::text <> 'SERIES' OR c.release_entity_id IS NULL)
      AND ($3::timestamptz IS NULL OR (COALESCE(c.created_at, TIMESTAMPTZ '1970-01-01 00:00:00+00'),c.id)>($3::timestamptz,$4::uuid))
    ORDER BY COALESCE(c.created_at, TIMESTAMPTZ '1970-01-01 00:00:00+00') ASC,c.id ASC LIMIT $5`, [input.entityType,canonicalId,input.time,input.id,input.limit+1])).rows;
  const page = rows.slice(0,input.limit);
  const last = page.at(-1);
  return { comments: page.map(({ _page_time, _author_id, _author_private, ...data }) => {
    const identity = readProfile({ id: _author_id, profile_private: _author_private, display_name: data.display_name, avatar_url: data.avatar_url });
    return { ...data, entity_id: canonicalId, display_name: identity.displayName, avatar_url: identity.avatarUrl };
  }),
    nextCommentCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify([last._page_time,last.id,input.entityType,input.entityId])).toString("base64url") : null };
  });
}
