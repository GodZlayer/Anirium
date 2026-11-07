const integer = value => /^\d+$/.test(String(value ?? "")) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const SOURCES = { my_anime_list: "mal", kitsu: "kitsu", anilist: "anilist", manga_updates: "mangaupdates", shikimori: "shikimori", anime_planet: "anime-planet" };

export function mangabakaRecord(record, provenance) {
  if (!integer(record?.id) || typeof record.title !== "string" || !record.title.trim() || record.merged_with
    || (record.state && record.state !== "active")) throw new Error("Invalid or retired MangaBaka record");
  if (!["manga", "manhwa", "manhua", "novel", "oel", "other", "oneshot", "doujinshi"].includes(record.type)) throw new Error("Unsupported publication format");
  const references = [{ provider: "mangabaka", media: "manga", id: String(record.id) }];
  for (const [name, provider] of Object.entries(SOURCES)) {
    const id = record.source?.[name]?.id;
    if (id != null && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(id))) references.push({ provider, media: "manga", id: String(id) });
  }
  const mal = references.find(ref => ref.provider === "mal");
  const cover = record.cover?.x350?.x1 || record.cover?.raw?.url;
  const row = { entity_type: record.type === "novel" ? "NOVEL" : "MANGA", mal_id: mal ? Number(mal.id) : null,
    title: record.title, title_japanese: record.original_language === "ja" ? record.native_title || null : null,
    synopsis: record.description || null, year: integer(record.year), format: record.type.toUpperCase(),
    status: { completed: "COMPLETED", ongoing: "RELEASING", upcoming: "NOT_YET_RELEASED", cancelled: "CANCELLED", hiatus: "HIATUS" }[record.status] || "UNKNOWN",
    chapters_count: integer(record.total_chapters), volumes_count: integer(record.final_volume),
    external_ids_json: JSON.stringify(references), genres_json: JSON.stringify((record.genres || []).map(name => ({ name }))),
    images_json: JSON.stringify(cover ? { jpg: { image_url: cover, large_image_url: cover } } : {}),
    synonyms_json: JSON.stringify(Object.values(record.secondary_titles || {}).flat().map(item => item.title).filter(Boolean)),
    source_relations_json: JSON.stringify((record.relationships_v2 || []).map(mangaBakaRelation)),
    metadata_source: "mangabaka", metadata_checked_at: provenance.importedAt,
    start_date: record.published?.start_date_is_estimated ? null : record.published?.start_date || null,
    end_date: record.published?.end_date_is_estimated ? null : record.published?.end_date || null };
  const evidence = { provider: "mangabaka", source_url: record.canonical_url || `https://mangabaka.org/${record.id}`,
    version: provenance.version, observed_at: record.last_updated_at || null, imported_at: provenance.importedAt,
    digest: provenance.digest, license: "CC-BY-NC-SA-4.0; upstream terms apply" };
  row.field_provenance_json = fieldProvenance(row, evidence);
  return row;
}
import { fieldProvenance } from "./field-provenance.mjs";
import { mangaBakaRelation } from "./mangabaka-relations.mjs";

