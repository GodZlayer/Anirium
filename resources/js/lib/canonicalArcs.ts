import { classifyEpisode } from "./episodeClassification.mjs";
import { readArcEvidence } from "./arcEvidence.mjs";

export interface CanonicalArc {
  arcId: string;
  name: string;
  saga?: string;
  startEp: number;
  endEp: number;
  episodesCount: number;
  isFiller: boolean;
  synopsis: string;
  classification?: "canon" | "mixed" | "filler" | "unknown";
  arcType?: "TV_EPISODES" | "CANON_MOVIE" | "SPECIAL";
  sourceWorkMalId?: number;
  source_url?: string;
  source_provider?: string;
  license?: string;
  attribution?: string;
  modified?: boolean;
}

export function getCanonicalArcsForWork(work: any): CanonicalArc[] {
  return readArcEvidence(work);
}

export function isEpisodeFillerForWork(work: any, episode: number): boolean {
  return classifyEpisode(work, episode) === "filler";
}
