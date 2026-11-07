import { malMetadataPatch } from "./mal-metadata.mjs";
import { fieldProvenance } from "./field-provenance.mjs";

const positive = value => Number.isSafeInteger(value) && value > 0 ? value : null;
export function malWorkRecord(payload, media, checkedAt) {
  if (!["anime", "manga"].includes(media) || !positive(payload.id) || typeof payload.title !== "string" || !payload.title.trim() || !Number.isFinite(Date.parse(checkedAt))) throw new Error("Invalid MAL work evidence");
  const written = media === "manga", novel = ["novel", "light_novel"].includes(payload.media_type);
  const status = { finished_airing: "COMPLETED", finished: "COMPLETED", currently_airing: "RELEASING", currently_publishing: "RELEASING", not_yet_aired: "NOT_YET_RELEASED", not_yet_published: "NOT_YET_RELEASED", on_hiatus: "HIATUS", discontinued: "CANCELLED" }[payload.status] || "UNKNOWN";
  const row = { ...malMetadataPatch(payload), mal_id: payload.id, entity_type: written ? novel ? "NOVEL" : "MANGA" : "WORK", status,
    metadata_source: "myanimelist", metadata_checked_at: checkedAt,
    external_ids_json: JSON.stringify([{ provider: "mal", media, id: String(payload.id) }]) };
  if (written) { row.chapters_count = positive(payload.num_chapters); row.volumes_count = positive(payload.num_volumes); }
  if (!payload.status) delete row.status;
  if (row.images_json === "{}") delete row.images_json;
  row.field_provenance_json = fieldProvenance(row, { provider: "myanimelist", source_url: `https://myanimelist.net/${media}/${payload.id}`,
    observed_at: checkedAt, imported_at: new Date().toISOString(), version: "v2", license: "MyAnimeList API terms" });
  return row;
}
