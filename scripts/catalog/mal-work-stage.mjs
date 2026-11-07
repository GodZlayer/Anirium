import path from "node:path";
import { refreshSourceBatch } from "./source-batch.mjs";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { MAL_FIELDS } from "./mal-discovery.mjs";
import { malWorkRecord } from "./mal-work-record.mjs";
import { malRelationTargets } from "./mal-relation-targets.mjs";

export const MAL_WRITTEN_FIELDS = "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,popularity,media_type,status,genres,num_chapters,num_volumes,authors,related_anime,related_manga";
const valid = (cache, id) => cache?.payload?.id === id && typeof cache.payload.title === "string" && cache.payload.title.trim() && Number.isFinite(Date.parse(cache.checkedAt))
  && Array.isArray(cache.payload.related_anime) && (cache.payload.related_manga === undefined || Array.isArray(cache.payload.related_manga));

export async function refreshMalWorks(rows, read, { directory, requestBudget = 200, timeBudgetMs = 1200000, now = Date.now, onProgress = () => {} } = {}) {
  const report = {}, records = [], rejected = [], health = [];
  const queues = { anime: new Map(), manga: new Map() }, observed = { anime: new Set(), manga: new Set() };
  for (const row of rows) {
    const media = row.entity_type === "WORK" ? "anime" : "manga";
    if (Number.isSafeInteger(row.mal_id) && row.mal_id > 0) queues[media].set(row.mal_id, { id: row.mal_id, status: row.status });
    for (const edge of JSON.parse(row.source_relations_json || "[]")) {
      const target = edge.target;
      if (target?.provider === "mal" && queues[target.media] && /^[1-9]\d*$/.test(String(target.id))) {
        const id = Number(target.id);
        if (Number.isSafeInteger(id) && !queues[target.media].has(id)) queues[target.media].set(id, { id, status: "UNKNOWN" });
      }
    }
  }
  let remaining = requestBudget;
  for (const media of ["anime", "manga"]) {
    const cacheDirectory = path.join(directory, media === "anime" ? "details" : "manga-details");
    const budget = media === "anime" ? Math.ceil(remaining * 0.9) : remaining;
    let batch;
    try {
      batch = await refreshSourceBatch([...queues[media].values()], { directory: cacheDirectory, requestBudget: budget, timeBudgetMs: timeBudgetMs * (media === "anime" ? 0.9 : 0.1), now,
        label: `MAL ${media}`, onProgress: state => onProgress({ ...state, media }), isFatal: error => [401, 403].includes(error.status), onFatal: (_error, partial) => { batch = partial; },
        readCache: record => { const cache = readJson(path.join(cacheDirectory, `${record.id}.json`)); return valid(cache, record.id) ? cache : null; },
        isFresh: (record, cache, instant) => valid(cache, record.id) && instant - Date.parse(cache.checkedAt) >= 0
          && instant - Date.parse(cache.checkedAt) < (["COMPLETED", "FINISHED"].includes(record.status) ? 7 * 86400000 : 12 * 3600000),
        isActive: record => ["RELEASING", "NOT_YET_RELEASED"].includes(record.status),
        fetchCache: async record => {
          const fields = media === "anime" ? MAL_FIELDS : MAL_WRITTEN_FIELDS;
          const cache = { checkedAt: new Date(now()).toISOString(), payload: await read(`https://api.myanimelist.net/v2/${media}/${record.id}?fields=${fields}`) };
          if (!valid(cache, record.id)) throw new Error("Invalid MAL work response");
          writeJson(path.join(cacheDirectory, `${record.id}.json`), cache);
          return cache;
        },
        relatedRecords: (_record, cache) => {
          const same = [];
          for (const target of malRelationTargets(cache.payload)) {
            if (target.media === media) same.push({ id: target.id, status: "UNKNOWN" });
            else if (!queues[target.media].has(target.id)) queues[target.media].set(target.id, { id: target.id, status: "UNKNOWN" });
          }
          return same;
        } });
    } catch (error) {
      if (!batch) throw error;
      batch.coverage = { ...batch.coverage, sourceError: { status: error.status || null }, complete: false };
      remaining = 0;
    }
    remaining = Math.max(0, remaining - batch.coverage.attempted);
    report[media] = batch.coverage;
    for (const entry of batch.entries) {
      observed[media].add(entry.record.id);
      health.push({ media, id: entry.record.id, checkedAt: entry.cache?.checkedAt || null, failure: entry.failure });
    }
    for (const entry of batch.entries) if (entry.cache) {
      try { records.push(malWorkRecord(entry.cache.payload, media, entry.cache.checkedAt)); }
      catch { rejected.push({ media, id: entry.record.id }); }
    }
  }
  for (const media of ["anime", "manga"]) {
    report[media].deferredCrossMedia = [...queues[media].keys()].filter(id => !observed[media].has(id)).length;
    if (report[media].deferredCrossMedia) report[media].complete = false;
  }
  return { records, report, rejected, health };
}
