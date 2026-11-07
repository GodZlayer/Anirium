import { episodeInstant } from "../../resources/js/lib/episodeMetadata.mjs";

const LANGUAGES = ["pt-BR", "pt", "en", "ja", "es", "fr", "de", "x-jat"];
const titles = values => Object.fromEntries(LANGUAGES.filter(language => typeof values?.[language] === "string" && values[language].trim()).map(language => [language, values[language].trim()]));

export function normalizeAniZip(data, work, checkedAt) {
  const id = Number(work.mal_id ?? work.id);
  if (!Number.isSafeInteger(id) || id < 1 || Number(data?.mappings?.mal_id) !== id || work.entity_type === "MANGA"
    || !data.episodes || typeof data.episodes !== "object" || Array.isArray(data.episodes)) {
    throw Object.assign(new Error(`AniZip mapping mismatch for MAL ${id}`), { status: 422 });
  }
  const total = Number(work.episodes ?? work.episodes_count ?? 0);
  const episodes = [], specials = [], rejected = [];
  for (const [key, raw] of Object.entries(data.episodes)) {
    if (!raw || typeof raw !== "object" || (raw.episode != null && String(raw.episode) !== key)) {
      throw Object.assign(new Error(`Invalid AniZip episode identity for MAL ${id}`), { status: 422 });
    }
    const instant = episodeInstant(raw.airDateUtc);
    const day = raw.airDate || raw.airdate || "";
    const dayTime = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(day) : NaN;
    const item = { titles: titles(raw.title), air_date_utc: instant === null ? null : new Date(instant).toISOString(),
      air_date: Number.isFinite(dayTime) && new Date(dayTime).toISOString().slice(0, 10) === day ? day : null,
      runtime_minutes: Number(raw.runtime ?? raw.length) > 0 ? Number(raw.runtime ?? raw.length) : null,
      anidb_episode_id: Number(raw.anidbEid) > 0 ? Number(raw.anidbEid) : null,
      tvdb_episode_id: Number(raw.tvdbId) > 0 ? Number(raw.tvdbId) : null,
      tvdb_season: Number.isSafeInteger(raw.seasonNumber) ? raw.seasonNumber : null,
      tvdb_episode_number: Number.isSafeInteger(raw.episodeNumber) ? raw.episodeNumber : null,
      absolute_episode_number: Number.isSafeInteger(raw.absoluteEpisodeNumber) ? raw.absoluteEpisodeNumber : null };
    if (/^[1-9]\d*$/.test(key)) {
      const number = Number(key);
      if (!Number.isSafeInteger(number) || (total > 0 && number > total)) { rejected.push(key); continue; }
      episodes.push({ number, ...item });
    } else specials.push({ key, ...item });
  }
  return { mal_id: id, catalog_key: `anime:${id}`, source: "anizip", source_url: `https://api.ani.zip/mappings?mal_id=${id}`,
    checked_at: checkedAt, mal_episode_count: total > 0 ? total : null, work_titles: titles(data.titles),
    external_ids: Object.fromEntries(["anilist_id", "anidb_id", "kitsu_id", "imdb_id", "thetvdb_id", "themoviedb_id"].filter(key => data.mappings[key] != null).map(key => [key, data.mappings[key]])),
    episodes: episodes.sort((a, b) => a.number - b.number), specials, rejected_numbers: rejected };
}
