import { catalogUniverseIds } from "./catalogUniverseIdentity.mjs";

export type UniverseRelationType = "UNKNOWN" | "MOVIE" | "SPECIAL";

export interface UniverseWorkClassification {
  relationType: UniverseRelationType;
  label: string;
  isCanon: null;
  bg: string;
  border: string;
  text: string;
  universeId: string;
}

export function classifyUniverseWorkWithMAL(work: any): UniverseWorkClassification {
  const format = String(work.format || "UNKNOWN").toUpperCase();
  return {
    relationType: format === "MOVIE" ? "MOVIE" : ["OVA", "ONA", "SPECIAL"].includes(format) ? "SPECIAL" : "UNKNOWN",
    label: format,
    isCanon: null,
    bg: "rgba(161, 161, 170, 0.15)",
    border: "rgba(161, 161, 170, 0.3)",
    text: "#D4D4D8",
    universeId: catalogUniverseIds(work).length === 1 ? catalogUniverseIds(work)[0] : "",
  };
}
