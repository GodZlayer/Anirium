import { validateCanonicalEntityStatusInput } from "./apiInput";
import { resolveActivityEntity } from "./activityEntityIndex";
import { withTransaction } from "./postgres";
import { projectActivity } from "./privateActivity";

/** Latest account state selected by its canonical binding; original row authenticates the envelope. */
export async function getEntityActivity(owner: string, type: string, id: string) {
  validateCanonicalEntityStatusInput({entityType:type,entityId:id});
  return withTransaction(async client => {
    const canonicalId = await resolveActivityEntity(client,type,id,{readOnly:true});
    const row = (await client.query(`SELECT * FROM user_entity_status WHERE user_id=$1 AND entity_type=$2
      AND canonical_entity_id=$3 AND (entity_type <> 'SERIES' OR release_entity_id IS NULL)
      ORDER BY COALESCE(updated_at,TIMESTAMPTZ '1970-01-01') DESC,id DESC LIMIT 1`,[owner,type,canonicalId])).rows[0];
    return row ? {...projectActivity(row),entity_id:canonicalId} : null;
  });
}
