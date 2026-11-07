import fs from "node:fs";
import path from "node:path";
import { catalogAliases } from "../../resources/js/lib/catalogAliases.mjs";
import { catalogKey } from "./catalog-identity.mjs";
import { verifyCatalogAssets } from "./verify-catalog-assets.mjs";

export function auditCatalogContent(rows, previous, { dataDirectory, previousDirectory } = {}) {
  const inconsistencies = { releasingWithFutureYear: 0 };
  const aliases = new Map(), coverage = { anime: 0, withSynopsis: 0, withReleaseDate: 0, withEpisodes: 0, withRelations: 0, withProvenance: 0 };
  for (const row of rows) {
    if (typeof row.title !== "string" || !row.title.trim()) throw new Error("Catalog work has no title");
    for (const alias of [catalogKey(row), ...catalogAliases(row)]) aliases.set(alias, row);
    if (row.entity_type !== "WORK") continue;
    coverage.anime++;
    if (row.status === "RELEASING" && row.year > new Date().getUTCFullYear()) inconsistencies.releasingWithFutureYear++;
    if (row.synopsis?.trim()) coverage.withSynopsis++;
    if (row.start_date) coverage.withReleaseDate++;
    if (row.episodes_metadata_url) coverage.withEpisodes++;
    if (JSON.parse(row.source_relations_json || "[]").length) coverage.withRelations++;
    if (row.field_provenance_json) coverage.withProvenance++;
  }
  verifyCatalogAssets(previous, previousDirectory);
  for (const old of previous) {
    const row = aliases.get(catalogKey(old));
    if (!row) throw new Error(`Publication would remove existing work: ${catalogKey(old)}`);
    for (const alias of catalogAliases(old)) if (aliases.get(alias)?.work_id !== row.work_id) throw new Error("Publication would lose a legacy alias");
    if (!old.episodes_metadata_url) continue;
    if (!row.episodes_metadata_url) throw new Error("Publication would lose an episode document");
    const oldDoc = JSON.parse(fs.readFileSync(path.join(previousDirectory, old.episodes_metadata_url.slice(6)), "utf8"));
    const nextDoc = JSON.parse(fs.readFileSync(path.join(dataDirectory, row.episodes_metadata_url.slice(6)), "utf8"));
    const known = new Set(nextDoc.episodes.map(episode => episode.number));
    if (oldDoc.episodes.some(episode => !known.has(episode.number))) throw new Error("Publication would lose indexed episodes");
  }
  return { coverage, inconsistencies, assets: verifyCatalogAssets(rows, dataDirectory), comparedWorks: previous.length, lossCheck: "verified", complete: false };
}
