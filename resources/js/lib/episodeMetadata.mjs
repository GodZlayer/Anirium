import { episodeEvidence, classifyEpisode } from "./episodeClassification.mjs";
import { validEpisodeComposition } from "./episodeCompositionEvidence.mjs";

export function episodeInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = Date.parse(value.slice(0, 10));
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function readEpisodeMetadata(document, work) {
  const id = Number(work?.mal_id ?? work?.id);
  if (["MANGA", "NOVEL"].includes(work?.entity_type) || !Number.isSafeInteger(id) || id < 1 || document?.mal_id !== id
    || document.catalog_key !== `anime:${id}`
    || !Array.isArray(document.episodes) || document.episodes.some(item => !item || typeof item !== "object" || Array.isArray(item))
    || !(document.source === "anizip" && document.source_url === `https://api.ani.zip/mappings?mal_id=${id}`
      || document.source === "jikan" && document.upstream === "myanimelist" && document.source_url === `https://api.jikan.moe/v4/anime/${id}/episodes`
      || document.source === "anirium" && validEpisodeComposition(document, id))
    || !Number.isFinite(Date.parse(document.checked_at)) || !Array.isArray(document.episodes)) return null;
  const total = Number(work.episodes ?? work.episodes_count ?? 0);
  const ids = new Set();
  for (const episode of document.episodes) {
    if (!Number.isSafeInteger(episode.number) || episode.number < 1 || (total > 0 && episode.number > total)
      || ids.has(episode.number) || !episode.titles || typeof episode.titles !== "object" || Array.isArray(episode.titles)
      || Object.values(episode.titles).some(value => typeof value !== "string")) return null;
    ids.add(episode.number);
  }
  return document;
}

export function episodeTitle(episode, language, fallback) {
  const titles = episode?.titles || {};
  return titles[language] || titles[language?.split("-")[0]] || titles.en || titles.ja || fallback;
}

export function episodeReleaseState(episode, now = Date.now()) {
  const time = episodeInstant(episode?.air_date_utc);
  return time === null ? "unknown" : time <= now ? "released" : "upcoming";
}

export function episodeNumbersFor(work, document) {
  if (!work || ["MANGA", "NOVEL"].includes(work.entity_type)) return [];
  const total = Number(work.episodes ?? work.episodes_count ?? 0);
  const numbers = new Set(readEpisodeMetadata(document, work)?.episodes.map(episode => episode.number) || []);
  const evidence = episodeEvidence(work);
  for (const category of ["canon", "manga_canon", "anime_canon", "mixed", "filler"]) {
    if (!Array.isArray(evidence?.[category])) continue;
    for (const range of evidence[category]) {
      const match = /^(\d+)(?:-(\d+))?$/.exec(String(range));
      if (!match) continue;
      const start = Number(match[1]), end = Number(match[2] || match[1]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 2000) continue;
      for (let number = start; number <= end && (total <= 0 || number <= total); number++) {
        if (classifyEpisode(work, number) !== "unknown") numbers.add(number);
      }
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

export function adjacentEpisode(numbers, current, direction) {
  return direction > 0 ? numbers.find(number => number > current) ?? current : [...numbers].reverse().find(number => number < current) ?? current;
}
