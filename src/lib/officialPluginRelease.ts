import type { PoolClient } from "pg";
import * as playerProManifest from "../addons/player-pro/manifest.json";
import { selectPluginRelease } from "./pluginReleaseIndex";

/** The same packaged descriptor used by pluginLoader. Account input never
 * supplies the descriptor or its trusted provenance marker. */
export async function selectOfficialPluginRelease(client: PoolClient, accountId: string, addonId: string, pluginId: string): Promise<boolean> {
  if (addonId !== playerProManifest.id) return false;
  await selectPluginRelease(client,accountId,pluginId,playerProManifest,"official-package");
  return true;
}
