import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadCatalog } from "./catalog/load-catalog.mjs";
import { verifyCatalogAssets } from "./catalog/verify-catalog-assets.mjs";
import { writeJson } from "./catalog/mal-detail-cache.mjs";
import { readArcEvidence } from "../resources/js/lib/arcEvidence.mjs";
import { episodeEvidence } from "../resources/js/lib/episodeClassification.mjs";
import { eligibleFillerWork } from "./catalog/filler-identity.mjs";

const file = path.resolve(process.argv[2] || "public/data/catalog.parquet");
const { rows, recovered } = await loadCatalog(file);
if (recovered) throw new Error("Audit requires a valid primary snapshot");
const anime = rows.filter(row => row.entity_type !== "MANGA");
const manga = rows.filter(row => row.entity_type === "MANGA");
const countBy = (items, get) => items.reduce((counts, row) => {
  const value = get(row) ?? "missing"; counts[value] = (counts[value] || 0) + 1; return counts;
}, {});
const present = value => value != null && String(value).trim() !== "";
const parse = value => { try { return JSON.parse(value || "null"); } catch { return null; } };
const metadata = Object.fromEntries(["title", "synopsis", "year", "episodes", "score", "metadata_source", "metadata_checked_at", "relations_checked_at", "episodes_metadata_url"]
  .map(field => [field, { present: anime.filter(row => present(row[field])).length, missing: anime.filter(row => !present(row[field])).length }]));
const verified = anime.filter(row => row.universe_source === "relations");
const known = new Set(anime.map(row => row.mal_id));
const edges = anime.flatMap(row => (parse(row.relations_json) || []).map(edge => ({ from: row.mal_id, ...edge })));
const filler = anime.filter(row => episodeEvidence(row));
const arcs = anime.flatMap(row => readArcEvidence(row));
const sha256 = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = fs.existsSync(file + ".status.json") ? JSON.parse(fs.readFileSync(file + ".status.json", "utf8")) : null;
if (manifest && manifest.snapshotSha256 !== sha256) throw new Error("Snapshot/manifest checksum mismatch");
const report = {
  inspectedAt: new Date().toISOString(), snapshot: { file, sha256, publishedAt: manifest?.publishedAt ?? null },
  records: { total: rows.length, anime: anime.length, manga: manga.length, uniqueIdentitiesValidated: true },
  animeMetadata: metadata, metadataSources: countBy(anime, row => row.metadata_source),
  detailStates: countBy(anime, row => row.details_state),
  statuses: countBy(anime, row => row.status), formats: countBy(anime, row => row.format),
  visualAssets: { withCover: anime.filter(row => present(parse(row.images_json)?.jpg?.large_image_url) || present(parse(row.images_json)?.jpg?.image_url)).length,
    withGenres: anime.filter(row => parse(row.genres_json)?.length > 0).length, withStudios: anime.filter(row => parse(row.studios_json)?.length > 0).length },
  universes: { verifiedWorks: verified.length, verifiedGroups: new Set(verified.map(row => row.universe_id)).size,
    unverifiedWorks: anime.length - verified.length, storedEdges: edges.length, relationTypes: countBy(edges, edge => edge.type),
    missingTargetIds: [...new Set(edges.filter(edge => !known.has(edge.mal_id)).map(edge => edge.mal_id))] },
  episodes: verifyCatalogAssets(rows, path.dirname(file)),
  classification: { worksWithAcceptedEvidence: filler.length, eligibleTvOna: anime.filter(eligibleFillerWork).length,
    sources: countBy(filler, row => episodeEvidence(row).source), rawEvidenceRows: anime.filter(row => present(row.filler_episodes_json)).length },
  arcs: { worksWithAcceptedEvidence: anime.filter(row => readArcEvidence(row).length > 0).length,
    acceptedArcs: arcs.length, rawEvidenceRows: anime.filter(row => present(row.arcs_json)).length },
  chronology: { dateColumns: [...new Set(rows.flatMap(row => Object.keys(row)))].filter(key => /start_date|release_date|aired_from/.test(key)) },
  pipeline: manifest,
  interpretation: "Missing values are coverage measurements, not proof that a source provides the field or that it applies to every work.",
};
const output = path.resolve("storage/app/catalog/audits/current-base.json");
writeJson(output, report);
console.log(JSON.stringify({ report: output, ...report }, null, 2));
