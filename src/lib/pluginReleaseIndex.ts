import type { PoolClient } from "pg";
import { createHash } from "node:crypto";

/** Hash protocol metadata only. Account configuration and locations remain AEAD
 * private. A submitted snapshot proves no publisher identity or effective grant. */
export async function selectPluginRelease(client: PoolClient, accountId: string, pluginId: string, manifest: Record<string,unknown>, sourceKind: "account-submitted" | "official-package" = "account-submitted"): Promise<string | null> {
  if (manifest.kind === "remote-manifest" || manifest.version === undefined) {
    const cleared = await client.query("UPDATE user_addons SET selected_release_id=NULL WHERE user_id=$1 AND addon_id=$2 AND canonical_plugin_id=$3 RETURNING addon_id",[accountId,manifest.id,pluginId]);
    if (cleared.rowCount !== 1) throw new Error("Plugin release account binding unavailable");
    return null;
  }
  if (typeof manifest.id !== "string" || typeof manifest.version !== "string" || !manifest.version.trim() || manifest.version.length > 64 || /[\u0000-\u001f\u007f]/.test(manifest.version)) throw new Error("Invalid plugin release version");
  const descriptor: Record<string,unknown> = { id:manifest.id,version:manifest.version };
  for (const key of ["name","author","type","origin","description","license"] as const) {
    const value = manifest[key];
    if (value !== undefined) {
      if (typeof value !== "string" || value.length > 4000 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Invalid plugin release descriptor");
      descriptor[key] = value;
    }
  }
  for (const key of ["capabilities","permissions"] as const) {
    const value = manifest[key];
    if (value !== undefined) {
      if (!Array.isArray(value) || value.length > 32 || value.some(item=>typeof item!=="string" || !/^[a-z][a-z0-9._-]{0,99}$/.test(item))) throw new Error("Invalid plugin release protocol tokens");
      descriptor[key] = [...new Set(value)].sort();
    }
  }
  const hash = createHash("sha256").update(JSON.stringify(descriptor)).digest("hex");
  const release = (await client.query<{id:string}>(`INSERT INTO canonical_plugin_releases(plugin_id,version,descriptor_hash,source_kind)
    VALUES($1,$2,$3,$4) ON CONFLICT(plugin_id,version,descriptor_hash) DO UPDATE SET descriptor_hash=EXCLUDED.descriptor_hash
    WHERE canonical_plugin_releases.source_kind=EXCLUDED.source_kind RETURNING id`,[pluginId,manifest.version,hash,sourceKind])).rows[0];
  if (!release) throw new Error("Plugin release provenance conflict");
  const selected = await client.query("UPDATE user_addons SET selected_release_id=$4 WHERE user_id=$1 AND addon_id=$2 AND canonical_plugin_id=$3 RETURNING addon_id",[accountId,manifest.id,pluginId,release.id]);
  if (selected.rowCount !== 1) throw new Error("Plugin release account binding unavailable");
  return release.id;
}
