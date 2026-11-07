import { catalogKey, catalogAliases, referenceKey } from "./catalogIdentity.mjs";
import { WORK_UUID } from "./catalogAliases.mjs";

export function episodeReference(value) {
  const match = /^(?:episode:)?(.+):ep-([1-9]\d*)$/.exec(String(value));
  if (!match) return null;
  const work = referenceKey(match[1]), episode = Number(match[2]);
  return work && !/^(manga|novel):/.test(work) && Number.isSafeInteger(episode) ? { work, episode } : null;
}

export function completedEpisodeIndex(preferences, catalog) {
  const aliases = new Map(), written = new Set();
  for (const work of catalog) {
    const key = catalogKey(work);
    for (const alias of [key, ...catalogAliases(work)]) aliases.set(alias, key);
    if (["MANGA", "NOVEL"].includes(work.entity_type)) written.add(key);
  }
  const completed = new Map();
  for (const preference of preferences) {
    if (preference.status !== "completed" || preference.target_type !== "episode") continue;
    const canonical = WORK_UUID.test(preference.entity_id || preference.target_id || "") && WORK_UUID.test(preference.work_id || "")
      && Number.isSafeInteger(preference.episode_number) && preference.episode_number > 0;
    const reference = canonical ? { work: `work:${preference.work_id}`, episode: preference.episode_number } : episodeReference(preference.target_id);
    if (!reference) continue;
    const key = aliases.get(reference.work) || reference.work;
    if (written.has(key)) continue;
    if (!completed.has(key)) completed.set(key, new Set());
    completed.get(key).add(reference.episode);
  }
  return completed;
}
