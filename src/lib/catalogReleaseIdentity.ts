import type { PoolClient } from "pg";
import { ApiInputError } from "./apiInput";
import { ensureEntity, linkContentEntities } from "./entityIndex";

export async function requireCatalogSeason(client:PoolClient,routeId:number,seasonId:string) {
  const root=(await client.query("SELECT composition_seasons_json,source_nodes_json FROM anime_catalog WHERE mal_id=$1",[routeId])).rows[0];
  const sourceId=root?.composition_seasons_json && Object.keys(root.composition_seasons_json).find(key=>root.composition_seasons_json[key]===seasonId);
  if (!sourceId || !Array.isArray(root.source_nodes_json) || !root.source_nodes_json.some((node:any)=>node.namespace==='anilist:media' && node.type==='ANIME' && node.id===sourceId)) throw new ApiInputError(409,"stale_release_identity");
  return seasonId;
}

export async function ensureReleaseEpisode(client:PoolClient,seasonId:string,number:number) {
  const episode=await ensureEntity({namespace:"anirium:release-episode",value:JSON.stringify([seasonId,number]),sourceKey:"catalog:release-local-ordinal"},{kind:"EPISODE"},client);
  await linkContentEntities(client,seasonId,episode.id,number,"catalog:release-local-ordinal");
  return episode.id;
}
