import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readEpisodeMetadata } from "../../resources/js/lib/episodeMetadata.mjs";

export function verifyCatalogAssets(rows, dataDirectory) {
  let episodeDocuments = 0, indexedEpisodes = 0;
  for (const row of rows) {
    if (!row.episodes_metadata_url) continue;
    const match = /^\/data\/episodes\/anime\/([1-9]\d*)\/([a-f0-9]{64})\.json$/.exec(row.episodes_metadata_url);
    if (!match || Number(match[1]) !== row.mal_id || ["MANGA", "NOVEL"].includes(row.entity_type)) throw new Error("Invalid episode document reference");
    const file = path.join(dataDirectory, "episodes/anime", match[1], `${match[2]}.json`);
    const content = fs.readFileSync(file);
    if (createHash("sha256").update(content).digest("hex") !== match[2]) throw new Error(`Episode document checksum mismatch: ${row.mal_id}`);
    const document = readEpisodeMetadata(JSON.parse(content), row);
    if (!document) throw new Error(`Invalid episode document identity or schema: ${row.mal_id}`);
    episodeDocuments++;
    indexedEpisodes += document.episodes.length;
  }
  return { episodeDocuments, indexedEpisodes };
}
