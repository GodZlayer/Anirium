import type { PoolClient } from "pg";
import { ensureEntity } from "./entityIndex";

/** Publish only an internally verified index manifest, atomically advancing its logical resource. */
export async function publishDataBlock(client:PoolClient,input:{logicalKey:string;contentId:string;ownerId?:string;previousBlockId?:string}) {
  if (typeof input.logicalKey!=="string" || !input.logicalKey || input.logicalKey.length>256) throw new Error("Invalid block logical identity");
  const content=(await client.query(`SELECT c.*,m.validated_manifest,e.owner_id,e.visibility FROM canonical_asset_contents c JOIN canonical_entities e ON e.id=c.asset_id
    JOIN canonical_index_manifests m ON m.content_id=c.id
    WHERE c.id=$1 AND (e.visibility='public' OR e.owner_id=$2)`,[input.contentId,input.ownerId ?? null])).rows[0];
  if (!content?.validated_manifest || content.owner_id!==(input.ownerId ?? null)) throw new Error("Block requires verified content in matching scope");
  const resource=await ensureEntity({namespace:"anirium:data-resource",value:JSON.stringify([input.ownerId ?? null,input.logicalKey]),sourceKey:"verified:index-manifest"},{kind:"RESOURCE",ownerId:input.ownerId},client);
  await client.query("SELECT id FROM canonical_entities WHERE id=$1 FOR UPDATE",[resource.id]);
  const existing=(await client.query("SELECT * FROM canonical_data_blocks WHERE resource_id=$1 AND content_id=$2",[resource.id,content.id])).rows[0];
  if (existing) {
    if (existing.previous_block_id!==(input.previousBlockId ?? null)) throw new Error("Block replay predecessor conflict");
    return existing;
  }
  const head=(await client.query("SELECT id,revision FROM canonical_data_blocks WHERE resource_id=$1 ORDER BY revision DESC LIMIT 1",[resource.id])).rows[0];
  if ((head?.id ?? null)!==(input.previousBlockId ?? null)) throw new Error("Block predecessor conflict");
  return (await client.query(`INSERT INTO canonical_data_blocks(resource_id,content_id,schema_version,coverage,revision,previous_block_id)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[resource.id,content.id,content.validated_manifest.schemaVersion,content.validated_manifest.coverage,(head?.revision ?? 0)+1,input.previousBlockId ?? null])).rows[0];
}

export async function readDataBlocks(client:PoolClient,resourceId:string,ownerId?:string) {
  return (await client.query(`SELECT b.*,c.content_hash,c.byte_length,c.verified_at FROM canonical_data_blocks b
    JOIN canonical_entities r ON r.id=b.resource_id JOIN canonical_asset_contents c ON c.id=b.content_id JOIN canonical_entities a ON a.id=c.asset_id
    WHERE b.resource_id=$1 AND (r.visibility='public' OR r.owner_id=$2) AND (a.visibility='public' OR a.owner_id=$2)
    ORDER BY b.revision`,[resourceId,ownerId ?? null])).rows.map(row=>({...row,byte_length:Number(row.byte_length),freshness:"snapshot" as const}));
}
