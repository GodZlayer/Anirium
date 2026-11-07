import { catalogAliases } from "../../resources/js/lib/catalogAliases.mjs";
import { externalKey } from "./external-identity.mjs";

export function assertPublicationRegistryIdentity(row, registry) {
  if (!registry) return;
  const work=registry.works[row.work_id];
  if (!work || (work.entity_type!==row.entity_type && !work.media_history?.some(change=>change.from===row.entity_type))) {
    throw new Error("Generation work missing from registry");
  }
  for (const alias of catalogAliases(row)) {
    if (alias===`work:${row.work_id}`) continue;
    if (registry.aliases[alias]!==row.work_id) throw new Error("Publication alias differs from canonical SQL identity");
  }
  const references=JSON.parse(row.external_ids_json || "[]");
  if (!Array.isArray(references)) throw new Error("Invalid publication references");
  for (const ref of references) {
    if (registry.references[externalKey(ref)]!==row.work_id) throw new Error("Publication provider reference differs from canonical SQL identity");
  }
  if (row.mal_id!=null) {
    const media=row.entity_type==="WORK" ? "anime" : "manga";
    if (registry.references[`mal:${media}:${row.mal_id}`]!==row.work_id) throw new Error("Publication MAL identifier differs from canonical SQL identity");
  }
}
