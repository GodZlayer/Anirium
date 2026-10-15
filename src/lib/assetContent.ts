import type { PoolClient } from "pg";
import { open, realpath } from "node:fs/promises";
import { relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { readAssetLocations } from "./assetLocations";

/** Verify bytes within a caller-authorized root. This is a snapshot, never a live availability claim. */
export async function verifyLocalAssetContent(client: PoolClient, input: {assetId:string;ownerId?:string;allowedRoot:string;maximumBytes:number;validateIndexManifest?:boolean}) {
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes<1 || !isAbsolute(input.allowedRoot)) throw new Error("Invalid asset verification quota/root");
  const asset=(await client.query("SELECT * FROM canonical_entities WHERE id=$1 AND kind='ASSET' AND (visibility='public' OR owner_id=$2) FOR UPDATE",[input.assetId,input.ownerId ?? null])).rows[0];
  if (!asset) throw new Error("Asset unavailable in account scope");
  const location=(await readAssetLocations(client,input.assetId,input.ownerId)).find(row=>row.backend==='local');
  if (!location) throw new Error("Local asset unavailable");
  const root=await realpath(input.allowedRoot),file=await realpath(location.locator),inside=relative(root,file);
  if (!inside || inside==='..' || inside.startsWith('..\\') || inside.startsWith('../') || isAbsolute(inside)) throw new Error("Asset path outside authorized root");
  const handle=await open(file,'r');
  let length=0,hash:string,manifest:any=null;
  try {
    const before=await handle.stat({bigint:true});
    if (!before.isFile() || before.size>BigInt(input.maximumBytes)) throw new Error("Asset verification quota exceeded");
    const digest=createHash('sha256'),chunk=Buffer.alloc(64*1024),parts:Buffer[]=[];
    for (;;) {
      const read=await handle.read(chunk,0,chunk.length,null);
      if (!read.bytesRead) break;
      length+=read.bytesRead;
      if (length>input.maximumBytes || (input.validateIndexManifest && length>2*1024*1024)) throw new Error("Asset verification quota exceeded");
      digest.update(chunk.subarray(0,read.bytesRead));
      if (input.validateIndexManifest) parts.push(Buffer.from(chunk.subarray(0,read.bytesRead)));
    }
    const after=await handle.stat({bigint:true});
    if (before.size!==after.size || before.mtimeNs!==after.mtimeNs || before.ctimeNs!==after.ctimeNs || BigInt(length)!==after.size) throw new Error("Asset changed during verification");
    hash=digest.digest('hex');
    if (input.validateIndexManifest) {
      manifest=JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (!manifest || Object.keys(manifest).sort().join(',')!=='coverage,entities,schemaVersion' || manifest.schemaVersion!==1 ||
        typeof manifest.coverage!=='string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(manifest.coverage) || !Array.isArray(manifest.entities) || manifest.entities.length>10000) throw new Error("Invalid canonical index manifest");
      const ids=new Set<string>();
      for (const entity of manifest.entities) {
        if (!entity || Object.keys(entity).sort().join(',')!=='id,kind' || typeof entity.id!=='string' || typeof entity.kind!=='string' || ids.has(entity.id)) throw new Error("Invalid manifest entity");
        ids.add(entity.id);
      }
      const proven=(await client.query("SELECT id,kind,visibility,owner_id FROM canonical_entities WHERE id=ANY($1::text[])",[[...ids]])).rows;
      const byId=new Map(proven.map(row=>[row.id,row]));
      for (const entity of manifest.entities) {
        const row=byId.get(entity.id);
        if (!row || row.kind!==entity.kind || (row.visibility!=='public' && row.owner_id!==(input.ownerId ?? null)) || (asset.visibility==='public' && row.visibility!=='public')) throw new Error("Manifest entity scope conflict");
      }
    }
  } finally { await handle.close(); }
  const existing=(await client.query("SELECT * FROM canonical_asset_contents WHERE asset_id=$1 AND content_hash=$2",[asset.id,hash])).rows[0];
  if (existing && Number(existing.byte_length)!==length) throw new Error("Content verification contract conflict");
  const result=existing ?? (await client.query(`INSERT INTO canonical_asset_contents(asset_id,content_hash,byte_length,revision)
    SELECT $1,$2,$3,COALESCE(MAX(revision),0)+1 FROM canonical_asset_contents WHERE asset_id=$1 RETURNING *`,[asset.id,hash,length])).rows[0];
  if (manifest) await client.query("INSERT INTO canonical_index_manifests(content_id,validated_manifest) VALUES($1,$2::jsonb) ON CONFLICT(content_id) DO NOTHING",[result.id,JSON.stringify(manifest)]);
  return {...result,byte_length:Number(result.byte_length),validated_manifest:manifest,freshness:"snapshot" as const};
}
