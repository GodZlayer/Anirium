import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readMediawikiArcs } from "./catalog/mediawiki-arc-reader.mjs";
import { sourceHttpError } from "./catalog/source-http-error.mjs";
import { writeJson } from "./catalog/mal-detail-cache.mjs";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const work = { entity_type: "WORK", mal_id: Number(option("mal")), episodes: Number(option("episodes")) };
if (![work.mal_id, work.episodes].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("Supply positive --mal and --episodes values");
const directory = path.resolve(option("output") || "storage/app/catalog/probes/mediawiki"), requests = [];
let nextAt = 0;
const result = await readMediawikiArcs(work, async value => {
  const url = new URL(value);
  if (!["https://query.wikidata.org", "https://www.wikidata.org", "https://en.wikipedia.org"].includes(url.origin)) throw new Error("Untrusted Wikimedia origin");
  await new Promise(resolve => setTimeout(resolve, Math.max(0, nextAt - Date.now())));
  nextAt = Date.now() + 1500;
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(25000), headers: {
    Accept: "application/json", "User-Agent": "AniriumCatalog/1.0 (https://anirium.com.br)",
  } });
  if (!response.ok) throw sourceHttpError(response, "Wikimedia source", Date.now());
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("Wikimedia response exceeds supported size");
  requests.push({ url: url.href, status: response.status, sha256: createHash("sha256").update(body).digest("hex") });
  return JSON.parse(body);
});
fs.mkdirSync(directory, { recursive: true });
writeJson(path.join(directory, `${work.mal_id}-reader-proof.json`), { requests, result });
console.log(JSON.stringify({ mal_id: result.mal_id, outcome: result.outcome, requests: requests.length,
  arcs: result.arcs.map(arc => ({ name: arc.name, start: arc.startEp, end: arc.endEp, classification: arc.classification, source: arc.source_url })) }));
