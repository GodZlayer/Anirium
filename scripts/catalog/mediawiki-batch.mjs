import path from "node:path";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { refreshSourceBatch } from "./source-batch.mjs";
import { readMediawikiArcs } from "./mediawiki-arc-reader.mjs";
import { createMediawikiClient } from "./mediawiki-client.mjs";
import { readArcEvidence } from "../../resources/js/lib/arcEvidence.mjs";
import { attachFieldEvidence } from "./field-provenance.mjs";

export async function refreshMediawikiArcs(rows, { directory, requestBudget = 10, timeBudgetMs = 180000, request = fetch, now = Date.now, pause } = {}) {
  const eligible = rows.filter(row => row.entity_type === "WORK" && Number.isSafeInteger(row.mal_id) && row.mal_id > 0
    && Number.isSafeInteger(row.episodes) && row.episodes > 0 && row.catalog_visibility !== "quarantined");
  const client = createMediawikiClient({ directory, request, now, timeBudgetMs, ...(pause ? { pause } : {}) });
  const valid = (cache, record) => cache?.payload?.mal_id === record.id && cache.episodeTotal === record.episodes
    && Number.isFinite(Date.parse(cache.checkedAt)) && Date.parse(cache.checkedAt) <= now()
    && cache.payload.checkedAt === cache.checkedAt && Array.isArray(cache.payload.arcs)
    && cache.payload.arcs.every(arc => arc.source_provider === "mediawiki" && arc.license === "CC-BY-SA-4.0" && arc.attribution === "Wikipedia contributors"
      && arc.identity_evidence?.property === "P4086" && arc.identity_evidence?.value === String(record.id)
      && Number.isSafeInteger(arc.source_revision) && arc.source_revision > 0 && arc.source_url?.startsWith("https://en.wikipedia.org/w/index.php?"))
    && readArcEvidence({ ...record, arcs_json: JSON.stringify(cache.payload.arcs) }).length === cache.payload.arcs.length;
  const batch = await refreshSourceBatch(eligible.map(row => ({ ...row, id: row.mal_id })), {
    directory, requestBudget, timeBudgetMs, now, label: "Wikipedia arcos",
    readCache: record => { const saved = readJson(path.join(directory, record.id + ".json")); return valid(saved, record) ? saved : null; },
    isFresh: (record, cache, instant) => valid(cache, record) && instant - Date.parse(cache.checkedAt) < (record.status === "COMPLETED" ? 30 : 7) * 86400000,
    isActive: record => record.status === "RELEASING",
    fetchCache: async record => {
      const payload = await readMediawikiArcs(record, client.read, { now });
      const cache = { episodeTotal: record.episodes, checkedAt: payload.checkedAt, payload };
      if (!valid(cache, record)) throw new Error("Invalid sourced narrative cache");
      writeJson(path.join(directory, record.id + ".json"), cache); return cache;
    },
  });
  const byId = new Map(eligible.map(row => [row.mal_id, row]));
  let applied = 0, conflicts = 0, noSupportedEvidence = 0;
  for (const { record, cache } of batch.entries) {
    if (!cache) continue;
    const row = byId.get(record.id), incoming = cache.payload.arcs, previous = readArcEvidence(row);
    if (!incoming.length) { noSupportedEvidence++; continue; }
    if (previous.length && previous.some(arc => arc.source_provider !== "mediawiki" || Date.parse(arc.checked_at) > Date.parse(cache.checkedAt))) { conflicts++; continue; }
    row.arcs_json = JSON.stringify(incoming); applied++;
    attachFieldEvidence(row, ["arcs_json"], { provider: "mediawiki", source_url: incoming[0].source_url, observed_at: cache.checkedAt,
      imported_at: new Date(now()).toISOString(), license: "CC-BY-SA-4.0", attribution: "Wikipedia contributors", modified: true });
  }
  return { ...batch.coverage, ...(client.failure() ? { sourceError: client.failure() } : {}), httpRequests: client.requests(), applied, conflicts, noSupportedEvidence,
    skipped: rows.length - eligible.length, outsideDomain: rows.filter(row => row.entity_type !== "WORK").length, evidenceComplete: false };
}
