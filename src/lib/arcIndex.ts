import type { PoolClient } from "pg";
import { ensureEntity, type EntityAlias } from "./entityIndex";

function checked(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || value.includes("\0")) throw new Error("Invalid arc reference");
}

/** Caller owns the transaction and verifies source provenance. */
export async function registerArc(client: PoolClient, universeId: string, alias: EntityAlias) {
  checked(universeId);
  const arc = await ensureEntity(alias, { kind: "ARC" }, client);
  const previous = (await client.query("SELECT universe_id FROM canonical_arcs WHERE arc_id=$1 FOR UPDATE", [arc.id])).rows[0];
  if (previous && previous.universe_id !== universeId) throw new Error("Canonical arc franchise conflict");
  await client.query(`INSERT INTO canonical_arcs(arc_id,universe_id,source_key) VALUES($1,$2,$3)
    ON CONFLICT(arc_id) DO NOTHING`, [arc.id, universeId, alias.sourceKey]);
  return arc;
}

export async function linkArcEpisode(client: PoolClient, arcId: string, episodeId: string, displayOrder: number, sourceKey: string) {
  checked(arcId); checked(episodeId); checked(sourceKey);
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 0 || displayOrder > 2147483647) throw new Error("Invalid arc episode order");
  await client.query(`INSERT INTO canonical_arc_episodes(arc_id,episode_id,display_order,source_key) VALUES($1,$2,$3,$4)
    ON CONFLICT(arc_id,episode_id) DO UPDATE SET display_order=EXCLUDED.display_order,source_key=EXCLUDED.source_key,
    revision=canonical_arc_episodes.revision+1
    WHERE canonical_arc_episodes.display_order IS DISTINCT FROM EXCLUDED.display_order
       OR canonical_arc_episodes.source_key IS DISTINCT FROM EXCLUDED.source_key`, [arcId, episodeId, displayOrder, sourceKey]);
}
