export const WORK_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const validCatalogAlias = value => typeof value === "string" && (/^(anime|manga|novel):[1-9]\d*$/.test(value) || (value.startsWith("work:") && WORK_UUID.test(value.slice(5))));

export function catalogAliases(row) {
  let aliases = [];
  try { aliases = JSON.parse(row.aliases_json || "[]"); } catch { throw new Error("Invalid catalog aliases"); }
  if (!Array.isArray(aliases) || aliases.some(value => !validCatalogAlias(value))) throw new Error("Invalid catalog aliases");
  const media = row.entity_type === "MANGA" ? "manga" : row.entity_type === "NOVEL" ? "novel" : "anime";
  const mal = Number(row.mal_id ?? (typeof row.id === "number" && row.id > 0 ? row.id : NaN));
  if (Number.isSafeInteger(mal) && mal > 0) aliases.push(`${media}:${mal}`);
  if (row.work_id) aliases.push(`work:${row.work_id}`);
  return [...new Set(aliases)];
}
