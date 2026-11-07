import path from "node:path";
import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";

export function seasonalCheckpoint(directory, scope, validRecord, now = Date.now) {
  if (!["now", "upcoming"].includes(scope)) throw new Error("Invalid seasonal checkpoint scope");
  const stateFile = path.join(directory, `checkpoint-${scope}.json`);
  let state = readJson(stateFile);
  const age = now() - Date.parse(state?.startedAt);
  if (state?.schema !== 1 || state.scope !== scope || !WORK_UUID.test(state.generation || "") || state.completedAt || !(age >= 0 && age < 6 * 3600000)) {
    state = { schema: 1, scope, generation: randomUUID(), startedAt: new Date(now()).toISOString() };
    writeJson(stateFile, state);
  }
  const observed = new Map();
  const pageFile = page => {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2000) throw new Error("Seasonal page budget exceeded");
    return path.join(directory, "pages", scope, `${page}.json`);
  };
  const recordTimes = saved => { for (const record of saved.payload.data) observed.set(record.mal_id, saved.observedAt); };
  return {
    startedAt: state.startedAt,
    cachedPage(page) {
      const saved = readJson(pageFile(page)), age = now() - Date.parse(saved?.observedAt);
      if (saved?.generation !== state.generation || !(age >= 0 && age < 6 * 3600000)
        || !Array.isArray(saved.payload?.data) || !saved.payload.data.every(validRecord)
        || typeof saved.payload.pagination?.has_next_page !== "boolean") return null;
      recordTimes(saved);
      return saved.payload;
    },
    savePage(page, payload) {
      const saved = { generation: state.generation, observedAt: new Date(now()).toISOString(), payload };
      writeJson(pageFile(page), saved); recordTimes(saved);
    },
    records(values) { return values.map(record => ({ ...record, source_checked_at: observed.get(record.mal_id) })); },
    complete() { writeJson(stateFile, { ...state, completedAt: new Date(now()).toISOString() }); },
  };
}
