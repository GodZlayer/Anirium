import path from "node:path";
import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { validJikanEpisode, normalizeJikanEpisodes } from "./jikan-episode-record.mjs";
import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";

export async function readJikanEpisodes(work, read, { directory, now = Date.now, maximumPages = 2000 } = {}) {
  const id = work.mal_id ?? work.id, total = Number(work.episodes ?? work.episodes_count ?? 0) || null;
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(maximumPages) || maximumPages < 1 || maximumPages > 2000) throw new Error("Invalid Jikan episode query");
  const stateFile = path.join(directory, String(id), "checkpoint.json");
  let state = readJson(stateFile);
  const age = now() - Date.parse(state?.startedAt);
  if (state?.schema !== 1 || state.id !== id || state.episodeTotal !== total || !WORK_UUID.test(state.generation || "")
    || state.completedAt || !(age >= 0 && age < 24 * 3600000)) {
    state = { schema: 1, id, episodeTotal: total, generation: randomUUID(), startedAt: new Date(now()).toISOString() };
    writeJson(stateFile, state);
  }
  const records = [], seen = new Set(), observations = new Map();
  for (let page = 1; page <= maximumPages; page++) {
    const file = path.join(directory, String(id), "pages", `${page}.json`);
    let saved = readJson(file);
    const valid = value => value?.generation === state.generation && Number.isFinite(Date.parse(value.observedAt))
      && Date.parse(value.observedAt) >= Date.parse(state.startedAt) && Date.parse(value.observedAt) <= now()
      && Array.isArray(value.payload?.data) && value.payload.data.every(validJikanEpisode)
      && typeof value.payload.pagination?.has_next_page === "boolean"
      && (value.payload.pagination.current_page == null || value.payload.pagination.current_page === page);
    let fetched = false;
    if (!valid(saved)) {
      const payload = await read(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`);
      saved = { generation: state.generation, observedAt: new Date(now()).toISOString(), payload }; fetched = true;
      if (!valid(saved)) throw new Error("Invalid Jikan episode page");
    }
    if (saved.payload.pagination.has_next_page && saved.payload.data.length === 0) throw new Error("Jikan episode pagination made no progress");
    for (const item of saved.payload.data) {
      if (seen.has(item.mal_id) || (total && item.mal_id > total)) throw new Error("Conflicting Jikan episode numbering");
      seen.add(item.mal_id); records.push(item); observations.set(item.mal_id, saved.observedAt);
    }
    if (fetched) writeJson(file, saved);
    if (!saved.payload.pagination.has_next_page) {
      const document = normalizeJikanEpisodes(records, work, state.startedAt, observations);
      return { document, complete: () => writeJson(stateFile, { ...state, completedAt: new Date(now()).toISOString() }) };
    }
  }
  throw new Error("Jikan episode pagination budget exceeded");
}
