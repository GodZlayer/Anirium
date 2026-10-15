import type { PoolClient } from "pg";
import { ensureEntity } from "./entityIndex";
import { encryptPrivateJson, decryptPrivateJson } from "./privateData";

export type AssetBackend = "local" | "drive" | "https";
export function checkedAssetLocator(backend: AssetBackend, value: unknown): string {
  if (typeof value!=="string" || !value || value.length>4096 || /[\x00-\x1f]/.test(value)) throw new Error("Invalid asset locator");
  if (backend==="https") {
    const url=new URL(value);
    if (url.protocol!=="https:" || url.username || url.password || url.hash || [...url.searchParams.keys()].some(k=>/^(token|access_token|key|api_key|authorization|signature|sig|password)$/i.test(k))) throw new Error("Credential-bearing asset locator");
  } else if (backend==="drive") {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error("Invalid Drive file identity");
  } else if (backend==="local") {
    if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(value)) throw new Error("Invalid local asset path");
  } else throw new Error("Invalid asset backend");
  return value;
}
const context=(owner:string,assetId:string,backend:string)=>({table:"canonical_asset_locations",owner,record:assetId,field:backend});

/** Internal caller supplies an authenticated owner and stable logical key, never a URL as identity. */
export async function registerAssetLocation(client: PoolClient, input: {logicalKey:string; sourceKey:string; ownerId?:string; backend:AssetBackend; locator:string; entityId?:string; slot?:string}) {
  if (typeof input.logicalKey!=="string" || !input.logicalKey || input.logicalKey.length>256 || input.logicalKey.includes("\0")) throw new Error("Invalid asset logical identity");
  const locator=checkedAssetLocator(input.backend,input.locator);
  const asset=await ensureEntity({namespace:"anirium:asset",value:JSON.stringify([input.ownerId ?? null,input.logicalKey]),sourceKey:input.sourceKey},{kind:"ASSET",ownerId:input.ownerId},client);
  const existing=(await client.query("SELECT * FROM canonical_asset_locations WHERE asset_id=$1 AND backend=$2 FOR UPDATE",[asset.id,input.backend])).rows[0];
  const oldLocator=existing ? input.ownerId ? decryptPrivateJson(existing.locator_private,context(input.ownerId,asset.id,input.backend)).locator : existing.locator : null;
  if (!existing || oldLocator!==locator) {
    const privateValue=input.ownerId ? encryptPrivateJson({locator},context(input.ownerId,asset.id,input.backend)) : null;
    await client.query(`INSERT INTO canonical_asset_locations(asset_id,backend,locator,locator_private) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(asset_id,backend) DO UPDATE SET locator=EXCLUDED.locator,locator_private=EXCLUDED.locator_private,revision=canonical_asset_locations.revision+1`,
      [asset.id,input.backend,input.ownerId ? null : locator,privateValue ? JSON.stringify(privateValue) : null]);
  }
  if (input.entityId!==undefined) {
    if (typeof input.slot!=="string" || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.slot)) throw new Error("Invalid asset slot");
    await client.query(`INSERT INTO canonical_asset_links(asset_id,entity_id,slot) VALUES($1,$2,$3)
      ON CONFLICT(entity_id,slot) DO UPDATE SET asset_id=EXCLUDED.asset_id`,[asset.id,input.entityId,input.slot]);
  }
  const revision=(await client.query("SELECT revision FROM canonical_asset_locations WHERE asset_id=$1 AND backend=$2",[asset.id,input.backend])).rows[0].revision;
  return {assetId:asset.id,backend:input.backend,revision,verification:"unverified" as const};
}

export async function readAssetLocations(client: PoolClient, assetId:string, ownerId?:string) {
  return readAssetLocationsBatch(client,[assetId],ownerId);
}

/** Resolve a projection in one query, applying the same owner boundary to every ID. */
export async function readAssetLocationsBatch(client: PoolClient, assetIds:readonly string[], ownerId?:string) {
  if (!assetIds.length) return [];
  const rows=(await client.query(`SELECT l.*,e.owner_id FROM canonical_asset_locations l JOIN canonical_entities e ON e.id=l.asset_id
    WHERE l.asset_id=ANY($1::text[]) AND (e.visibility='public' OR (e.visibility='account-private' AND e.owner_id=$2)) ORDER BY l.asset_id,l.backend`,[Array.from(new Set(assetIds)),ownerId ?? null])).rows;
  return rows.map(row=>({assetId:row.asset_id,backend:row.backend,revision:row.revision,verification:"unverified" as const,
    locator:row.owner_id ? decryptPrivateJson(row.locator_private,context(row.owner_id,row.asset_id,row.backend)).locator : row.locator}));
}
