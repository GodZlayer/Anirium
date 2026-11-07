import { catalogAliases } from "../../resources/js/lib/catalogIdentity.mjs";

// A written-media label disagreement does not negate an explicit, unique external identity.
// Keep the established label until authoritative classification evidence permits a change.
export function retainWrittenKind(row, existing) {
  if (!existing || !["MANGA", "NOVEL"].includes(existing.entity_type) || !["MANGA", "NOVEL"].includes(row.entity_type)
    || row.entity_type === existing.entity_type || ["myanimelist", "mal"].includes(row.metadata_source)) return row;
  return { ...row, entity_type: existing.entity_type,
    aliases_json: JSON.stringify([...new Set([...catalogAliases(row), ...catalogAliases({ ...row, entity_type: existing.entity_type })])]) };
}
