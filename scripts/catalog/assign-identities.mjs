import { catalogIdentity, catalogAliases } from "../../resources/js/lib/catalogIdentity.mjs";
import { registerWork } from "./work-registry.mjs";

export function assignIdentity(row, registry) {
  let references;
  try { references = JSON.parse(row.external_ids_json || "[]"); } catch { throw new Error("Invalid external ID document"); }
  const confirmedNovel = row.metadata_source === "myanimelist" && ["NOVEL", "LIGHT_NOVEL"].includes(row.format);
  const correctedNovel = row.entity_type === "MANGA" && confirmedNovel;
  const entity_type = correctedNovel ? "NOVEL" : ["MANGA", "NOVEL"].includes(row.entity_type) ? row.entity_type : "WORK";
  if (row.mal_id != null) references.push({ provider: "mal", media: entity_type === "WORK" ? "anime" : "manga", id: String(row.mal_id) });
  const identity = registerWork(registry, { entity_type, references, work_id: row.work_id, title:row.title,
    aliases: [...new Set([...catalogAliases(row), ...catalogAliases({ ...row, entity_type })])],
    media_evidence: confirmedNovel ? { source: "myanimelist", field: "format", value: row.format, mal_id: String(row.mal_id), observed_at: row.metadata_checked_at || null } : undefined });
  const linkedMal = identity.references.find(ref => ref.provider === "mal" && ref.media === (entity_type === "WORK" ? "anime" : "manga"));
  const result = { ...row, entity_type, mal_id: linkedMal ? Number(linkedMal.id) : row.mal_id ?? null, work_id: identity.work_id, account_reference: identity.account_reference, external_ids_json: JSON.stringify(identity.references), aliases_json: JSON.stringify(identity.aliases) };
  const canonical = catalogIdentity({ ...result, catalog_key: undefined });
  return { ...result, catalog_key: canonical.catalog_key, id: String(canonical.id), mal_id: canonical.mal_id };
}
