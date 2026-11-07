import { fieldProvenance } from "./field-provenance.mjs";

export function jikanWorkRecord(payload) {
  if (!Number.isSafeInteger(payload.mal_id) || payload.mal_id < 1 || typeof payload.title !== "string" || !payload.title.trim()
    || !Number.isFinite(Date.parse(payload.source_checked_at))) throw new Error("Invalid Jikan work evidence");
  const row = { entity_type: "WORK", mal_id: payload.mal_id, title: payload.title, title_english: payload.title_english || null,
    title_japanese: payload.title_japanese || null, synopsis: payload.synopsis || null,
    status: { "Currently Airing": "RELEASING", "Finished Airing": "COMPLETED", "Not yet aired": "NOT_YET_RELEASED" }[payload.status] || "UNKNOWN",
    format: payload.type || "UNKNOWN", episodes: Number.isSafeInteger(payload.episodes) && payload.episodes > 0 ? payload.episodes : null,
    year: payload.year || payload.aired?.prop?.from?.year || null, score: payload.score > 0 ? payload.score : null,
    genres_json: JSON.stringify([...(payload.genres || []), ...(payload.explicit_genres || [])]), images_json: JSON.stringify(payload.images || {}),
    external_ids_json: JSON.stringify([{ provider: "mal", media: "anime", id: String(payload.mal_id) }]),
    metadata_source: "jikan", metadata_checked_at: payload.source_checked_at };
  row.field_provenance_json = fieldProvenance(row, { provider: "jikan", upstream: "myanimelist", source_url: `https://api.jikan.moe/v4/anime/${payload.mal_id}`,
    observed_at: payload.source_checked_at, imported_at: new Date().toISOString(), version: "v4", license: "Provider and upstream terms" });
  return row;
}
