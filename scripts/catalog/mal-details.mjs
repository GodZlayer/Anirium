import path from "node:path";
import { readDetail, detailFresh, fetchDetail } from "./mal-detail-cache.mjs";

export async function enrichMalDetails(records, read, directory = path.resolve("storage/app/catalog/myanimelist/details")) {
  let fetched = 0;
  const enriched = [];
  for (const record of records) {
    if (!Number.isSafeInteger(record.id) || record.id < 1) throw new Error("Invalid MAL detail identity");
    let cache = readDetail(directory, record.id);
    if (!detailFresh(record, cache, Date.now())) {
      cache = await fetchDetail(record, read, directory);
      fetched++;
    }
    enriched.push({ ...record, ...cache.payload, source_checked_at: cache.checkedAt });
    if (enriched.length === 1 || enriched.length % 100 === 0) console.log(`[MAL detalhes] ${enriched.length}/${records.length} obras, ${fetched} consultas novas`);
  }
  return enriched;
}
