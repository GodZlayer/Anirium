import type { PoolClient } from "pg";
import type { CatalogTextVariant } from "@/types/anime";
import type { CanonicalEntity } from "./entityIndex";

const contentKinds = new Set(["UNIVERSE", "ARC", "WORK", "SEASON", "EPISODE"]);

async function publicContent(client: PoolClient, entityId: string) {
  if (typeof entityId !== "string" || !entityId.length || entityId.length > 100) throw new Error("Invalid content identity");
  const entity = (await client.query<CanonicalEntity>("SELECT * FROM canonical_entities WHERE id=$1 AND visibility='public'", [entityId])).rows[0];
  return entity && contentKinds.has(entity.kind) ? entity : null;
}

/** Source authorization belongs to the caller; all variants are checked before writing. */
export async function setContentEntityTexts(client: PoolClient, entityId: string, variants: readonly CatalogTextVariant[]) {
  if (!await publicContent(client, entityId)) throw new Error("Public content unavailable");
  if (!Array.isArray(variants) || variants.length > 100) throw new Error("Invalid content texts");
  const seen = new Set<string>();
  for (const v of variants) {
    if (!v || typeof v.value !== "string" || !v.value.length || v.value.length > 100000 || v.value.includes("\0") ||
      ![v.field,v.form].every(s=>typeof s === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(s)) ||
      typeof v.locale !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(v.locale) ||
      typeof v.sourceKey !== "string" || !v.sourceKey.trim() || v.sourceKey.length > 200 || v.sourceKey.includes("\0")) throw new Error("Invalid content text variant");
    const key = JSON.stringify([v.field,v.locale.toLowerCase(),v.form,v.sourceKey]);
    if (seen.has(key)) throw new Error("Duplicate content text variant");
    seen.add(key);
  }
  for (const v of variants) await client.query(`INSERT INTO canonical_text_variants(entity_id,field,locale,form,source_key,value)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(entity_id,field,locale,form,source_key)
    DO UPDATE SET value=EXCLUDED.value,revision=canonical_text_variants.revision+1
    WHERE canonical_text_variants.value IS DISTINCT FROM EXCLUDED.value`, [entityId,v.field,v.locale.toLowerCase(),v.form,v.sourceKey,v.value]);
}

/** Canonical own information for every content level, without a numeric catalog route. */
export async function getContentEntityInfo(client: PoolClient, entityId: string) {
  const entity = await publicContent(client, entityId);
  if (!entity) return null;
  const texts = (await client.query<CatalogTextVariant & { revision: number }>(`SELECT field,locale,form,source_key AS "sourceKey",value,revision
    FROM canonical_text_variants WHERE entity_id=$1 ORDER BY field,locale,form,source_key`, [entityId])).rows;
  const aliases = (await client.query<{ namespace:string; value:string; sourceKey:string }>(`SELECT namespace,value,source_key AS "sourceKey"
    FROM canonical_aliases WHERE entity_id=$1 AND state='active' ORDER BY namespace,value`, [entityId])).rows;
  return { entity, texts, aliases };
}
