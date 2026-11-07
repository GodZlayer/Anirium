import path from "node:path";
import { collectCatalogPages } from "./paginated-catalog.mjs";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { sourceFailureKind } from "./source-readiness.mjs";
import { seasonalCheckpoint } from "./seasonal-checkpoint.mjs";

const valid = record => Number.isSafeInteger(record?.mal_id) && record.mal_id > 0 && typeof record.title === "string" && record.title.trim();

export async function discoverSeasonalCatalog(read, {
  directory = path.resolve("storage/app/catalog/seasons"), now = Date.now,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const records = new Map(), sources = {};
  for (const scope of ["now", "upcoming"]) {
    const file = path.join(directory, `${scope}.json`);
    const saved = readJson(file);
    const cache = saved?.schema === 1 && saved.scope === scope && Number.isFinite(Date.parse(saved.checkedAt))
      && Array.isArray(saved.records) && saved.records.every(valid)
      && new Set(saved.records.map(record => record.mal_id)).size === saved.records.length ? saved : null;
    let result = cache;
    const age = now() - Date.parse(cache?.checkedAt);
    if (!(age >= 0 && age < 6 * 3600000)) {
      try {
        const checkpoint = seasonalCheckpoint(directory, scope, valid, now);
        const found = await collectCatalogPages(async page => {
          await pause(1100);
          const payload = await read(`https://api.jikan.moe/v4/seasons/${scope}?limit=25&page=${page}`);
          if (!Array.isArray(payload?.data) || !payload.data.every(valid)) throw new Error("Invalid seasonal records");
          return payload;
        }, { cachedPage: checkpoint.cachedPage, savePage: checkpoint.savePage });
        result = { schema: 1, scope, checkedAt: checkpoint.startedAt, completedAt: new Date(now()).toISOString(), records: checkpoint.records(found) };
        writeJson(file, result);
        checkpoint.complete();
      } catch (error) {
        sources[scope] = { checkedAt: cache?.checkedAt ?? null, stale: true,
          error: { status: Number.isInteger(error.status) ? error.status : null, code: "SEASON_DISCOVERY_FAILED", kind: sourceFailureKind(error) } };
      }
    }
    sources[scope] ||= { checkedAt: result.checkedAt, stale: false, error: null };
    for (const record of result?.records || []) {
      if (!records.has(record.mal_id)) records.set(record.mal_id, { ...record, source_checked_at: record.source_checked_at || result.checkedAt });
    }
  }
  return { records: [...records.values()], sources };
}
