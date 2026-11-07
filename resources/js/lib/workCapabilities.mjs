import { readArcEvidence } from "./arcEvidence.mjs";
import { episodeEvidence } from "./episodeClassification.mjs";

export function workCapabilities(work) {
  const written = ["MANGA", "NOVEL"].includes(work?.entity_type);
  const evidence = episodeEvidence(work);
  const classified = evidence && ["canon", "manga_canon", "anime_canon", "mixed", "filler"].some(key => evidence[key]?.length > 0);
  const episodeUrl = /^\/data\/episodes\/anime\/([1-9]\d*)\/[a-f0-9]{64}\.json$/.exec(work?.episodes_metadata_url || "");
  return { episodes: !written && Boolean(episodeUrl && Number(episodeUrl[1]) === Number(work?.mal_id)),
    chapters: false, volumes: false, arcs: readArcEvidence(work).length > 0, classification: !written && Boolean(classified) };
}
