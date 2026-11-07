import { refreshMalDetailBatch } from "./mal-detail-batch.mjs";

export async function refreshMalDetailStage(records, read, options = {}) {
  let attempted = 0, updated = 0;
  try {
    return await refreshMalDetailBatch(records, async url => {
      attempted++;
      const result = await read(url);
      updated++;
      return result;
    }, options);
  } catch (error) {
    if (![401, 403].includes(error.status)) throw error;
    const cached = await refreshMalDetailBatch(records, read, { ...options, requestBudget: 0 });
    cached.coverage = { ...cached.coverage, attempted, updated, complete: false,
      sourceError: { status: error.status, code: "MAL_ACCESS_DENIED" } };
    return cached;
  }
}
