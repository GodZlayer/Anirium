import type { PoolClient } from "pg";
import { isPrivateEnvelope, readStoredPrivateJson, addonPrivateContext } from "./privateData";
import { readProfile } from "./privateProfile";
import { readActivity } from "./privateActivity";
import { readProfileSettings } from "./privateProfileSettings";

type Counts = { scanned: number; missingEnvelope: number; invalidCurrentPayload: number; residualPlaintext: number };

/** Read-only aggregate inspection; callers own the consistent database snapshot. */
export async function inspectPrivateData(client: PoolClient, options: { ownerId?: string; batchSize?: number } = {}) {
  const size = options.batchSize ?? 100;
  if (!Number.isSafeInteger(size) || size < 1 || size > 500) throw new Error("Invalid inventory batch size");
  if (options.ownerId !== undefined && (!options.ownerId || options.ownerId.length > 256)) throw new Error("Invalid inventory owner");
  const owner = options.ownerId ?? null;
  const counts: Record<string, Counts> = {};
  const scopes = [
    { name: "profile", table: "users", owner: "id", field: "profile_private", read: (row: any) => readProfile(row),
      residue: (row: any) => row.display_name !== "Conta" || !!row.avatar_url },
    { name: "settings", table: "users", owner: "id", field: "settings_json",
      read: (row: any) => readProfileSettings(row.id, row.settings_json),
      residue: () => false },
    { name: "activity", table: "user_entity_status", owner: "user_id", field: "activity_private", read: readActivity,
      residue: (row: any) => row.watched_seconds !== 0 || row.total_seconds !== 0 ||
        ["user_score", "external_source_score", "user_opinion", "audio_track_used", "subtitle_track_used"].some(field => row[field] != null) },
    { name: "addons", table: "user_addons", owner: "user_id", field: "config_json",
      read: (row: any) => {
        if (typeof row.enabled !== "boolean") throw new Error("Invalid addon enabled type");
        return readStoredPrivateJson(row.config_json, addonPrivateContext(row.user_id, row.addon_id));
      }, residue: () => false },
  ];
  for (const scope of scopes) {
    const result = counts[scope.name] = { scanned: 0, missingEnvelope: 0, invalidCurrentPayload: 0, residualPlaintext: 0 };
    let cursor: string | null = null, addonCursor: string | null = null;
    for (;;) {
      const rows: Record<string, any>[] = scope.name === "addons"
        ? (await client.query(`SELECT * FROM user_addons WHERE ($1::text IS NULL OR user_id=$1)
            AND ($2::text IS NULL OR (user_id,addon_id)>($2::text,$3::text)) ORDER BY user_id,addon_id LIMIT $4`, [owner,cursor,addonCursor,size])).rows
        : (await client.query(`SELECT * FROM ${scope.table} WHERE ($1::text IS NULL OR ${scope.owner}=$1)
            AND ($2::${scope.name === "activity" ? "uuid" : "text"} IS NULL OR id>$2::${scope.name === "activity" ? "uuid" : "text"}) ORDER BY id LIMIT $3`, [owner,cursor,size])).rows;
      if (!rows.length) break;
      for (const row of rows) {
        result.scanned++;
        if (!isPrivateEnvelope(row[scope.field])) result.missingEnvelope++;
        else { try { scope.read(row); } catch { result.invalidCurrentPayload++; } }
        if (scope.residue(row)) result.residualPlaintext++;
      }
      const last: Record<string, any> = rows[rows.length - 1];
      cursor = scope.name === "addons" ? last.user_id : last.id;
      addonCursor = scope.name === "addons" ? last.addon_id : null;
    }
  }
  return { counts, privateDataReady: Object.values(counts).every(row => !row.missingEnvelope && !row.invalidCurrentPayload && !row.residualPlaintext) };
}
