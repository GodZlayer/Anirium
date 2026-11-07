import { animeReference } from "./provider-reference.mjs";
import { validateReferences } from "./external-identity.mjs";
import { fieldProvenance } from "./field-provenance.mjs";

export function offlineAnimeRecord(record, provenance) {
  if (!record || typeof record.title !== "string" || !record.title.trim() || !Array.isArray(record.sources)
    || !["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "UNKNOWN"].includes(record.type)) throw new Error("Invalid offline anime record");
  const references = validateReferences(record.sources.map(animeReference).filter(Boolean));
  const mal = references.find(ref => ref.provider === "mal");
  const status = { FINISHED: "COMPLETED", ONGOING: "RELEASING", UPCOMING: "NOT_YET_RELEASED", UNKNOWN: "UNKNOWN" }[record.status];
  if (!status) throw new Error("Invalid offline anime status");
  const values = { title: record.title, format: record.type, status, entity_type: "WORK", mal_id: mal ? Number(mal.id) : null,
    episodes: status === "COMPLETED" && Number.isSafeInteger(record.episodes) && record.episodes > 0 ? record.episodes : null,
    observed_episode_count: Number.isSafeInteger(record.episodes) && record.episodes > 0 ? record.episodes : null,
    year: Number.isSafeInteger(record.animeSeason?.year) ? record.animeSeason.year : null,
    images_json: JSON.stringify(record.picture ? { jpg: { image_url: record.thumbnail || record.picture, large_image_url: record.picture } } : {}),
    synonyms_json: JSON.stringify(record.synonyms || []), external_ids_json: JSON.stringify(references),
    aggregate_score_json: record.score ? JSON.stringify({ source: "anime-offline-database", values: record.score }) : null,
    source_relations_json: JSON.stringify((record.relatedAnime || []).map(animeReference).filter(Boolean)
      .map(target => ({ source: "anime-offline-database", target, relation_type: "unspecified" }))) };
  const evidence = { provider: "anime-offline-database", version: provenance.version, source_url: provenance.url,
    observed_at: provenance.sourceUpdatedAt, imported_at: provenance.importedAt, digest: provenance.digest, license: provenance.license || "ODbL-1.0 + DbCL-1.0" };
  values.field_provenance_json = fieldProvenance(values, evidence);
  return values;
}
