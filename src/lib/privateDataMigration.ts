import type { PoolClient } from "pg";
import { encodeProfile, readProfile } from "./privateProfile";
import { activityContext, checkedActivity } from "./privateActivity";
import { checkedProfileSettings } from "./privateProfileSettings";
import { addonPrivateContext, profileSettingsPrivateContext, decryptPrivateJson, encryptPrivateJson, isPrivateEnvelope, type PrivateDataContext } from "./privateData";

function replacementFor(value: any, context: PrivateDataContext) {
  const encrypted = isPrivateEnvelope(value);
  const plaintext = encrypted ? decryptPrivateJson(value, context) : value;
  const replacement = encryptPrivateJson(plaintext, context);
  if (encrypted && replacement.kid === value.kid) return null;
  if (JSON.stringify(decryptPrivateJson(replacement, context)) !== JSON.stringify(plaintext)) throw new Error("Migration verification failed");
  return replacement;
}

// Explicit bounded transaction. No migration runs on application startup.
// Caller owns the connection; checkpoints advance only after a committed batch.
export async function migrateAddonPrivateBatch(client: PoolClient,
  after: [string, string] = ["", ""], limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid migration batch size");
  await client.query("BEGIN");
  try {
    const result = await client.query<{ user_id: string; addon_id: string; config_json: any }>(
      `SELECT user_id, addon_id, config_json FROM user_addons
       WHERE (user_id, addon_id) > ($1, $2)
       ORDER BY user_id, addon_id LIMIT $3 FOR UPDATE`, [...after, limit]);
    let changed = 0;
    for (const row of result.rows) {
      const context = addonPrivateContext(row.user_id, row.addon_id);
      const replacement = replacementFor(row.config_json, context);
      // Authenticate existing envelopes even when already on the active key.
      if (!replacement) continue;
      await client.query("UPDATE user_addons SET config_json = $3 WHERE user_id = $1 AND addon_id = $2",
        [row.user_id, row.addon_id, JSON.stringify(replacement)]);
      changed++;
    }
    await client.query("COMMIT");
    const last = result.rows.at(-1);
    return { scanned: result.rows.length, changed, checkpoint: last ? [last.user_id, last.addon_id] as [string,string] : after };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export async function migrateProfileSettingsBatch(client: PoolClient, after = "", limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid migration batch size");
  await client.query("BEGIN");
  try {
    const result = await client.query<{ id: string; settings_json: any }>(
      "SELECT id, settings_json FROM users WHERE id > $1 ORDER BY id LIMIT $2 FOR UPDATE", [after, limit]);
    let changed = 0;
    for (const row of result.rows) {
      const context = profileSettingsPrivateContext(row.id);
      const encrypted = isPrivateEnvelope(row.settings_json);
      const original = encrypted ? decryptPrivateJson(row.settings_json, context) : row.settings_json;
      if (!original || typeof original !== "object" || Array.isArray(original)) throw new Error("Invalid migrated settings");
      const converted = { ...original };
      for (const field of ["autoNextEpisode", "autoSkipIntro", "telemetryHud", "usePlayerOnEpisodes"]) {
        if (converted[field] === "true") converted[field] = true;
        else if (converted[field] === "false") converted[field] = false;
      }
      const normalized = checkedProfileSettings(converted);
      const candidate = encryptPrivateJson(normalized, context);
      if (JSON.stringify(decryptPrivateJson(candidate, context)) !== JSON.stringify(normalized)) throw new Error("Settings migration verification failed");
      const replacement = encrypted && row.settings_json.kid === candidate.kid && JSON.stringify(original) === JSON.stringify(normalized) ? null : candidate;
      if (!replacement) continue;
      await client.query("UPDATE users SET settings_json = $2 WHERE id = $1", [row.id, JSON.stringify(replacement)]);
      changed++;
    }
    await client.query("COMMIT");
    return { scanned: result.rows.length, changed, checkpoint: result.rows.at(-1)?.id || after };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export async function migratePrivateProfileBatch(client: PoolClient, after = "", limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid migration batch size");
  await client.query("BEGIN");
  try {
    const result = await client.query("SELECT id, display_name, avatar_url, profile_private FROM users WHERE id > $1 ORDER BY id LIMIT $2 FOR UPDATE", [after, limit]);
    let changed = 0;
    for (const row of result.rows) {
      // Explicit migration validates legacy values without relaxing global strict-mode reads.
      const current = row.profile_private == null
        ? { displayName: row.display_name, avatarUrl: row.avatar_url ?? "" }
        : readProfile(row);
      const replacement = encodeProfile(row.id, current.displayName, current.avatarUrl);
      const restored = readProfile({ id: row.id, profile_private: replacement });
      if (JSON.stringify(restored) !== JSON.stringify(current)) throw new Error("Profile migration verification failed");
      if (row.profile_private?.kid === replacement.kid && row.display_name === "Conta" && row.avatar_url === "") continue;
      await client.query("UPDATE users SET profile_private=$2, display_name='Conta', avatar_url='' WHERE id=$1", [row.id, JSON.stringify(replacement)]);
      changed++;
    }
    await client.query("COMMIT");
    return { scanned: result.rows.length, changed, checkpoint: result.rows.at(-1)?.id || after };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export async function migrateActivityBatch(client: PoolClient, after: [string,string,string] = ["","",""], limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid migration batch size");
  await client.query("BEGIN");
  try {
    const result = await client.query(`SELECT * FROM user_entity_status WHERE (user_id,entity_type,entity_id)>($1,$2,$3)
      ORDER BY user_id,entity_type,entity_id LIMIT $4 FOR UPDATE`, [...after,limit]);
    let changed = 0;
    for (const row of result.rows) {
      const legacy = Object.fromEntries(["watched_seconds","total_seconds","user_score","external_source_score","user_opinion","audio_track_used","subtitle_track_used"].map(field => [field,row[field] ?? (field.endsWith("seconds") ? 0 : null)]));
      if (row.activity_private != null && !isPrivateEnvelope(row.activity_private)) throw new Error("Invalid encrypted activity");
      const context = activityContext(row);
      const original = row.activity_private != null ? decryptPrivateJson(row.activity_private,context) : legacy;
      const converted = { ...original };
      for (const field of ["user_score","external_source_score"]) {
        if (typeof converted[field] === "string") {
          if (!/^[+-]?\d+(?:\.\d+)?$/.test(converted[field])) throw new Error("Invalid migrated activity score");
          converted[field] = Number(converted[field]);
        }
      }
      const normalized = checkedActivity(converted);
      const candidate = encryptPrivateJson(normalized,context);
      if (JSON.stringify(decryptPrivateJson(candidate,context)) !== JSON.stringify(normalized)) throw new Error("Activity migration verification failed");
      const replacement = row.activity_private?.kid === candidate.kid && JSON.stringify(original) === JSON.stringify(normalized) ? null : candidate;
      // Scrub residual legacy columns even if the envelope already uses this key.
      const hasLegacy = Object.entries(legacy).some(([field,value]) => field.endsWith("seconds") ? Number(value) !== 0 : value !== null);
      if (!replacement && !hasLegacy) continue;
      await client.query(`UPDATE user_entity_status SET activity_private=$4,watched_seconds=0,total_seconds=0,
        user_score=NULL,external_source_score=NULL,user_opinion=NULL,audio_track_used=NULL,subtitle_track_used=NULL
        WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3`, [row.user_id,row.entity_type,row.entity_id,JSON.stringify(replacement ?? row.activity_private)]);
      changed++;
    }
    await client.query("COMMIT");
    const last = result.rows.at(-1);
    return { scanned: result.rows.length, changed, checkpoint: last ? [last.user_id,last.entity_type,last.entity_id] as [string,string,string] : after };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}
