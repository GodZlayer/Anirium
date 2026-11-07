import { catalogAliases, WORK_UUID } from "./catalogAliases.mjs";
export { catalogAliases };

export function catalogIdentity(row) {
  if (row.entity_type != null && !["WORK", "MANGA", "NOVEL"].includes(row.entity_type)) throw new Error("Invalid catalog media type");
  if (row.work_id != null && !WORK_UUID.test(row.work_id)) throw new Error("Invalid catalog work UUID");
  const value = row.mal_id ?? (typeof row.id === "number" && row.id > 0 ? row.id : null);
  const mal_id = value == null ? null : Number(value);
  if (mal_id != null && (!Number.isSafeInteger(mal_id) || mal_id < 1)) throw new Error("Invalid catalog MAL identity");
  if (!mal_id && !row.work_id) throw new Error("Invalid catalog identity: missing work UUID or MAL identity");
  const entity_type = ["MANGA", "NOVEL"].includes(row.entity_type) ? row.entity_type : "WORK";
  const media = entity_type === "MANGA" ? "manga" : entity_type === "NOVEL" ? "novel" : "anime";
  const legacy = mal_id ? `${media}:${mal_id}` : null;
  const catalog_key = row.work_id ? `work:${row.work_id}` : legacy;
  if (row.catalog_key && row.catalog_key !== catalog_key && row.catalog_key !== legacy) throw new Error("Conflicting catalog identity");
  const id = mal_id && entity_type !== "NOVEL" ? (entity_type === "MANGA" ? -mal_id : mal_id) : row.work_id ?? catalog_key;
  return { mal_id, entity_type, catalog_key, id, ...(row.work_id ? { work_id: row.work_id } : {}) };
}

export function catalogKey(row) { return catalogIdentity(row).catalog_key; }

export function workReference(row) {
  const identity = catalogIdentity(row);
  if (row.account_reference != null) {
    const key = referenceKey(row.account_reference);
    if (!key || (key !== identity.catalog_key && !catalogAliases(row).includes(key))) throw new Error("Invalid account work reference");
  }
  if (identity.work_id) return identity.work_id;
  // Provider-only input references are resolved before entering the SQL catalog.
  return identity.entity_type !== "WORK" ? `${identity.entity_type.toLowerCase()}:${identity.mal_id}` : String(identity.mal_id);
}

export function referenceKey(reference) {
  const value = String(reference);
  if (WORK_UUID.test(value)) return `work:${value.toLowerCase()}`;
  if (/^[1-9]\d*$/.test(value)) return `anime:${value}`;
  if (/^(anime|manga|novel):[1-9]\d*$/.test(value)) return value;
  return value.startsWith("work:") && WORK_UUID.test(value.slice(5)) ? value.toLowerCase() : null;
}

export function findCatalogWork(catalog, reference) {
  const key = referenceKey(reference);
  return key ? catalog.find(row => catalogKey(row) === key || catalogAliases(row).includes(key)) : undefined;
}
