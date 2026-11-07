const primitiveFields = ["number", "air_date_utc", "air_date", "runtime_minutes", "anidb_episode_id", "tvdb_episode_id", "tvdb_season", "tvdb_episode_number", "absolute_episode_number"];
const present = value => value !== null && value !== undefined && value !== "";
export function episodeFields(value, root = false) {
  const fields = [];
  for (const key of root ? ["specials", "rejected_numbers"] : primitiveFields) {
    if (present(value?.[key]) && (!Array.isArray(value[key]) || value[key].length)) fields.push([key, value[key]]);
  }
  for (const key of root ? ["work_titles", "external_ids"] : ["titles", "source_flags"]) {
    for (const [child, item] of Object.entries(value?.[key] || {})) if (present(item)) fields.push([`${key}.${child}`, item]);
  }
  return fields.sort(([a], [b]) => a.localeCompare(b, "en"));
}
export function validEpisodeField(field, value, root = false) {
  if (/^(titles|work_titles)\.[a-zA-Z][a-zA-Z0-9-]{0,15}$/.test(field)) return (root ? field.startsWith("work_titles.") : field.startsWith("titles.")) && typeof value === "string" && Boolean(value.trim());
  if (/^source_flags\.(filler|recap)$/.test(field)) return !root && typeof value === "boolean";
  if (/^external_ids\.(anilist_id|anidb_id|kitsu_id|imdb_id|thetvdb_id|themoviedb_id)$/.test(field)) return root && (typeof value === "string" || typeof value === "number");
  if (["specials", "rejected_numbers"].includes(field)) return root && Array.isArray(value);
  if (root || !primitiveFields.includes(field)) return false;
  if (field === "air_date") return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (field === "air_date_utc") return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  return field === "runtime_minutes" ? Number.isFinite(value) && value > 0 : Number.isSafeInteger(value) && value >= (field === "tvdb_season" ? 0 : 1);
}
export function setEpisodeField(target, field, value) {
  const [key, child] = field.split(".");
  if (child) { target[key] ||= {}; target[key][child] = value; }
  else target[key] = value;
}
export function validEpisodeEvidence(value, id) {
  if (!value || typeof value.observed_at !== "string" || !Number.isFinite(Date.parse(value.observed_at))) return false;
  return value.provider === "anizip" && value.source_url === `https://api.ani.zip/mappings?mal_id=${id}`
    || value.provider === "jikan" && value.upstream === "myanimelist" && value.source_url === `https://api.jikan.moe/v4/anime/${id}/episodes`;
}
