import { episodeInstant } from "../../resources/js/lib/episodeMetadata.mjs";

export function validJikanEpisode(record) {
  return Number.isSafeInteger(record?.mal_id) && record.mal_id > 0
    && typeof record.title === "string" && record.title.trim()
    && ["title_japanese", "title_romanji", "aired"].every(key => record[key] == null || typeof record[key] === "string")
    && ["filler", "recap"].every(key => typeof record[key] === "boolean");
}

export function normalizeJikanEpisodes(records, work, checkedAt, observations = new Map()) {
  const id = work.mal_id ?? work.id, total = Number(work.episodes ?? work.episodes_count ?? 0);
  if (!Number.isSafeInteger(id) || id < 1 || ["MANGA", "NOVEL"].includes(work.entity_type)
    || !Array.isArray(records) || !records.every(validJikanEpisode)
    || new Set(records.map(item => item.mal_id)).size !== records.length
    || records.some(item => total > 0 && item.mal_id > total)) throw new Error("Invalid Jikan episode records or numbering");
  return { mal_id: id, catalog_key: `anime:${id}`, source: "jikan", upstream: "myanimelist",
    source_url: `https://api.jikan.moe/v4/anime/${id}/episodes`, checked_at: checkedAt,
    mal_episode_count: total > 0 ? total : null, work_titles: {}, external_ids: {}, specials: [], rejected_numbers: [],
    episodes: records.map(item => ({ number: item.mal_id,
      titles: Object.fromEntries([["en", item.title], ["ja", item.title_japanese], ["x-jat", item.title_romanji]]
        .filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => [key, value.trim()])),
      // The endpoint documents an aired date, not a precise broadcast instant.
      air_date: episodeInstant(item.aired) === null ? null : item.aired.slice(0, 10), air_date_utc: null,
      source_flags: { filler: item.filler, recap: item.recap }, checked_at: observations.get(item.mal_id) || checkedAt,
    })).sort((a, b) => a.number - b.number) };
}
