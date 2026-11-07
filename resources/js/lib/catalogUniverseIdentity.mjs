import { WORK_UUID } from "./catalogAliases.mjs";

export function catalogUniverseIds(work) {
  if (work?.universe_identity_version!==1) return [];
  let values;try {values=JSON.parse(work.universe_ids_json || "null");} catch{return [];}
  if (!Array.isArray(values) || !values.length || values.some(id=>typeof id!=="string" || !WORK_UUID.test(id) || id===work.work_id)) return [];
  return [...new Set(values)].sort();
}
