import type { PoolClient } from "pg";
import { ensureEntity, bindEntityAlias } from "./entityIndex";

function sourceId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}

/** Register the existing work route and only provider IDs proven by its source. */
export async function registerCatalogWork(client: PoolClient, identity: { legacyId: number; anilistId?: number | null; malId?: number | null }): Promise<string> {
  if (!sourceId(identity.legacyId) || (identity.anilistId != null && !sourceId(identity.anilistId)) || (identity.malId != null && !sourceId(identity.malId))) throw new Error("Invalid catalog source identity");
  const work = await ensureEntity({ namespace: "anirium:legacy:work", value: String(identity.legacyId), sourceKey: "catalog:legacy-route" }, { kind: "WORK" }, client);
  if (identity.anilistId != null) await bindEntityAlias(work.id, { namespace: "anilist:work", value: String(identity.anilistId), sourceKey: "anilist:media" }, client);
  if (identity.malId != null) await bindEntityAlias(work.id, { namespace: "mal:work", value: String(identity.malId), sourceKey: "catalog:verified-mal-id" }, client);
  const updated = await client.query(`UPDATE anime_catalog SET canonical_entity_id=$2
    WHERE mal_id=$1 AND (canonical_entity_id IS NULL OR canonical_entity_id=$2) RETURNING mal_id`, [identity.legacyId,work.id]);
  if (updated.rowCount !== 1) throw new Error("Catalog canonical identity conflict");
  return work.id;
}
