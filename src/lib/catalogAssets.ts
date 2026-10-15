import type { PoolClient } from "pg";
import { registerAssetLocation, readAssetLocationsBatch, checkedAssetLocator } from "./assetLocations";

/** Public visual projection from current logical links and locations, without per-row queries. */
export async function hydrateCatalogAssets(client: PoolClient, rows: readonly any[]) {
  const entityIds=[...new Set(rows.map(row=>row.catalog_asset_entity_id ?? row.composition_season_id ?? row.canonical_entity_id).filter(Boolean))];
  const links=entityIds.length ? (await client.query(`SELECT l.entity_id,l.asset_id,l.slot FROM canonical_asset_links l
    JOIN canonical_entities e ON e.id=l.entity_id WHERE l.entity_id=ANY($1::text[]) AND e.visibility='public'`,[entityIds])).rows : [];
  const locations=await readAssetLocationsBatch(client,links.map(link=>link.asset_id));
  const https=new Map(locations.filter(location=>location.backend==='https').map(location=>[location.assetId,location]));
  return rows.map(row=>{
    const images:Record<string,Record<string,string>>={},refs=[];
    let banner: string | undefined;
    for(const link of links.filter(link=>link.entity_id===(row.catalog_asset_entity_id ?? row.composition_season_id ?? row.canonical_entity_id))) {
      const location=https.get(link.asset_id);
      if(!location) continue;
      const locator=checkedAssetLocator('https',location.locator);
      if(link.slot==='banner') banner=locator;
      else {
        const match=/^cover\.(jpg|webp)\.(image_url|small_image_url|large_image_url)$/.exec(link.slot);
        if(!match) continue;
        (images[match[1]]??={})[match[2]]=locator;
      }
      refs.push({assetId:location.assetId,slot:link.slot,backend:'https',revision:location.revision,verification:location.verification});
    }
    return {...row,resolved_images_json:images,resolved_banner_image:banner,asset_refs_json:refs};
  });
}

export async function indexCatalogAssets(client: PoolClient, routeId:number) {
  const row=(await client.query("SELECT * FROM anime_catalog WHERE mal_id=$1 FOR UPDATE",[routeId])).rows[0];
  const entityId=row?.composition_season_id ?? row?.canonical_entity_id;
  if (!entityId) throw new Error("Catalog asset identity unavailable");
  const images=row.images_json ?? {},slots:Record<string,unknown>={banner:row.banner_image};
  for (const format of ["jpg","webp"]) for (const size of ["image_url","small_image_url","large_image_url"]) slots[`cover.${format}.${size}`]=images[format]?.[size];
  const refs=[];
  for (const [slot,locator] of Object.entries(slots)) {
    if (typeof locator!=="string" || !locator) continue;
    const ref=await registerAssetLocation(client,{logicalKey:JSON.stringify([routeId,slot]),sourceKey:"catalog:visual",backend:"https",locator,entityId,slot});
    refs.push({...ref,slot});
  }
  const previous=Array.isArray(row.asset_refs_json) ? row.asset_refs_json : [];
  await client.query(`DELETE FROM canonical_asset_links WHERE entity_id=$1 AND asset_id=ANY($2::text[])
    AND NOT (slot=ANY($3::text[]))`,[entityId,previous.map((ref:any)=>ref.assetId),refs.map(ref=>ref.slot)]);
  await client.query("UPDATE anime_catalog SET asset_refs_json=$2::jsonb WHERE mal_id=$1",[routeId,JSON.stringify(refs)]);
}
