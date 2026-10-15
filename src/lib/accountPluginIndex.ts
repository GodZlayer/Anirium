import type { PoolClient } from "pg";
import { ensureEntity } from "./entityIndex";
import { withTransaction } from "./postgres";
import { addonPrivateContext, decryptPrivateJson } from "./privateData";
import { selectPluginRelease } from "./pluginReleaseIndex";
import { selectOfficialPluginRelease } from "./officialPluginRelease";
import { registerCanonicalAccount } from "./accountIdentity";

/** Identity bindings only. Private configuration, release versions and grants are
 * distinct contracts; a remote registration never proves provider capabilities. */
export async function registerAccountPlugin(client: PoolClient, accountId: string, addonId: string): Promise<string> {
  if (typeof accountId !== "string" || !accountId || accountId.length > 256 || typeof addonId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(addonId)) throw new Error("Invalid account plugin identity");
  const owner = (await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[accountId])).rows[0];
  if (!owner) throw new Error("Account plugin owner unavailable");
  await registerCanonicalAccount(client,accountId);
  const plugin = await ensureEntity({namespace:"anirium:addon:key",value:addonId,sourceKey:"core:addon-registration"},{kind:"PLUGIN"},client);
  const relation = await client.query("UPDATE user_addons SET canonical_plugin_id=$3 WHERE user_id=$1 AND addon_id=$2 AND (canonical_plugin_id IS NULL OR canonical_plugin_id=$3) RETURNING addon_id",[accountId,addonId,plugin.id]);
  if (relation.rowCount !== 1) throw new Error("Canonical account plugin conflict");
  return plugin.id;
}

/** One account per transaction preserves the writer's owner-first lock order. */
export async function backfillAccountPlugins(accountId: string, options: { afterAddonId?: string; limit?: number } = {}) {
  if (typeof accountId !== "string" || !accountId || accountId.length > 256) throw new Error("Invalid account plugin owner");
  const afterAddonId = options.afterAddonId === undefined ? "" : options.afterAddonId;
  const limit = options.limit === undefined ? 100 : options.limit;
  if (typeof afterAddonId !== "string" || (afterAddonId !== "" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(afterAddonId)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid account plugin page");
  return withTransaction(async client => {
    const owner = (await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[accountId])).rows[0];
    if (!owner) throw new Error("Account plugin owner unavailable");
    const rows = (await client.query<{addon_id:string;config_json:unknown}>("SELECT addon_id,config_json FROM user_addons WHERE user_id=$1 AND addon_id>$2 ORDER BY addon_id LIMIT $3",[accountId,afterAddonId,limit+1])).rows;
    const page = rows.slice(0,limit);
    let unresolvedVersions = 0;
    for (const row of page) {
      const pluginId = await registerAccountPlugin(client,accountId,row.addon_id);
      // Historical conversion belongs to this explicit backfill, never the runtime reader.
      const stored = typeof row.config_json === "string" ? JSON.parse(row.config_json) : row.config_json;
      const config = stored && typeof stored === "object" && "_anirium_private" in stored
        ? decryptPrivateJson(stored,addonPrivateContext(accountId,row.addon_id)) : stored;
      if (await selectOfficialPluginRelease(client,accountId,row.addon_id,pluginId)) {
        // Package provenance is independent of the account's private config.
      } else if (config && typeof config === "object" && !Array.isArray(config) && config.id === row.addon_id && (config.version !== undefined || config.kind === "remote-manifest")) {
        await selectPluginRelease(client,accountId,pluginId,config);
      } else unresolvedVersions++;
    }
    return { processed:page.length, unresolvedVersions, nextAfterAddonId:page.at(-1)?.addon_id ?? afterAddonId, exhausted:rows.length<=limit };
  });
}
