export function sourceBatchCoverage(entries, { initialTotal, queued, attempted, updated, errors, waitingAtStart, interrupted, now, isFresh }) {
  const instant = now();
  let fresh = 0, stale = 0, missing = 0;
  for (const entry of entries) {
    entry.state = !entry.cache ? "missing" : isFresh(entry.record, entry.cache, instant) ? "fresh" : "stale";
    if (entry.state === "fresh") fresh++; else if (entry.state === "stale") stale++; else missing++;
  }
  const retryDates = entries.filter(entry => entry.state !== "fresh" && Date.parse(entry.failure?.retryAt) > instant)
    .map(entry => entry.failure.retryAt).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { total: entries.length, discoveredReferences: entries.length - initialTotal, fresh, stale, missing, attempted, updated, errors,
    waitingAtStart, deferred: queued - attempted, interrupted, retryWaiting: retryDates.length, nextRetryAt: retryDates[0] || null,
    pending: stale + missing, complete: stale + missing === 0, checkedAt: new Date(instant).toISOString() };
}
