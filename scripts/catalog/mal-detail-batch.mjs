import path from "node:path";
import { readDetail, detailFresh, fetchDetail } from "./mal-detail-cache.mjs";
import { refreshSourceBatch } from "./source-batch.mjs";

export async function refreshMalDetailBatch(records, read, {
  directory = path.resolve("storage/app/catalog/myanimelist/details"), requestBudget = 1000,
  timeBudgetMs = 30 * 60000, now = Date.now,
} = {}) {
  const batch = await refreshSourceBatch(records, {
    directory, requestBudget, timeBudgetMs, now, label: "MAL lote",
    readCache: record => readDetail(directory, record.id),
    fetchCache: record => fetchDetail(record, read, directory, now),
    isFresh: detailFresh, isActive: record => record.status !== "finished_airing",
    isFatal: error => [401, 403].includes(error.status) || /^Invalid official MAL details/.test(error.message),
  });
  const enriched = batch.entries.map(({ record, cache, state }) => {
    if (!cache) return { ...record, details_state: state };
    const preferList = Date.parse(record.source_checked_at) > Date.parse(cache.checkedAt);
    return { ...(preferList ? { ...cache.payload, ...record } : { ...record, ...cache.payload }),
      related_anime: cache.payload.related_anime, source_checked_at: preferList ? record.source_checked_at : cache.checkedAt,
      details_checked_at: cache.checkedAt, details_state: state };
  });
  return { records: enriched, coverage: batch.coverage };
}
