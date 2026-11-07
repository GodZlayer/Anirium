import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readEpisodeMetadata } from "../resources/js/lib/episodeMetadata.mjs";
import { composeEpisodeDocuments } from "./catalog/compose-episode-documents.mjs";
import { episodeFields, validEpisodeField } from "../resources/js/lib/episodeFieldEvidence.mjs";
import { writeJson } from "./catalog/mal-detail-cache.mjs";

const directory = path.resolve("public/data/episodes/anime"), groups = new Map(), failures = [];
let files = 0, checkedFields = 0, composedPairs = 0;
for (const entry of fs.readdirSync(directory, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
  files++;
  try {
    const bytes = fs.readFileSync(path.join(entry.parentPath, entry.name)), document = JSON.parse(bytes);
    if (createHash("sha256").update(bytes).digest("hex") + ".json" !== entry.name) throw new Error("checksum");
    const work = { entity_type: "WORK", mal_id: document.mal_id, episodes: document.mal_episode_count };
    if (!readEpisodeMetadata(document, work)) throw new Error("identity/schema");
    for (const [number, item] of [[0, document], ...document.episodes.map(item => [item.number, item])]) for (const [field, value] of episodeFields(item, number === 0)) {
      checkedFields++; if (!validEpisodeField(field, value, number === 0)) throw new Error("field schema");
    }
    const key = `${work.mal_id}:${work.episodes}`;
    if (!groups.has(key)) groups.set(key, { work, documents: [] });
    const group = groups.get(key);
    // Retain the oldest/newest actual inputs only; do not manufacture source dates.
    group.documents.push(document); group.documents.sort((a, b) => Date.parse(a.checked_at) - Date.parse(b.checked_at));
    if (group.documents.length > 2) group.documents.splice(1, group.documents.length - 2);
  } catch (error) { failures.push({ file: entry.name, reason: error.message }); }
}
for (const { work, documents } of groups.values()) {
  if (documents.length < 2) continue;
  try {
    const result = composeEpisodeDocuments(documents[0], documents[1], work);
    if (JSON.stringify(composeEpisodeDocuments(result, documents[1], work)) !== JSON.stringify(result)) throw new Error("non-idempotent composition");
    const ids = new Set(result.episodes.map(item => item.number));
    if (documents.some(document => document.episodes.some(item => !ids.has(item.number)))) throw new Error("lost episode");
    composedPairs++;
  } catch (error) { failures.push({ mal_id: work.mal_id, reason: error.message }); }
}
const proof = { checkedAt: new Date().toISOString(), files, checkedFields, composedPairs, failures,
  scope: "Local immutable documents and same-boundary oldest/newest snapshots; not remote Jikan acceptance", publicCatalogModified: false };
writeJson(path.resolve("storage/app/catalog/probes/episode-composition-compatibility.json"), proof);
console.log(JSON.stringify({ ...proof, failures: failures.slice(0, 5) }));
if (failures.length) process.exitCode = 1;
