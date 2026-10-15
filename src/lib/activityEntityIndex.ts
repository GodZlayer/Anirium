import type { PoolClient } from "pg";
import { catalogEntityCoordinates } from "./catalogIdentity";
import { ensureEntity, linkContentEntities, resolveEntityAlias } from "./entityIndex";
import { withTransaction } from "./postgres";
import { ApiInputError } from "./apiInput";
import { releaseWorkProof } from "./releaseWorkProof";

export const isCanonicalEntityId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Resolve legacy coordinates without changing the private record's AAD. */
export async function resolveActivityEntity(client: PoolClient, type: string, id: string, options: { readOnly?: boolean } = {}): Promise<string | null> {
  if (isCanonicalEntityId(id)) {
    const kind = type === "SERIES" ? "WORK" : type;
    const entity = (await client.query("SELECT id FROM canonical_entities WHERE id=$1 AND kind=$2 AND visibility='public'",[id,kind])).rows[0];
    if (!entity) throw new ApiInputError(400,"invalid_canonical_entity");
    return entity.id;
  }
  if (type === "UNIVERSE") {
    const result = await client.query("SELECT id FROM canonical_entities WHERE id=$1 AND kind='UNIVERSE' AND visibility='public'",[id]);
    return result.rows[0]?.id ?? null;
  }
  const coordinates = catalogEntityCoordinates(type,id);
  if (!coordinates) return null;
  const row = (await client.query("SELECT id_anilist,composition_work_id,composition_season_id,source_nodes_json,seasons_json FROM anime_catalog WHERE mal_id=$1",[coordinates.parentSeriesId])).rows[0];
  if (!row) return null;
  if (type === "SERIES") return row.composition_work_id ?? null;
  const seasons = row.seasons_json;
  const releaseId = Array.isArray(seasons) && seasons.length > 0 ? seasons[coordinates.seasonIdx]?.id : coordinates.seasonIdx === 0 ? row.id_anilist : null;
  if (!Number.isSafeInteger(releaseId) || !Array.isArray(row.source_nodes_json) || !row.source_nodes_json.some((node: any)=>node.namespace === "anilist:media" && node.type === "ANIME" && node.id === String(releaseId))) return null;
  const season = await resolveEntityAlias(client,"anilist:season",String(releaseId),null);
  if (!season) return null;
  if (type === "SEASON") return season.id;
  if (options.readOnly) return (await resolveEntityAlias(client,"anirium:release-episode",JSON.stringify([season.id,coordinates.episodeNumber]),null))?.id ?? null;
  const episode = await ensureEntity({namespace:"anirium:release-episode",value:JSON.stringify([season.id,coordinates.episodeNumber]),sourceKey:"catalog:release-local-ordinal"},{kind:"EPISODE"},client);
  await linkContentEntities(client,season.id,episode.id,coordinates.episodeNumber,"catalog:release-local-ordinal");
  return episode.id;
}

export async function bindActivityEntity(client: PoolClient, owner: string, type: string, id: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
  const canonicalId = await resolveActivityEntity(client,type,id);
  if (canonicalId === null) return;
  const existing = (await client.query("SELECT id,canonical_entity_id FROM user_entity_status WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3 FOR UPDATE",[owner,type,id])).rows[0];
  const releaseCoordinates = type === "SERIES" ? catalogEntityCoordinates(type,id) : null;
  if (releaseCoordinates) {
    const release = (await client.query("SELECT composition_season_id FROM anime_catalog WHERE mal_id=$1",[releaseCoordinates.parentSeriesId])).rows[0]?.composition_season_id;
    if (release) {
      const scoped = await client.query("UPDATE user_entity_status SET release_entity_id=$4 WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3 AND (release_entity_id IS NULL OR release_entity_id=$4) RETURNING id",[owner,type,id,release]);
      if (scoped.rowCount !== 1) throw new Error("Activity release identity conflict");
    }
  }
  if (existing?.canonical_entity_id && existing.canonical_entity_id !== canonicalId && type === "SERIES") {
    const proof = await releaseWorkProof(client,id,existing.canonical_entity_id,canonicalId);
    if (!proof?.length) throw new Error("Activity canonical identity conflict");
    await client.query("INSERT INTO activity_binding_history(status_id,user_id,previous_entity_id,next_entity_id,membership_proof_ids) VALUES($1,$2,$3,$4,$5::jsonb)",[existing.id,owner,existing.canonical_entity_id,canonicalId,JSON.stringify(proof)]);
    await client.query("UPDATE user_entity_status SET canonical_entity_id=$2 WHERE id=$1",[existing.id,canonicalId]);
    return;
  }
  const result = await client.query(`UPDATE user_entity_status SET canonical_entity_id=$4
    WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3 AND (canonical_entity_id IS NULL OR canonical_entity_id=$4) RETURNING id`,[owner,type,id,canonicalId]);
  if (result.rowCount !== 1) throw new Error("Activity canonical identity conflict");
}

/** Additive, account-scoped migration; legacy keys and encrypted fields stay intact. */
export async function backfillActivityEntities(owner: string, options: { afterId?: string; limit?: number } = {}) {
  const afterId = options.afterId ?? "", limit = options.limit ?? 100;
  if (typeof owner !== "string" || !owner || owner.length > 256 || typeof afterId !== "string" || (afterId !== "" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(afterId)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid activity backfill page");
  return withTransaction(async client => {
    if (!(await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[owner])).rows.length) throw new Error("Activity account unavailable");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
    const rows = (await client.query("SELECT id,entity_type,entity_id FROM user_entity_status WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT $3 FOR UPDATE",[owner,afterId || null,limit+1])).rows;
    const page = rows.slice(0,limit);
    let unresolved = 0;
    for (const row of page) {
      await bindActivityEntity(client,owner,row.entity_type,row.entity_id);
      const bound = (await client.query("SELECT canonical_entity_id FROM user_entity_status WHERE id=$1",[row.id])).rows[0];
      if (bound.canonical_entity_id === null) unresolved++;
    }
    return {processed:page.length,unresolved,nextAfterId:page.at(-1)?.id ?? afterId,exhausted:rows.length<=limit};
  });
}
