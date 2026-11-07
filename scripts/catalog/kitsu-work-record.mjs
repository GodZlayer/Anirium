import { fieldProvenance } from "./field-provenance.mjs";
import { kitsuIdentity, kitsuReferences, kitsuRelations } from "./kitsu-evidence.mjs";

const positive = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;

export function kitsuWorkRecord(payload, observedAt) {
  if (!Number.isFinite(Date.parse(observedAt)) || !Array.isArray(payload?.included)) throw new Error("Invalid Kitsu observation");
  const resource = payload.data, identity = kitsuIdentity(resource), attributes = resource.attributes;
  if (typeof attributes?.canonicalTitle !== "string" || !attributes.canonicalTitle.trim()) throw new Error("Missing Kitsu title");
  const references = kitsuReferences(resource, payload.included), written = identity.media === "manga";
  const malId = references.find(reference => reference.provider === "mal")?.id;
  if (malId && !positive(Number(malId))) throw new Error("Unsafe MAL mapping identity");
  const row = { entity_type: written ? ["novel", "light_novel"].includes(attributes.subtype) ? "NOVEL" : "MANGA" : "WORK",
    ...(malId ? { mal_id: Number(malId) } : {}), title: attributes.canonicalTitle,
    title_english: attributes.titles?.en || null, title_japanese: attributes.titles?.ja_jp || null,
    synonyms_json: JSON.stringify((attributes.abbreviatedTitles || []).filter(value => typeof value === "string" && value.trim())),
    synopsis: typeof attributes.synopsis === "string" && attributes.synopsis.trim() ? attributes.synopsis : null,
    status: { current: "RELEASING", finished: "COMPLETED", upcoming: "NOT_YET_RELEASED", unreleased: "NOT_YET_RELEASED", tba: "UNKNOWN" }[attributes.status] || "UNKNOWN",
    format: typeof attributes.subtype === "string" ? attributes.subtype.toUpperCase() : "UNKNOWN",
    start_date: date(attributes.startDate), end_date: date(attributes.endDate),
    ...(written ? { chapters_count: positive(attributes.chapterCount), volumes_count: positive(attributes.volumeCount) } : { episodes: positive(attributes.episodeCount) }),
    external_ids_json: JSON.stringify(references), source_relations_json: JSON.stringify(kitsuRelations(resource, payload.included, observedAt)),
    metadata_source: "kitsu", metadata_checked_at: observedAt };
  // Provider ratings never masquerade as MAL scores; counts do not create episode/chapter indices.
  row.field_provenance_json = fieldProvenance(row, { provider: "kitsu", source_url: `https://kitsu.app/api/edge/${identity.media}/${identity.id}`,
    observed_at: observedAt, imported_at: new Date().toISOString(), source_updated_at: attributes.updatedAt || null,
    version: "edge", license: "Kitsu and original content terms; redistribution not yet validated" });
  return row;
}
