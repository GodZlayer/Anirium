import path from "node:path";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { refreshSourceBatch } from "./source-batch.mjs";
import { createJsonSourceClient } from "./json-source-client.mjs";
import { sourceFailureKind } from "./source-readiness.mjs";
import { readJikanEpisodes } from "./jikan-episode-reader.mjs";
import { readEpisodeMetadata } from "../../resources/js/lib/episodeMetadata.mjs";
import { applyEpisodeDocuments } from "./anizip-batch.mjs";

export async function supplementJikanEpisodes(rows, { directory, dataDirectory, cooldownFile, request = fetch,
  requestBudget = 20, timeBudgetMs = 180000, now = Date.now, pause } = {}) {
  if (!Number.isSafeInteger(requestBudget) || requestBudget < 0 || !Number.isFinite(timeBudgetMs) || timeBudgetMs < 0) throw new Error("Invalid Jikan episode budget");
  const records = rows.filter(row => {
    if (row.entity_type !== "WORK" || row.catalog_visibility === "quarantined" || !Number.isSafeInteger(row.mal_id) || row.mal_id < 1) return false;
    if (row.episodes_metadata_url) {
      const match = /^\/data\/(episodes\/anime\/[1-9]\d*\/[a-f0-9]{64}\.json)$/.exec(row.episodes_metadata_url);
      if (!match) throw new Error("Invalid retained episode URL");
      const document = readJson(path.join(dataDirectory, match[1]));
      if (!readEpisodeMetadata(document, row)) throw new Error("Invalid retained episode document");
    }
    return true;
  }).map(row => ({ ...row, id: row.mal_id }));
  let httpRequests = 0, deadline = null, sourceError = null;
  const assertBudget = () => {
    if (httpRequests >= requestBudget || deadline !== null && now() >= deadline) throw Object.assign(new Error("Jikan episode cycle budget exhausted"), { name: "CatalogBudgetError" });
  };
  const client = createJsonSourceClient("https://api.jikan.moe", { cooldownFile, now, ...(pause ? { pause } : {}), request: async (url, options) => {
    assertBudget(); deadline ??= now() + timeBudgetMs; httpRequests++;
    return request(url, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, Math.ceil(deadline - now())))]) });
  } });
  const read = async url => {
    assertBudget();
    try { return await client(url); }
    catch (error) {
      if (error.name !== "CatalogBudgetError" && error.status !== 404) sourceError = { status: Number.isInteger(error.status) ? error.status : null, kind: sourceFailureKind(error) };
      throw error;
    }
  };
  const batch = await refreshSourceBatch(records, { directory, requestBudget, timeBudgetMs, now, label: "Jikan episodios",
    canRequest: () => httpRequests < requestBudget && (deadline === null || now() < deadline),
    isDeferred: error => error.name === "CatalogBudgetError",
    readCache: record => {
      const cache = readJson(path.join(directory, `${record.id}.json`));
      return cache?.payload?.source === "jikan" && Number.isFinite(Date.parse(cache.checkedAt)) && Date.parse(cache.checkedAt) <= now()
        && cache.payload.checked_at === cache.checkedAt && readEpisodeMetadata(cache.payload, record) ? cache : null;
    },
    isFresh: (record, cache, instant) => {
      const age = instant - Date.parse(cache?.checkedAt), ttl = record.status === "COMPLETED" ? 30 * 86400000 : 6 * 3600000;
      return age >= 0 && age < ttl && cache.payload.mal_episode_count === (Number(record.episodes) || null);
    },
    isActive: record => ["RELEASING", "NOT_YET_RELEASED"].includes(record.status),
    fetchCache: async record => {
      const result = await readJikanEpisodes(record, read, { directory: path.join(directory, "checkpoints"), now });
      const cache = { checkedAt: result.document.checked_at, payload: result.document };
      writeJson(path.join(directory, `${record.id}.json`), cache); result.complete(); return cache;
    },
  });
  batch.entries = batch.entries.filter(entry => {
    if (!entry.cache?.payload.episodes.length) return false;
    return true;
  });
  const published = applyEpisodeDocuments(new Map(rows.filter(row => row.entity_type === "WORK").map(row => [row.mal_id, row])), batch, path.join(dataDirectory, "episodes/anime"), now());
  return { ...published, httpRequests, ...(sourceError ? { sourceError } : {}),
    skipped: rows.length - records.length, evidenceComplete: false };
}
