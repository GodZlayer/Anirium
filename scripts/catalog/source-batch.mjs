import path from "node:path";
import fs from "node:fs";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { sourceBatchCoverage } from "./source-batch-coverage.mjs";

export async function refreshSourceBatch(records, {
  directory, readCache, fetchCache, isFresh, isActive, isFatal = () => false, isDeferred = () => false, canRequest = () => true,
  requestBudget, timeBudgetMs, now = Date.now, label, onProgress = () => {}, relatedRecords = () => [], onFatal = () => {},
}) {
  if (!Number.isSafeInteger(requestBudget) || requestBudget < 0 || !Number.isFinite(timeBudgetMs) || timeBudgetMs < 0) throw new Error("Invalid source refresh budget");
  const started = now();
  const files = new Set(fs.existsSync(directory) ? fs.readdirSync(directory) : []);
  const failureDirectory = path.join(directory, "failures");
  const failureFiles = new Set(fs.existsSync(failureDirectory) ? fs.readdirSync(failureDirectory) : []);
  const loadEntry = record => {
    if (!Number.isSafeInteger(record.id) || record.id < 1) throw new Error("Invalid source identity");
    const name = `${record.id}.json`;
    const saved = failureFiles.has(name) ? readJson(path.join(failureDirectory, name)) : null;
    const failure = saved?.id === record.id && Number.isSafeInteger(saved.attempts) && saved.attempts > 0
      && Number.isFinite(Date.parse(saved.attemptedAt)) && Number.isFinite(Date.parse(saved.retryAt)) ? saved : null;
    return { record, cache: files.has(name) ? readCache(record) : null, failure };
  };
  const entries = records.map(loadEntry);
  if (new Set(records.map(record => record.id)).size !== records.length) throw new Error("Duplicate source identity");
  const byId = new Map(entries.map(entry => [entry.record.id, entry]));
  const discover = seeds => {
    const added = [], scan = [...seeds];
    for (let index = 0; index < scan.length; index++) {
      const entry = scan[index];
      if (!entry.cache) continue;
      for (const record of relatedRecords(entry.record, entry.cache)) {
        if (!Number.isSafeInteger(record?.id) || record.id < 1) throw new Error("Invalid discovered source identity");
        if (byId.has(record.id)) continue;
        const next = loadEntry(record); byId.set(record.id, next); entries.push(next); added.push(next); scan.push(next);
      }
    }
    return added;
  };
  discover(entries);
  const pendingEntries = entries.filter(entry => !isFresh(entry.record, entry.cache, started));
  const waiting = pendingEntries.filter(entry => Date.parse(entry.failure?.retryAt) > started);
  const due = pendingEntries.filter(entry => !(Date.parse(entry.failure?.retryAt) > started));
  const order = entry => Math.max(Date.parse(entry.cache?.checkedAt) || 0, Date.parse(entry.failure?.attemptedAt) || 0);
  due.sort((a, b) => order(a) - order(b) || a.record.id - b.record.id);
  const active = due.filter(entry => isActive(entry.record));
  const finished = due.filter(entry => !isActive(entry.record));
  const queue = [];
  for (let a = 0, f = 0; a < active.length || f < finished.length;) {
    for (let index = 0; index < 2 && a < active.length; index++) queue.push(active[a++]);
    if (f < finished.length) queue.push(finished[f++]);
  }
  // Cache scans are local preparation, not part of the network request budget.
  const requestsStarted = now();
  let attempted = 0, updated = 0, consecutiveFailures = 0, interrupted = 0;
  const errors = [];
  const result = () => ({ entries, coverage: sourceBatchCoverage(entries, { initialTotal: records.length, queued: queue.length,
    attempted, updated, errors, waitingAtStart: waiting.length, interrupted, now, isFresh }) });
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (attempted >= requestBudget || now() - requestsStarted >= timeBudgetMs || consecutiveFailures >= 5 || !canRequest()) break;
    const entry = queue[cursor];
    attempted++;
    const failurePath = path.join(failureDirectory, `${entry.record.id}.json`);
    try {
      entry.cache = await fetchCache(entry.record);
      entry.failure = null;
      if (fs.existsSync(failurePath)) fs.unlinkSync(failurePath);
      updated++;
      consecutiveFailures = 0;
    } catch (error) {
      if (isDeferred(error)) { interrupted++; break; }
      if (isFatal(error)) {
        errors.push({ id: entry.record.id, status: error.status || null });
        onFatal(error, result()); throw error;
      }
      consecutiveFailures = [404, 422].includes(error.status) ? 0 : error.status === 429 ? 5 : consecutiveFailures + 1;
      const attempts = Math.min(Number(entry.failure?.attempts || 0) + 1, 10);
      const retryMs = error.status === 404 ? 7 * 86400000 : Math.min(24, 2 ** (attempts - 1)) * 3600000;
      entry.failure = { id: entry.record.id, status: error.status || null, attemptedAt: new Date(now()).toISOString(), retryAt: new Date(Math.max(now() + retryMs, error.retryAt || 0)).toISOString(), attempts };
      writeJson(failurePath, entry.failure);
      errors.push({ id: entry.record.id, status: error.status || null });
    }
    const discovered = discover([entry]).filter(next => !isFresh(next.record, next.cache, now()) && !(Date.parse(next.failure?.retryAt) > now()));
    queue.splice(cursor + 1, 0, ...discovered);
    if (attempted === 1 || attempted % 100 === 0) {
      onProgress({ attempted, updated, failed: errors.length, total: entries.length, checkedAt: new Date(now()).toISOString() });
      console.log(`[${label}] ${attempted} consultas, ${updated} atualizações, ${errors.length} falhas`);
    }
  }
  return result();
}
