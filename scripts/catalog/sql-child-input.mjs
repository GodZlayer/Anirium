import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readEpisodeMetadata, episodeNumbersFor } from "../../resources/js/lib/episodeMetadata.mjs";
import { classifyEpisode } from "../../resources/js/lib/episodeClassification.mjs";
import { readArcEvidence } from "../../resources/js/lib/arcEvidence.mjs";

export const childHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function readChildInput(work, directory) {
  let document = null;
  if (work.episodes_metadata_url) {
    const match = /^\/data\/episodes\/anime\/([1-9]\d*)\/([a-f0-9]{64})\.json$/.exec(work.episodes_metadata_url);
    if (!match || Number(match[1]) !== work.mal_id) throw new Error("Invalid SQL child document reference");
    const content = fs.readFileSync(path.join(directory, "episodes/anime", match[1], `${match[2]}.json`));
    if (createHash("sha256").update(content).digest("hex") !== match[2]) throw new Error("SQL child document checksum mismatch");
    document = readEpisodeMetadata(JSON.parse(content), work);
    if (!document) throw new Error("Invalid SQL child document identity or schema");
  }
  const records = new Map(document?.episodes.map(record => [record.number, record]) || []);
  return {
    episodes: episodeNumbersFor(work, document).map(number => ({ ...records.get(number), number, classification: classifyEpisode(work, number) })),
    arcs: readArcEvidence(work),
  };
}
