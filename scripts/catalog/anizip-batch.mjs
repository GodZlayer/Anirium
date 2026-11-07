import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { refreshSourceBatch } from "./source-batch.mjs";
import { normalizeAniZip } from "./anizip-record.mjs";
import { readEpisodeMetadata } from "../../resources/js/lib/episodeMetadata.mjs";
import { attachFieldEvidence } from "./field-provenance.mjs";
import { composeEpisodeDocuments } from "./compose-episode-documents.mjs";

export async function refreshAniZipBatch(works, read, {
  directory = path.resolve("storage/app/catalog/anizip/cache"), requestBudget = 200, timeBudgetMs = 5 * 60000, now = Date.now,
} = {}) {
  const records = works.filter(work => !["MANGA", "NOVEL"].includes(work.entity_type) && work.catalog_visibility !== "quarantined"
    && Number.isSafeInteger(Number(work.mal_id ?? work.id)) && Number(work.mal_id ?? work.id) > 0)
    .map(work => ({ ...work, id: Number(work.mal_id ?? work.id) }));
  return refreshSourceBatch(records, {
    directory, requestBudget, timeBudgetMs, now, label: "AniZip lote",
    readCache: record => {
      const cache = readJson(path.join(directory, `${record.id}.json`));
      return cache?.payload?.source === "anizip" && cache.checkedAt === cache.payload.checked_at
        && Date.parse(cache.checkedAt) <= now() && readEpisodeMetadata(cache.payload, record) ? cache : null;
    },
    fetchCache: async record => {
      const data = await read(`https://api.ani.zip/mappings?mal_id=${record.id}`);
      const checkedAt = new Date(now()).toISOString();
      const cache = { checkedAt, payload: normalizeAniZip(data, record, checkedAt) };
      writeJson(path.join(directory, `${record.id}.json`), cache);
      return cache;
    },
    isFresh: (record, cache, time) => {
      const age = time - Date.parse(cache?.checkedAt);
      const ttl = record.status === "COMPLETED" ? 30 * 86400000 : 6 * 3600000;
      const total = Number(record.episodes ?? record.episodes_count ?? 0) || null;
      return age >= 0 && age < ttl && cache.payload.mal_episode_count === total;
    },
    isActive: record => ["RELEASING", "NOT_YET_RELEASED"].includes(record.status),
  });
}

export function applyEpisodeDocuments(entities, batch, directory = path.resolve("public/data/episodes/anime"), now = Date.now()) {
  let indexedEpisodes = 0, publishedWorks = 0, composedWorks = 0, episodeConflicts = 0, preservedEpisodes = 0;
  for (const { record, cache, state } of batch.entries) {
    const work = entities.get(record.id);
    if (!work || !cache || !readEpisodeMetadata(cache.payload, work) || !cache.payload.episodes.length) continue;
    let data = cache.payload;
    const previous = /^\/data\/episodes\/anime\/([1-9]\d*)\/([a-f0-9]{64})\.json$/.exec(work.episodes_metadata_url || "");
    if (previous) {
      const retained = readJson(path.join(directory, previous[1], `${previous[2]}.json`));
      if (readEpisodeMetadata(retained, work)) {
        const numbers = new Set(data.episodes.map(item => item.number));
        preservedEpisodes += retained.episodes.filter(item => !numbers.has(item.number)).length;
        data = composeEpisodeDocuments(retained, data, work);
      }
    }
    const fields = ["episodes_metadata_url", "episodes_checked_at", "episodes_indexed_count"];
    const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const file = path.join(directory, String(record.id), `${hash}.json`);
    if (!fs.existsSync(file)) writeJson(file, data);
    work.episodes_metadata_url = `/data/episodes/anime/${record.id}/${hash}.json`;
    work.episodes_checked_at = data.checked_at;
    work.episodes_state = data.source === "anirium" ? "composed" : state;
    work.episodes_indexed_count = data.episodes.length;
    if (data.work_titles["pt-BR"] || data.work_titles.pt) {
      work.title_portuguese = data.work_titles["pt-BR"] || data.work_titles.pt;
      fields.push("title_portuguese");
    }
    const aired = data.episodes.filter(episode => episode.air_date_utc && Date.parse(episode.air_date_utc) <= now);
    const latest = aired.at(-1);
    if (latest && work.status !== "NOT_YET_RELEASED") {
      work.latest_episode_num = latest.number;
      work.latest_episode_at = latest.air_date_utc;
      work.updated_at = Date.parse(latest.air_date_utc);
      fields.push("latest_episode_num", "latest_episode_at", "updated_at");
    }
    attachFieldEvidence(work, fields, { provider: data.source, source_url: data.source_url, ...(data.upstream ? { upstream: data.upstream } : {}),
      document_url: work.episodes_metadata_url, observed_at: data.checked_at, imported_at: new Date(now).toISOString(), version: 1 });
    if (data.source === "anirium") {
      composedWorks++; episodeConflicts += data.conflicts.length;
      const titleField = `work_titles.${data.work_titles["pt-BR"] ? "pt-BR" : "pt"}`;
      const titleEvidence = data.evidence[data.field_provenance[titleField]];
      if (titleEvidence) attachFieldEvidence(work, ["title_portuguese"], { ...titleEvidence, document_url: work.episodes_metadata_url, document_field: titleField, imported_at: new Date(now).toISOString() });
      const dateEvidence = latest && data.evidence[latest.field_provenance.air_date_utc];
      if (dateEvidence && work.status !== "NOT_YET_RELEASED") attachFieldEvidence(work, ["latest_episode_num", "latest_episode_at", "updated_at"], {
        ...dateEvidence, document_url: work.episodes_metadata_url, document_episode: latest.number, document_field: "air_date_utc", imported_at: new Date(now).toISOString() });
    }
    indexedEpisodes += data.episodes.length;
    publishedWorks++;
  }
  return { ...batch.coverage, indexedEpisodes, publishedWorks, composedWorks, episodeConflicts, preservedEpisodes };
}

export const applyAniZipEpisodes = applyEpisodeDocuments;
