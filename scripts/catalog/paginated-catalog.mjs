export async function collectCatalogPages(readPage, { cachedPage = () => null, savePage = () => {}, onProgress = () => {} } = {}) {
  const records = new Map();
  for (let page = 1; ; page++) {
    const cached = await cachedPage(page);
    const payload = cached || await readPage(page);
    if (!Array.isArray(payload?.data) || typeof payload.pagination?.has_next_page !== "boolean") {
      throw new Error(`Invalid catalog pagination at page ${page}`);
    }
    let added = 0;
    for (const record of payload.data) {
      if (!Number.isSafeInteger(record?.mal_id) || record.mal_id < 1) throw new Error(`Invalid MAL identity at page ${page}`);
      if (!records.has(record.mal_id)) added++;
      records.set(record.mal_id, record);
    }
    if (payload.pagination.has_next_page && added === 0) throw new Error(`Catalog pagination made no progress at page ${page}`);
    if (!cached) await savePage(page, payload);
    onProgress({ page, records: records.size, cached: Boolean(cached) });
    if (!payload.pagination.has_next_page) return [...records.values()];
  }
}
