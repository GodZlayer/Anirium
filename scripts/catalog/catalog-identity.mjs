import { catalogKey } from "../../resources/js/lib/catalogIdentity.mjs";
export { catalogKey };

// Anime keys remain numeric for provider integrations; manga keys are disjoint.
export function entityMapKey(row) {
  const key = catalogKey(row), id = Number(row.mal_id ?? row.id);
  return !["MANGA", "NOVEL"].includes(row.entity_type) && Number.isSafeInteger(id) && id > 0 ? id : key;
}
