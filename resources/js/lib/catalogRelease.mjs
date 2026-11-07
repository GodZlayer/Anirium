import { WORK_UUID } from "./catalogAliases.mjs";
import { episodeInstant } from "./episodeMetadata.mjs";

export function readCatalogRelease(value, workId) {
  if (value == null) return undefined;
  if (!WORK_UUID.test(value.id || "") || !WORK_UUID.test(workId || "") || value.work_id !== workId
    || !Number.isSafeInteger(value.number) || value.number < 1 || episodeInstant(value.air_date_utc) === null) throw new Error("Invalid catalog episode release");
  return { id:value.id, work_id:workId, number:value.number, air_date_utc:value.air_date_utc };
}

export function validateHomeReleases(items) {
  if(items.length>3 || items.some(item=>!item.release)
    || new Set(items.map(item=>item.release.id)).size!==items.length) throw new Error("Home requires distinct episode identities");
  return items;
}
