// A validated snapshot can still receive independent source updates offline.
// Its rows never become a fabricated successful discovery or fresh timestamp.
export async function discoveryWithFallback(discover, existingRows) {
  try { return await discover(); }
  catch (error) {
    if (!existingRows.length) throw error;
    return { records: [], completedAt: null, stale: true,
      error: { status: Number.isInteger(error.status) ? error.status : null, code: "DISCOVERY_UNAVAILABLE" } };
  }
}
