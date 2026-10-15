import type { PoolClient } from "pg";

// All identifiers are fixed application contracts; no caller-provided SQL.
const references = {
  anime_catalog: ["canonical_entity_id", "composition_work_id", "composition_season_id", "composition_universe_id"],
  user_entity_status: ["canonical_entity_id", "release_entity_id"],
  entity_comments: ["canonical_entity_id", "release_entity_id"],
  user_addons: ["canonical_plugin_id"],
};

/** Read-only audit of pre-existing bindings; does not change entity visibility. */
export async function inspectPublicBindings(client: PoolClient) {
  const counts: Record<string, number> = {};
  for (const [table, fields] of Object.entries(references)) {
    const result = await client.query<{ invalid: string }>(`SELECT count(*)::text AS invalid FROM ${table} t
      WHERE EXISTS (SELECT 1 FROM canonical_entities e WHERE e.id=ANY(ARRAY[${fields.map(field => `t.${field}`).join(",")}])
        AND (e.visibility<>'public' OR e.owner_id IS NOT NULL))`);
    counts[table] = Number(result.rows[0].invalid);
  }
  return { counts, publicBindingsReady: Object.values(counts).every(count => count === 0) };
}
