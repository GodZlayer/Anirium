import type { PoolClient } from "pg";
import type { CatalogTextVariant } from "@/types/anime";
import { setContentEntityTexts } from "./contentEntityInfo";

/** Legacy columns have no reliable language provenance; keep it explicitly unknown. */
export function legacyCatalogTexts(row: Record<string,any>): CatalogTextVariant[] {
  return [["title","default",row.title],["title","english",row.title_english],["title","native",row.title_japanese],
    ["title","portuguese",row.title_portuguese],["description","full",row.synopsis]]
    .filter((entry)=>typeof entry[2] === "string" && entry[2].length>0)
    .map(([field,form,value])=>({field,form,locale:"und",sourceKey:"legacy:catalog",value}));
}

export function resolveCatalogText(variants: readonly CatalogTextVariant[] | undefined, field: string, locales: readonly string[], forms: readonly string[]): string | undefined {
  for (const locale of locales) for (const form of forms) {
    const candidates = variants?.filter(v=>v.field===field && v.locale.toLowerCase()===locale.toLowerCase() && v.form===form);
    candidates?.sort((a,b)=>a.sourceKey.localeCompare(b.sourceKey));
    if (candidates?.length) return candidates[0].value;
  }
  return undefined;
}

/** Transactional canonical write plus compatibility projection; absent variants are preserved. */
export async function indexCatalogTexts(client: PoolClient, routeId: number, supplied?: readonly CatalogTextVariant[]) {
  const row = (await client.query("SELECT * FROM anime_catalog WHERE mal_id=$1 FOR UPDATE",[routeId])).rows[0];
  if (!row) throw new Error("Catalog text route unavailable");
  const entityId = row.composition_season_id ?? row.canonical_entity_id;
  if (!entityId) throw new Error("Catalog text identity unavailable");
  const raw = supplied ?? row.text_variants_json ?? [];
  if (!Array.isArray(raw)) throw new Error("Invalid catalog text variants");
  const observed = raw.filter((v:CatalogTextVariant)=>v?.sourceKey!=="legacy:catalog");
  const variants = [...observed,...legacyCatalogTexts(row)];
  if (!Array.isArray(variants) || variants.length>100) throw new Error("Invalid catalog text variants");
  await setContentEntityTexts(client,entityId,variants);
  const projection = (await client.query(`SELECT field,locale,form,source_key AS "sourceKey",value,revision FROM canonical_text_variants
    WHERE entity_id=$1 ORDER BY field,locale,form,source_key`,[entityId])).rows;
  await client.query("UPDATE anime_catalog SET text_variants_json=$2::jsonb WHERE mal_id=$1",[routeId,JSON.stringify(projection)]);
}
