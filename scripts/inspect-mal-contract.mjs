import fs from "node:fs";
import path from "node:path";
import { createMalClient } from "./catalog/mal-client.mjs";
import { MAL_FIELDS } from "./catalog/mal-discovery.mjs";
import { validDetail, readDetail, writeJson } from "./catalog/mal-detail-cache.mjs";
import { inspectMalCache } from "./catalog/inspect-mal-cache.mjs";

const id = Number(process.argv[2]);
if (!Number.isSafeInteger(id) || id < 1) throw new Error("Usage: node --env-file=.env scripts/inspect-mal-contract.mjs MAL_ID");
const fields = MAL_FIELDS;
const endpoint = `https://api.myanimelist.net/v2/anime/${id}?fields=${fields}`;
const report = { id, attemptedAt: new Date().toISOString(), endpoint, requestedFields: fields.split(","), live: null, observed: null };
let payload;
try {
  payload = await createMalClient(process.env.MAL_CLIENT_ID)(endpoint);
  if (!validDetail(payload, id)) throw new Error("Invalid official MAL identity or details");
  report.live = { ok: true, status: 200 };
  report.observed = { origin: "live-api", checkedAt: new Date().toISOString() };
} catch (error) {
  report.live = { ok: false, status: Number.isInteger(error.status) ? error.status : null, code: "MAL_PROBE_FAILED" };
  const cached = readDetail(path.resolve("storage/app/catalog/myanimelist/details"), id);
  if (cached) {
    payload = cached.payload;
    report.observed = { origin: "local-cache", checkedAt: cached.checkedAt };
  }
}
if (payload) {
  report.observed = { ...report.observed, returnedFields: Object.keys(payload), title: payload.title,
    mediaType: payload.media_type, status: payload.status, episodeCount: payload.num_episodes,
    animeRelations: payload.related_anime.map(edge => ({ id: edge.node?.id, title: edge.node?.title,
      relation: edge.relation_type, label: edge.relation_type_formatted })),
    mangaRelations: payload.related_manga ?? null };
  report.rawPayload = payload;
}
const output = path.resolve(`storage/app/catalog/probes/mal-${id}.json`);
report.cachedGraph = inspectMalCache(id, path.resolve("storage/app/catalog/myanimelist/details"));
writeJson(output, report);
console.log(JSON.stringify({ report: output, live: report.live, observed: report.observed }, null, 2));
if (!report.live.ok) process.exitCode = 2;
