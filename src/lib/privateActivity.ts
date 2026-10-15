import type { PoolClient } from "pg";
import { withTransaction } from "./postgres";
import { bindActivityEntity, isCanonicalEntityId, resolveActivityEntity } from "./activityEntityIndex";
import { ApiInputError } from "./apiInput";
import { encryptPrivateJson, decryptPrivateJson, isPrivateEnvelope, type PrivateDataContext } from "./privateData";

const fields = ["watched_seconds", "total_seconds", "user_score", "external_source_score", "user_opinion", "audio_track_used", "subtitle_track_used"] as const;
export function checkedActivity(value: any): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(field => !fields.includes(field as any))) throw new Error("Invalid private activity");
  const result: Record<string, any> = {};
  for (const field of fields) {
    const raw = value[field] ?? (field.endsWith("seconds") ? 0 : null);
    if (field.endsWith("seconds")) {
      if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > 2147483647) throw new Error("Invalid activity duration");
      result[field] = raw;
    } else if (field.endsWith("score")) {
      const number = raw == null ? null : raw;
      if (number != null && (typeof raw !== "number" || !Number.isFinite(number) || number < 0 || number > 10)) throw new Error("Invalid activity score");
      result[field] = number;
    } else {
      if (raw != null && (typeof raw !== "string" || raw.length > (field === "user_opinion" ? 16000 : 50))) throw new Error("Invalid activity text");
      result[field] = raw;
    }
  }
  return result;
}
export function activityContext(row: any): PrivateDataContext {
  return { table: "user_entity_status", owner: row.user_id, record: JSON.stringify([row.entity_type, row.entity_id]), field: "activity_private" };
}
export function readActivity(row: any): Record<string, any> {
  if (!isPrivateEnvelope(row.activity_private)) throw new Error("Activity requires encrypted data migration");
  return checkedActivity(decryptPrivateJson(row.activity_private, activityContext(row)));
}

export function projectActivity(row: any) {
  if (!row) return row;
  const { activity_private, ...publicRow } = row;
  return { ...publicRow, ...readActivity(row) };
}

export async function writeActivity(owner: string, type: string, id: string, metadata: any, patch: Record<string, any>, transactionClient?: PoolClient) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid activity metadata');
  for (const field of ['completed','containsSpoilers']) if (metadata[field] != null && typeof metadata[field] !== 'boolean') throw new Error('Invalid activity boolean');
  if (metadata.status != null && !['watching','plan_to_watch','completed','dropped','on_hold'].includes(metadata.status)) throw new Error('Invalid activity status');
  if (!owner || !["UNIVERSE", "ARC", "SERIES", "SEASON", "EPISODE"].includes(type) || typeof id !== "string" || !id || id.length > 100) throw new Error("Invalid activity identity");
  if (!isCanonicalEntityId(id)) throw new ApiInputError(400,"invalid_canonical_entity");
  if (type==='ARC' && ['parentSeriesId','seasonIdx','episodeNumber'].some(field=>metadata[field]!=null)) throw new ApiInputError(400,'activity_identity_conflict');
  for (const field of Object.keys(patch)) if (!fields.includes(field as any)) throw new Error("Invalid activity field");
  const coordinateFields = [["parentSeriesId", "parent_series_id", 1], ["seasonIdx", "season_idx", 0], ["episodeNumber", "episode_number", 1]] as const;
  for (const [field, , minimum] of coordinateFields) {
    const value = metadata[field];
    if (value != null && (!Number.isSafeInteger(value) || value < minimum || value > 2147483647)) {
      throw new ApiInputError(400, "activity_identity_conflict");
    }
  }
  const persist = async (client: PoolClient) => {
    // Match progress/bookmark/backfill order: account, hierarchy, activity row.
    if (!(await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[owner])).rows.length) throw new Error("Activity account unavailable");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
    const canonicalId = await resolveActivityEntity(client,type,id);
    let row = (await client.query(`SELECT * FROM user_entity_status WHERE user_id=$1 AND entity_type=$2 AND canonical_entity_id=$3
      AND (entity_type <> 'SERIES' OR release_entity_id IS NULL)
      ORDER BY COALESCE(updated_at,TIMESTAMPTZ '1970-01-01') DESC,id DESC LIMIT 1 FOR UPDATE`,[owner,type,canonicalId])).rows[0];
    if (!row) {
      const initial = encryptPrivateJson({ watched_seconds: 0, total_seconds: 0, user_score: null, external_source_score: null, user_opinion: null, audio_track_used: null, subtitle_track_used: null }, activityContext({ user_id: owner, entity_type: type, entity_id: id }));
      await client.query(`INSERT INTO user_entity_status(user_id,entity_type,entity_id,parent_series_id,season_idx,episode_number,status,activity_private,canonical_entity_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,entity_type,entity_id) DO NOTHING`,
        [owner,type,id,metadata.parentSeriesId ?? null,metadata.seasonIdx ?? null,metadata.episodeNumber ?? null,metadata.status ?? "watching",JSON.stringify(initial),type==='ARC'?canonicalId:null]);
      row = (await client.query("SELECT * FROM user_entity_status WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3 FOR UPDATE", [owner,type,id])).rows[0];
    }
    if (!row) throw new Error("Activity record unavailable");
    if (canonicalId && row.canonical_entity_id && row.canonical_entity_id!==canonicalId) throw new ApiInputError(409,"activity_identity_conflict");
    const data = checkedActivity({ ...readActivity(row), ...patch });
    const envelope = encryptPrivateJson(data, activityContext(row));
    await client.query(`UPDATE user_entity_status SET activity_private=$4, watched_seconds=0,total_seconds=0,
      user_score=NULL,external_source_score=NULL,user_opinion=NULL,audio_track_used=NULL,subtitle_track_used=NULL,
      status=COALESCE($5,status),completed=COALESCE($6,completed),contains_spoilers=COALESCE($7,contains_spoilers),updated_at=NOW(),
      parent_series_id=COALESCE(parent_series_id,$8),season_idx=COALESCE(season_idx,$9),episode_number=COALESCE(episode_number,$10)
      WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3`,
      [owner,type,row.entity_id,JSON.stringify(envelope),metadata.status ?? null,metadata.completed ?? null,metadata.containsSpoilers ?? null,metadata.parentSeriesId ?? null,metadata.seasonIdx ?? null,metadata.episodeNumber ?? null]);
    if (!canonicalId || !row.canonical_entity_id) await bindActivityEntity(client,owner,type,row.entity_id);
  };
  return transactionClient ? persist(transactionClient) : withTransaction(persist);
}
