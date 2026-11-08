import path from "node:path";
import { refreshMediawikiArcs } from "./catalog/mediawiki-batch.mjs";
import { writeJson } from "./catalog/mal-detail-cache.mjs";
import { workCapabilities } from "./catalog/work-capabilities.mjs";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const work = { entity_type: "WORK", mal_id: Number(option("mal")), episodes: Number(option("episodes")) };
if (![work.mal_id, work.episodes].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("Supply positive --mal and --episodes");
const directory = path.resolve(option("directory") || "storage/app/catalog/probes/mediawiki-batch/cache");
const report = await refreshMediawikiArcs([work], { directory, requestBudget: 1 });
const proof = { observedAt: new Date().toISOString(), mal_id: work.mal_id, directory, report, capabilities: workCapabilities(work), arcs: JSON.parse(work.arcs_json || "[]") };
writeJson(path.resolve("storage/app/catalog/probes/mediawiki-batch", work.mal_id + (report.httpRequests ? "-collection-proof.json" : "-resume-proof.json")), proof);
console.log(JSON.stringify({ mal_id: work.mal_id, attempted: report.attempted, updated: report.updated, httpRequests: report.httpRequests,
  applied: report.applied, capabilities: proof.capabilities, arcs: proof.arcs.map(arc => ({ name: arc.name, start: arc.startEp, end: arc.endEp, classification: arc.classification })) }));
if (report.errors.length) process.exitCode = 1;
